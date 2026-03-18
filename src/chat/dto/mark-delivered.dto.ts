import { IsOptional, IsString } from 'class-validator';

export class MarkDeliveredDto {
  @IsString()
  recipientId: string;
  
  @IsOptional()
  @IsString()
  senderId?: string;
}