import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class TypingDto {
  /** Provide for group-room typing events. */
  @IsString()
  @IsOptional()
  roomId?: string;

  /** Provide for direct-message typing events. */
  @IsString()
  @IsOptional()
  receiverId?: string;

  @IsBoolean()
  isTyping: boolean;
}

export class RegisterUserDto {
  @IsString()
  userId: string;
}