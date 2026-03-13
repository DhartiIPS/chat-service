import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginateMessagesDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  /** Opaque cursor (message UUID) returned by previous page. */
  @IsString()
  @IsOptional()
  cursor?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
