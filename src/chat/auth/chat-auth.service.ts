import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Socket } from 'socket.io';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { AUTH_CLIENT } from '../chat.constants';
import { AuthUser } from '../interfaces/auth-user.interface';

const TOKEN_TIMEOUT_MS = 8000;

@Injectable()
export class ChatAuthService {
  private readonly logger = new Logger(ChatAuthService.name);

  constructor(
    @Inject(AUTH_CLIENT)
    private readonly authClient: ClientProxy,
  ) {}

  async validateSocket(socket: Socket): Promise<AuthUser> {
    const token = this.extractToken(socket);

    this.logger.log(
      `[validateSocket] socket=${socket.id}\n` +
        `  auth.token  : "${token?.slice(0, 60)}..."\n` +
        `  resolved    : "${token?.slice(0, 60)}..."`,
    );

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    let payload: AuthUser;

    try {
      payload = await firstValueFrom<AuthUser>(
        this.authClient
          .send<AuthUser>({ cmd: 'verify_token' }, { token })
          .pipe(
            timeout(TOKEN_TIMEOUT_MS),
            catchError((err) => {
              const rpcMessage =
                err?.error?.message ??
                err?.message ??
                JSON.stringify(err);

              return throwError(() => new Error(rpcMessage));
            }),
          ),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : JSON.stringify(err);

      const isTimeout = message.toLowerCase().includes('timeout');

      const isConnRefused =
        message.toLowerCase().includes('econnrefused') ||
        message.toLowerCase().includes('connect');

      if (isTimeout || isConnRefused) {
        this.logger.error(
          `[validateSocket] ❌ AUTH-SERVICE UNREACHABLE socket=${socket.id}\n` +
            `  → Is auth-service running on ${
              process.env.AUTH_TCP_HOST ?? 'localhost'
            }:${process.env.AUTH_TCP_PORT ?? 5002}?\n` +
            `  → Raw error: ${message}`,
        );

        throw new UnauthorizedException(
          'Auth service unavailable — please try again',
        );
      }

      this.logger.error(
        `[validateSocket] ❌ TOKEN REJECTED socket=${socket.id}\n` +
          `  → Raw error: ${message}`,
      );

      throw new UnauthorizedException('Invalid or expired token');
    }

    
    if (!payload || payload.sub == null) {
      this.logger.error(
        `[validateSocket] ❌ BAD PAYLOAD socket=${socket.id}: ${JSON.stringify(
          payload,
        )}`,
      );

      throw new UnauthorizedException(
        'Invalid token payload from auth-service',
      );
    }
    if (!Array.isArray((payload as any).roles)) {
      const raw: unknown = (payload as any).role ?? (payload as any).roles;
      const roleStr = typeof raw === 'string' && raw ? raw.toLowerCase() : 'user';
      (payload as any).roles = roleStr === 'admin'
        ? ['admin', 'user']
        : [roleStr, 'user'];
    }

    this.logger.log(
      `[validateSocket]   OK socket=${socket.id} userId=${payload.sub} roles=${JSON.stringify((payload as any).roles)}`,
    );

    return payload;
  }

  private extractToken(socket: Socket): string | null {
    // socket.io auth object
    const fromAuth = (socket.handshake.auth as Record<string, unknown>)?.token;

    if (typeof fromAuth === 'string' && fromAuth) {
      return this.stripBearer(fromAuth);
    }

    // Authorization header
    const fromHeader = socket.handshake.headers.authorization?.split(' ')[1];

    if (fromHeader) {
      return this.stripBearer(fromHeader);
    }

    // Query fallback
    const fromQuery = socket.handshake.query?.token;

    if (typeof fromQuery === 'string' && fromQuery) {
      return this.stripBearer(fromQuery);
    }

    return null;
  }

  private stripBearer(token: string): string {
    return token.toLowerCase().startsWith('bearer ')
      ? token.slice(7).trim()
      : token.trim();
  }
}