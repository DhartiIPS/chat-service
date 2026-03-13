import {
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatAuthService } from './auth/chat-auth.service';
import { Roles } from './decorators/roles.decorator';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { LeaveRoomDto } from './dto/leave-room.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { PaginateMessagesDto } from './dto/paginate-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { TypingDto } from './dto/typing.dto';
import { WsExceptionFilter } from './filters/ws-exception.filter';
import { WsJwtAuthGuard } from './guards/ws-jwt-auth.guard';
import { WsRolesGuard } from './guards/ws-roles.guard';
import { AuthUser } from './interfaces/auth-user.interface';
import { ChatService } from './chat.service';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
@UseFilters(WsExceptionFilter)
@UseGuards(WsJwtAuthGuard, WsRolesGuard)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }),
)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly presenceCounter = new Map<string, number>();

  constructor(
    private readonly chatService: ChatService,
    private readonly chatAuthService: ChatAuthService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.chatAuthService.validateSocket(client);
      client.data.user = user;
      // Each user joins a private room named after their own userId so DMs
      // can be delivered by emitting to recipient.sub without extra join/leave.
      await client.join(user.sub);
      this.bumpPresence(user.sub, 1);
      this.server.emit('presence_online', { userId: user.sub });
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data.user as AuthUser | undefined;
    if (!user) return;

    const count = this.bumpPresence(user.sub, -1);
    if (count === 0) {
      this.server.emit('presence_offline', { userId: user.sub });
    }
  }

  // ─── Room management ──────────────────────────────────────────────────────

  @SubscribeMessage('join_room')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const user = client.data.user as AuthUser;
    const role = this.toRoomRole(user.roles);
    await this.chatService.joinRoom(dto.roomId, user.sub, role);
    await client.join(dto.roomId);

    this.server.to(dto.roomId).emit('room_user_joined', {
      roomId: dto.roomId,
      userId: user.sub,
      role,
    });

    return { ok: true, roomId: dto.roomId };
  }

  @SubscribeMessage('leave_room')
  async leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: LeaveRoomDto,
  ) {
    const user = client.data.user as AuthUser;
    await this.chatService.leaveRoom(dto.roomId, user.sub);
    await client.leave(dto.roomId);
    this.server.to(dto.roomId).emit('room_user_left', {
      roomId: dto.roomId,
      userId: user.sub,
    });
    return { ok: true };
  }

  // ─── Messaging ────────────────────────────────────────────────────────────

  /**
   * Send a message.
   * - Room message  → emits `message_created` to the room Socket.IO room.
   * - Direct message → emits `message_created` to sender's AND receiver's
   *   personal rooms (each user auto-joins their own userId room on connect).
   *   This guarantees delivery even if the receiver never explicitly joined
   *   the conversationId room.
   */
  @SubscribeMessage('message')
  @Roles('user', 'admin')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const user = client.data.user as AuthUser;
    if (dto.senderId !== user.sub) {
      throw new WsException('senderId must match authenticated user');
    }

    const created = await this.chatService.sendMessage(dto);

    if (created.roomId) {
      // Group / room message — broadcast to everyone in the room.
      this.server.to(created.roomId).emit('message_created', created);
    } else if (created.receiverId) {
      // Direct message — deliver to both participants via their personal rooms.
      // Using `server.to()` chaining so a single emit reaches both sockets.
      this.server
        .to(created.senderId)
        .to(created.receiverId)
        .emit('message_created', created);
    }

    return { ok: true, message: created };
  }

  @SubscribeMessage('edit_message')
  @Roles('user', 'admin')
  async editMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: EditMessageDto,
  ) {
    const user = client.data.user as AuthUser;
    const updated = await this.chatService.editMessage(
      dto.messageId,
      user.sub,
      dto.message,
      user.roles.includes('admin'),
    );

    if (updated.roomId) {
      this.server.to(updated.roomId).emit('message_updated', updated);
    } else if (updated.receiverId) {
      this.server
        .to(updated.senderId)
        .to(updated.receiverId)
        .emit('message_updated', updated);
    }

    return { ok: true, message: updated };
  }

  @SubscribeMessage('delete_message')
  @Roles('user', 'admin')
  async deleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: DeleteMessageDto,
  ) {
    const user = client.data.user as AuthUser;
    const deleted = await this.chatService.deleteMessage(
      dto.messageId,
      user.sub,
      user.roles.includes('admin'),
    );

    // Notify room or both DM participants.
    if (deleted?.roomId) {
      this.server
        .to(deleted.roomId)
        .emit('message_deleted', { messageId: dto.messageId });
    } else if (deleted?.receiverId) {
      this.server
        .to(deleted.senderId)
        .to(deleted.receiverId)
        .emit('message_deleted', { messageId: dto.messageId });
    } else {
      // Fallback — broadcast (matches old behaviour for unknown targets).
      this.server.emit('message_deleted', { messageId: dto.messageId });
    }

    return { ok: true };
  }

  // ─── Typing indicator ─────────────────────────────────────────────────────

  @SubscribeMessage('typing')
  @Roles('user', 'admin')
  async typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TypingDto,
  ) {
    const user = client.data.user as AuthUser;
    if (!dto.roomId && !dto.receiverId) {
      throw new WsException('Either roomId or receiverId is required');
    }

    if (dto.roomId) {
      // Broadcast to everyone else in the room.
      client.to(dto.roomId).emit('typing', {
        roomId: dto.roomId,
        userId: user.sub,
        isTyping: dto.isTyping,
      });
    } else if (dto.receiverId) {
      // Send only to the receiver's personal room (exclude self).
      this.server.to(dto.receiverId).emit('typing', {
        senderId: user.sub,
        receiverId: dto.receiverId,
        isTyping: dto.isTyping,
      });
    }

    return { ok: true };
  }

  // ─── Read receipts ────────────────────────────────────────────────────────

  @SubscribeMessage('mark_read')
  @Roles('user', 'admin')
  async markRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MarkReadDto,
  ) {
    const user = client.data.user as AuthUser;
    const updatedCount = await this.chatService.markAsRead(
      dto.roomId,
      user.sub,
      dto.lastMessageId,
    );
    this.server.to(dto.roomId).emit('messages_read', {
      roomId: dto.roomId,
      userId: user.sub,
      updatedCount,
    });
    return { ok: true, updatedCount };
  }

  // ─── Fetch history ────────────────────────────────────────────────────────

  /** Paginate messages in a group room (requires membership). */
  @SubscribeMessage('get_messages')
  @Roles('user', 'admin')
  async getMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: PaginateMessagesDto,
  ) {
    const user = client.data.user as AuthUser;
    return this.chatService.getMessagesByRoom(
      dto.roomId,
      user.sub,
      dto.cursor,
      dto.limit ?? 20,
    );
  }

  /**
   * Paginate a direct-message conversation between the authenticated user
   * and `receiverId`.  No room membership required.
   */
  @SubscribeMessage('get_direct_messages')
  @Roles('user', 'admin')
  async getDirectMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { receiverId: string; cursor?: string; limit?: number },
  ) {
    const user = client.data.user as AuthUser;
    return this.chatService.getMessages(
      user.sub,
      dto.receiverId,
      dto.cursor,
      dto.limit ?? 20,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private bumpPresence(userId: string, delta: number): number {
    const current = this.presenceCounter.get(userId) ?? 0;
    const next = Math.max(0, current + delta);
    this.presenceCounter.set(userId, next);
    return next;
  }

  private toRoomRole(roles: string[]): 'admin' | 'user' {
    return roles.includes('admin') ? 'admin' : 'user';
  }
}
