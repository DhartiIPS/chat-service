import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { PaginateMessagesDto } from './dto/paginate-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatService } from './chat.service';

/**
 * Microservice controller — handles TCP/Redis patterns from the API gateway.
 * NestJS only registers the *last* @MessagePattern when multiple decorators
 * are stacked on the same method, so each pattern gets its own handler.
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─── Send ─────────────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'send_message' })
  async handleSendMessage(@Payload() payload: SendMessageDto) {
    return this.chatService.sendMessage(payload);
  }

  // Legacy alias kept for backward compatibility.
  @MessagePattern({ cmd: 'message' })
  async handleSendMessageAlias(@Payload() payload: SendMessageDto) {
    return this.chatService.sendMessage(payload);
  }

  // ─── Fetch ────────────────────────────────────────────────────────────────

  /**
   * Fetch a paginated direct-message conversation between two users.
   * Returns { items: Chat[], nextCursor: string | null }.
   */
  @MessagePattern({ cmd: 'get_direct_messages' })
  async getDirectMessages(
    @Payload()
    payload: {
      senderId: string;
      receiverId: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    return this.chatService.getMessages(
      payload.senderId,
      payload.receiverId,
      payload.cursor,
      payload.limit ?? 20,
    );
  }

  // Legacy alias.
  @MessagePattern({ cmd: 'get_messages' })
  async getMessagesAlias(
    @Payload()
    payload: {
      senderId: string;
      receiverId: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    return this.chatService.getMessages(
      payload.senderId,
      payload.receiverId,
      payload.cursor,
      payload.limit ?? 20,
    );
  }

  @MessagePattern({ cmd: 'get_room_messages' })
  async getRoomMessages(
    @Payload() payload: PaginateMessagesDto & { userId: string },
  ) {
    return this.chatService.getMessagesByRoom(
      payload.roomId,
      payload.userId,
      payload.cursor,
      payload.limit ?? 20,
    );
  }

  // ─── Edit / Delete ────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'edit_message' })
  async editMessage(
    @Payload()
    payload: EditMessageDto & { userId: string; isAdmin?: boolean },
  ) {
    return this.chatService.editMessage(
      payload.messageId,
      payload.userId,
      payload.message,
      payload.isAdmin ?? false,
    );
  }

  @MessagePattern({ cmd: 'delete_message' })
  async deleteMessage(
    @Payload()
    payload: DeleteMessageDto & { userId: string; isAdmin?: boolean },
  ) {
    await this.chatService.deleteMessage(
      payload.messageId,
      payload.userId,
      payload.isAdmin ?? false,
    );
    return { ok: true };
  }

  // ─── Read receipts ────────────────────────────────────────────────────────

  @MessagePattern({ cmd: 'mark_messages_read' })
  async markRead(
    @Payload()
    payload: MarkReadDto & { userId: string },
  ) {
    const updatedCount = await this.chatService.markAsRead(
      payload.roomId,
      payload.userId,
      payload.lastMessageId,
    );
    return { ok: true, updatedCount };
  }

  @MessagePattern({ cmd: 'mark_direct_messages_read' })
  async markDirectRead(
    @Payload()
    payload: { senderId: string; receiverId: string; lastMessageId?: string },
  ) {
    const updatedCount = await this.chatService.markAsReadDirect(
      payload.senderId,
      payload.receiverId,
      payload.lastMessageId,
    );
    return { ok: true, updatedCount };
  }
}
