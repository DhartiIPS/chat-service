import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const tcpHost = configService.get<string>('CHAT_TCP_HOST', '0.0.0.0');
  const tcpPort = configService.get<number>('CHAT_TCP_PORT', 4002);

  // Connect microservice
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: tcpHost,
      port: tcpPort,
    },
  });

  // Start microservices
  await app.startAllMicroservices();

  // HTTP server (REST APIs)
  const httpPort = configService.get<number>('CHAT_HTTP_PORT', 5009);
  await app.listen(httpPort);

  console.log(`🚀 Chat HTTP server running on port ${httpPort}`);
  console.log(`🚀 Chat TCP microservice running on ${tcpHost}:${tcpPort}`);
}

bootstrap();
