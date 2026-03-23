import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Chat } from '../chat/entity/chat.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  // host: process.env.DB_HOST,
  // port: Number(process.env.DB_PORT),
  // username: process.env.DB_USERNAME,
  // password: process.env.DB_PASSWORD,
  // database: process.env.DB_NAME,
  url: process.env.USER_URL,
  entities: [Chat],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
