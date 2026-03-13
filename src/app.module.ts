import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatModule } from './chat/chat.module';
import { Chat } from './chat/entity/chat.entity';
import { ChatRoomMember } from './chat/entity/chat-room-member.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host:     cfg.get('DB_HOST', 'localhost'),
        port:     cfg.get<number>('DB_PORT', 5432),
        username: cfg.get('DB_USERNAME', 'postgres'),
        password: cfg.get('DB_PASSWORD', 'ips12345'),
        database: cfg.get('DB_NAME', 'chat_db'),
        entities: [Chat, ChatRoomMember],
        synchronize: false,
        ssl: false,
      }),
    }),

    ChatModule,
  ],
})
export class AppModule {}
