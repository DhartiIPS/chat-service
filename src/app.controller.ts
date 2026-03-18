import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat/chat.service';
import { SendMessageDto } from './chat/dto/send-message.dto';

@Controller('api')
export class AppController {
  constructor(
    private readonly pusherService: ChatService,
  ) { }

  @Post('message')
  async messages(@Body() dto: SendMessageDto) {
    await this.pusherService.sendMessage(dto); //  use sendMessage
    return { success: true };
  }

}
