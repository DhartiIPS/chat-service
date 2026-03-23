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
import { AuthUser } from './interfaces/auth-user.interface';
import { ChatService } from './chat.service';

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: true, credentials: true },
})
@UseFilters(WsExceptionFilter)
@UseGuards(WsJwtAuthGuard)
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

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.chatAuthService.validateSocket(client);
      client.data.user = user;
      await client.join(String(user.sub));
      this.bumpPresence(String(user.sub), 1);
      this.server.emit('presence_online', { userId: user.sub });
      const delivered = await this.chatService.markAsDelivered(String(user.sub));
      if (delivered.length > 0) {
        // Group message IDs by senderId so each sender gets one batched event.
        const bySender = new Map<string, string[]>();
        for (const { id, senderId } of delivered) {
          const ids = bySender.get(senderId) ?? [];
          ids.push(id);
          bySender.set(senderId, ids);
        }
        for (const [senderId, messageIds] of bySender) {
          this.server.to(senderId).emit('message_status_updated', {
            messageIds,
            status: 'delivered',
          });
        }
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data.user as AuthUser | undefined;
    if (!user) return;

    const count = this.bumpPresence(String(user.sub), -1);
    if (count === 0) {
      this.server.emit('presence_offline', { userId: user.sub });
    }
  }

  @SubscribeMessage('join_room')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const user = client.data.user as AuthUser;
    const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [String(user.role ?? 'user')];
    const role = this.toRoomRole(userRoles);
    await this.chatService.joinRoom(dto.roomId, String(user.sub), role);
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
    await this.chatService.leaveRoom(dto.roomId, String(user.sub));
    await client.leave(dto.roomId);
    this.server.to(dto.roomId).emit('room_user_left', {
      roomId: dto.roomId,
      userId: user.sub,
    });
    return { ok: true };
  }

  @SubscribeMessage('message')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const user = client.data.user as AuthUser;
    if (dto.senderId !== String(user.sub)) {
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
        .to(String(created.senderId))
        .to(String(created.receiverId))
        .emit('message_created', created);
    }

    return { ok: true, message: created };
  }

  @SubscribeMessage('edit_message')
  async editMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: EditMessageDto,
  ) {
    const user = client.data.user as AuthUser;
    const roles: string[] = Array.isArray(user.roles) ? user.roles : [String(user.role ?? 'user')];
    const updated = await this.chatService.editMessage(
      dto.messageId,
      String(user.sub),
      dto.message,
      roles.includes('admin'),
    );

    if (updated.roomId) {
      this.server.to(updated.roomId).emit('message_updated', updated);
    } else if (updated.receiverId) {
      this.server
        .to(String(updated.senderId))
        .to(String(updated.receiverId))
        .emit('message_updated', updated);
    }

    return { ok: true, message: updated };
  }

  @SubscribeMessage('delete_message')
  async deleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: DeleteMessageDto,
  ) {
    const user = client.data.user as AuthUser;
    const delRoles: string[] = Array.isArray(user.roles) ? user.roles : [String(user.role ?? 'user')];
    const deleted = await this.chatService.deleteMessage(
      dto.messageId,
      String(user.sub),
      delRoles.includes('admin'),
    );

    // Notify room or both DM participants.
    if (deleted?.roomId) {
      this.server
        .to(deleted.roomId)
        .emit('message_deleted', { messageId: dto.messageId });
    } else if (deleted?.receiverId) {
      this.server
        .to(String(deleted.senderId))
        .to(String(deleted.receiverId))
        .emit('message_deleted', { messageId: dto.messageId });
    } else {
      // Fallback — broadcast (matches old behaviour for unknown targets).
      this.server.emit('message_deleted', { messageId: dto.messageId });
    }

    return { ok: true };
  }

  @SubscribeMessage('typing')
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
      this.server.to(dto.receiverId).emit('typing', {
        senderId: user.sub,
        receiverId: dto.receiverId,
        isTyping: dto.isTyping,
      });
    }

    return { ok: true };
  }

  @SubscribeMessage('mark_read')
  async markRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MarkReadDto,
  ) {
    const user = client.data.user as AuthUser;
    const updatedCount = await this.chatService.markAsRead(
      dto.roomId,
      String(user.sub),
      dto.lastMessageId,
    );
    this.server.to(dto.roomId).emit('messages_read', {
      roomId: dto.roomId,
      userId: user.sub,
      updatedCount,
    });
    return { ok: true, updatedCount };
  }

  @SubscribeMessage('get_messages')
  async getMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: PaginateMessagesDto,
  ) {
    const user = client.data.user as AuthUser;
    return this.chatService.getMessagesByRoom(
      dto.roomId,
      String(user.sub),
      dto.cursor,
      dto.limit ?? 20,
    );
  }

  @SubscribeMessage('get_direct_messages')
  async getDirectMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { receiverId: string; cursor?: string; limit?: number },
  ) {
    const user = client.data.user as AuthUser;
    return this.chatService.getMessages(
      String(user.sub),
      dto.receiverId,
      dto.cursor,
      dto.limit ?? 20,
    );
  }
  @SubscribeMessage('mark_direct_read')
  async markDirectRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { senderId: string },
  ) {
    const user   = client.data.user as AuthUser;
    const reader = String(user.sub);

    const updatedCount = await this.chatService.markAsReadDirect(
      dto.senderId,  // the person whose messages we are reading
      reader,        // us — the recipient marking them as read
    );

    if (updatedCount > 0) {
      this.server.to(dto.senderId).emit('direct_messages_read', {
        senderId: dto.senderId,
        readerId: reader,
        status:   'read',
      });
    }

    return { ok: true, updatedCount };
  }

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