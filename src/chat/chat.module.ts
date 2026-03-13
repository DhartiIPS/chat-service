import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatAuthService } from './auth/chat-auth.service';
import { AUTH_CLIENT, CHAT_EVENTS_CLIENT } from './chat.constants';
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
      // Auth microservice
      {
        name: AUTH_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (cfg: ConfigService) => {
          const transport =
            cfg.get<string>('AUTH_TRANSPORT') === 'redis'
              ? Transport.REDIS
              : Transport.TCP;
          return {
            transport,
            options:
              transport === Transport.REDIS
                ? { host: cfg.get('REDIS_HOST', 'localhost'), port: cfg.get<number>('REDIS_PORT', 6379) }
                : { host: cfg.get('AUTH_TCP_HOST', 'localhost'), port: cfg.get<number>('AUTH_TCP_PORT', 4002) },
          };
        },
      },

      // Chat-events microservice (downstream domain events)
      {
        name: CHAT_EVENTS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (cfg: ConfigService) => {
          const transport =
            cfg.get<string>('CHAT_EVENTS_TRANSPORT') === 'redis'
              ? Transport.REDIS
              : Transport.TCP;
          return {
            transport,
            options:
              transport === Transport.REDIS
                ? { host: cfg.get('REDIS_HOST', 'localhost'), port: cfg.get<number>('REDIS_PORT', 6379) }
                : { host: cfg.get('CHAT_EVENTS_TCP_HOST', 'localhost'), port: cfg.get<number>('CHAT_EVENTS_TCP_PORT', 4010) },
          };
        },
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
