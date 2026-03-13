import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Socket } from 'socket.io';
import { firstValueFrom, timeout } from 'rxjs';
import { AUTH_CLIENT } from '../chat.constants';
import { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class ChatAuthService {
  private readonly logger = new Logger(ChatAuthService.name);

  constructor(
    @Inject(AUTH_CLIENT) private readonly authClient: ClientProxy,
  ) {}

  /**
   * Extracts the Bearer token from a Socket.IO handshake and validates it
   * against the auth microservice.  Throws if invalid.
   */
  async validateSocket(client: Socket): Promise<AuthUser> {
    const token = this.extractToken(client);

    if (!token) {
      throw new Error('Missing auth token');
    }

    try {
      const user = await firstValueFrom<AuthUser>(
        this.authClient
          .send<AuthUser>({ cmd: 'validate_token' }, { token })
          .pipe(timeout(5_000)),
      );

      if (!user?.sub) {
        throw new Error('Invalid token payload');
      }

      return user;
    } catch (err) {
      this.logger.warn(`[ChatAuthService] Token validation failed: ${(err as Error).message}`);
      throw new Error('Unauthorized');
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private extractToken(client: Socket): string | null {
    // 1. socket.io auth object  { auth: { token: '...' } }
    const authToken = client.handshake?.auth?.token as string | undefined;
    if (authToken) return this.stripBearer(authToken);

    // 2. Authorization header
    const header =
      (client.handshake?.headers?.authorization as string | undefined) ?? '';
    if (header.toLowerCase().startsWith('bearer ')) {
      return header.slice(7).trim();
    }

    // 3. Query-string fallback ?token=...
    const query = client.handshake?.query?.token;
    if (typeof query === 'string' && query) return query;

    return null;
  }

  private stripBearer(value: string): string {
    return value.toLowerCase().startsWith('bearer ')
      ? value.slice(7).trim()
      : value.trim();
  }
}
