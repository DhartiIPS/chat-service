import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatAuthService } from './auth/chat-auth.service';
// ✅ FIX: removed unused CHAT_EVENTS_CLIENT import — it was imported but never
// registered in ClientsModule, and nothing injected it. Leaving dead imports
// causes confusion about whether something is intentionally missing.
import { AUTH_CLIENT } from './chat.constants';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatRoomMember } from './entity/chat-room-member.entity';
import { Chat } from './entity/chat.entity';
import { WsExceptionFilter } from './filters/ws-exception.filter';
import { WsJwtAuthGuard } from './guards/ws-jwt-auth.guard';
import { WsRolesGuard } from './guards/ws-roles.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Chat, ChatRoomMember]),

    ClientsModule.registerAsync([
      {
        name: AUTH_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('AUTH_TCP_HOST') || 'localhost',
            port: parseInt(config.get<string>('AUTH_TCP_PORT') || '5002'),
          },
        }),
      },
    ]),
  ],

  providers: [
    ChatService,
    ChatGateway,
    ChatAuthService,
    WsJwtAuthGuard,
    WsRolesGuard,
    WsExceptionFilter,
  ],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}