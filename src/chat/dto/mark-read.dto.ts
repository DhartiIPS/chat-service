import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MarkReadDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  /** When provided, only messages up to and including this ID are marked. */
  @IsString()
  @IsOptional()
  lastMessageId?: string;
}
