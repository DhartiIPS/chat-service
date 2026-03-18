import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  senderId: string;

  /** Target user for a direct message. Mutually exclusive with roomId. */
  @IsString()
  @IsOptional()
  receiverId?: string;

  /** Target room for a group message. Mutually exclusive with receiverId. */
  @IsString()
  @IsOptional()
  roomId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;
}
