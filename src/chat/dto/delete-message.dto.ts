import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteMessageDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;
}
