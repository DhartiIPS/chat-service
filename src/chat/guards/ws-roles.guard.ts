import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ROLES_KEY } from '../chat.constants';
import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * WebSocket guard that enforces role-based access on handlers decorated
 * with @Roles(...).  If no roles are specified the handler is open to all
 * authenticated users.
 */
@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator — allow any authenticated user.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const client: Socket = context.switchToWs().getClient<Socket>();
    const user = client.data?.user as AuthUser | undefined;

    if (!user) {
      throw new WsException('Unauthorized');
    }

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
    if (!hasRole) {
      throw new WsException('Forbidden: insufficient role');
    }

    return true;
  }
}
