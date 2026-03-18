import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {

  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: config.get('CHAT_TCP_HOST', '0.0.0.0'),
      port: config.get('CHAT_TCP_PORT', 4002),
    },
  });

  await app.startAllMicroservices();

  await app.listen(config.get('CHAT_HTTP_PORT', 5009));

}
bootstrap();
