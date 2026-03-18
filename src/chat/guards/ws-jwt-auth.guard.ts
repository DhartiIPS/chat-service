import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ChatAuthService } from '../auth/chat-auth.service';

/**
 * WebSocket guard that validates the JWT on every incoming message.
 * On connection the user is already set on client.data.user by
 * ChatGateway.handleConnection — this guard is a safety net for individual
 * message handlers.
 */
@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private readonly chatAuthService: ChatAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();

    // Re-use the user that was validated at connection time.
    if (client.data?.user) {
      return true;
    }

    // Fallback: validate on the fly (e.g. after a reconnect edge-case).
    try {
      const user = await this.chatAuthService.validateSocket(client);
      client.data.user = user;
      return true;
    } catch {
      throw new WsException('Unauthorized');
    }
  }
}
