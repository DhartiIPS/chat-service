import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatRoomMember } from './entity/chat-room-member.entity';
import { Chat } from './entity/chat.entity';
import { PaginatedResult } from './interfaces/paginated-result.interface';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat)
    private readonly chatRepository: Repository<Chat>,
    @InjectRepository(ChatRoomMember)
    private readonly memberRepository: Repository<ChatRoomMember>,
  ) {}

  // ─── Room membership ──────────────────────────────────────────────────────

  async joinRoom(
    roomId: string,
    userId: string,
    role: 'admin' | 'user' = 'user',
  ): Promise<ChatRoomMember> {
    const existing = await this.memberRepository.findOne({
      where: { roomId, userId },
    });

    if (!existing) {
      return this.memberRepository.save(
        this.memberRepository.create({ roomId, userId, role, leftAt: null }),
      );
    }

    existing.role = role;
    existing.leftAt = null;
    return this.memberRepository.save(existing);
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const member = await this.memberRepository.findOne({
      where: { roomId, userId, leftAt: IsNull() },
    });
    if (!member) return;

    member.leftAt = new Date();
    await this.memberRepository.save(member);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async sendMessage(payload: SendMessageDto): Promise<Chat> {
    if (payload.roomId) {
      await this.ensureActiveMember(payload.roomId, payload.senderId);
    }

    const chat = this.chatRepository.create({
      roomId: payload.roomId ?? null,
      senderId: payload.senderId,
      receiverId: payload.receiverId ?? null,
      conversationId: payload.receiverId
        ? this.getConversationId(payload.senderId, payload.receiverId)
        : null,
      message: this.sanitizeMessage(payload.message),
      isEdited: false,
      editedAt: null,
      readAt: null,
      deletedAt: null,
    });

    return this.chatRepository.save(chat);
  }

  async editMessage(
    messageId: string,
    userId: string,
    message: string,
    isAdmin = false,
  ): Promise<Chat> {
    const chat = await this.chatRepository.findOne({
      where: { id: messageId },
      withDeleted: false,
    });
    if (!chat) throw new NotFoundException('Message not found');
    if (chat.senderId !== userId && !isAdmin) {
      throw new ForbiddenException('Cannot edit this message');
    }

    chat.message = this.sanitizeMessage(message);
    chat.isEdited = true;
    chat.editedAt = new Date();
    return this.chatRepository.save(chat);
  }

  /**
   * Soft-delete a message.
   * Returns the entity so the gateway can resolve emit targets (roomId /
   * receiverId) without an extra DB query.
   */
  async deleteMessage(
    messageId: string,
    userId: string,
    isAdmin = false,
  ): Promise<Chat> {
    const chat = await this.chatRepository.findOne({ where: { id: messageId } });
    if (!chat) throw new NotFoundException('Message not found');
    if (chat.senderId !== userId && !isAdmin) {
      throw new ForbiddenException('Cannot delete this message');
    }

    await this.chatRepository.softDelete({ id: messageId });
    return chat; // return before soft-delete so targets are still available
  }

  // ─── Read receipts ────────────────────────────────────────────────────────

  /** Mark messages as read inside a group room (membership enforced). */
  async markAsRead(
    roomId: string,
    userId: string,
    lastMessageId?: string,
  ): Promise<number> {
    await this.ensureActiveMember(roomId, userId);
    return this._markRead({ roomId }, userId, lastMessageId);
  }

  /**
   * Mark direct messages as read.
   * No room membership required — scoped to the conversationId.
   */
  async markAsReadDirect(
    senderId: string,
    receiverId: string,
    lastMessageId?: string,
  ): Promise<number> {
    const conversationId = this.getConversationId(senderId, receiverId);
    return this._markRead({ conversationId }, receiverId, lastMessageId);
  }

  // ─── Fetch history ────────────────────────────────────────────────────────

  /** Direct messages between two users, newest-first with cursor pagination. */
  async getMessages(
    senderId: string,
    receiverId: string,
    cursor?: string,
    limit = 20,
  ): Promise<PaginatedResult<Chat>> {
    const conversationId = this.getConversationId(senderId, receiverId);
    return this.getMessagesByConversation(conversationId, cursor, limit);
  }

  /** Room messages, newest-first with cursor pagination (membership enforced). */
  async getMessagesByRoom(
    roomId: string,
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<PaginatedResult<Chat>> {
    await this.ensureActiveMember(roomId, userId);

    let qb = this.chatRepository
      .createQueryBuilder('chat')
      .where('chat.roomId = :roomId', { roomId })
      .andWhere('chat.deletedAt IS NULL')
      .orderBy('chat.createdAt', 'DESC')
      .addOrderBy('chat.id', 'DESC')
      .take(limit + 1);

    qb = await this.applyCursor(qb, cursor);

    const rows = await qb.getMany();
    return this.paginate(rows, limit);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getMessagesByConversation(
    conversationId: string,
    cursor?: string,
    limit = 20,
  ): Promise<PaginatedResult<Chat>> {
    let qb = this.chatRepository
      .createQueryBuilder('chat')
      .where('chat.conversationId = :conversationId', { conversationId })
      .andWhere('chat.deletedAt IS NULL')
      .orderBy('chat.createdAt', 'DESC')
      .addOrderBy('chat.id', 'DESC')
      .take(limit + 1);

    qb = await this.applyCursor(qb, cursor);

    const rows = await qb.getMany();
    return this.paginate(rows, limit);
  }

  private async _markRead(
    scope: { roomId?: string; conversationId?: string },
    readerId: string,
    lastMessageId?: string,
  ): Promise<number> {
    const qb = this.chatRepository
      .createQueryBuilder()
      .update(Chat)
      .set({ readAt: new Date() })
      .andWhere('senderId != :readerId', { readerId })
      .andWhere('readAt IS NULL');

    if (scope.roomId) {
      qb.where('roomId = :roomId', { roomId: scope.roomId });
    } else if (scope.conversationId) {
      qb.where('conversationId = :conversationId', {
        conversationId: scope.conversationId,
      });
    }

    if (lastMessageId) {
      const cursor = await this.chatRepository.findOne({
        where: { id: lastMessageId },
      });
      if (cursor) {
        qb.andWhere('createdAt <= :cursorDate', {
          cursorDate: cursor.createdAt,
        });
      }
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  private async applyCursor(
    qb: ReturnType<Repository<Chat>['createQueryBuilder']>,
    cursor?: string,
  ) {
    if (!cursor) return qb;

    const cursorMessage = await this.chatRepository.findOne({
      where: { id: cursor },
    });
    if (!cursorMessage) return qb;

    return qb.andWhere(
      '(chat.createdAt < :cursorCreatedAt OR (chat.createdAt = :cursorCreatedAt AND chat.id < :cursorId))',
      { cursorCreatedAt: cursorMessage.createdAt, cursorId: cursorMessage.id },
    );
  }

  private paginate<T>(rows: T[], limit: number): PaginatedResult<T> {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? (items[items.length - 1] as Record<string, unknown>)?.['id'] as string ?? null
      : null;
    return { items, nextCursor };
  }

  private async ensureActiveMember(roomId: string, userId: string): Promise<void> {
    const membership = await this.memberRepository.findOne({
      where: { roomId, userId, leftAt: IsNull() },
    });
    if (!membership) {
      throw new ForbiddenException('User is not a member of this room');
    }
  }

  private sanitizeMessage(message: string): string {
    return message.trim().replace(/\s+/g, ' ');
  }

  private getConversationId(userA: string, userB: string): string {
    return [userA, userB].sort().join('_');
  }
}
