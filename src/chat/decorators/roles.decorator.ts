import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../chat.constants';

/** Attach allowed roles to a WebSocket handler. Used by WsRolesGuard. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
