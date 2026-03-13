import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { PaginateMessagesDto } from './dto/paginate-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @MessagePattern({ cmd: 'send_message' })
  async handleSendMessage(@Payload() payload: SendMessageDto) {
    return this.chatService.sendMessage(payload);
  }

  @MessagePattern({ cmd: 'message' })
  async handleSendMessageAlias(@Payload() payload: SendMessageDto) {
    return this.chatService.sendMessage(payload);
  }
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
