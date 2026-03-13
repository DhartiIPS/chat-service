import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Global WebSocket exception filter.
 * Catches WsException (and any unexpected Error) and emits a structured
 * `exception` event back to the offending client instead of crashing the
 * gateway process.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    let message: string;
    let statusCode: number;

    if (exception instanceof WsException) {
      const error = exception.getError();
      message =
        typeof error === 'string'
          ? error
          : (error as { message?: string })?.message ?? 'WebSocket error';
      statusCode = 400;
    } else if (exception instanceof Error) {
      message = exception.message || 'Internal server error';
      statusCode = 500;
      this.logger.error(`[WsExceptionFilter] Unhandled: ${exception.stack}`);
    } else {
      message = 'Unknown error';
      statusCode = 500;
    }

    client.emit('exception', { statusCode, message });
  }
}
