import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MessageStatus } from '../enum/message-status.enum';

@Entity('chat_messages')
@Index(['conversationId', 'createdAt'])
@Index(['roomId', 'createdAt'])
export class Chat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Populated for group/room messages. */
  @Column({ nullable: true, type: 'varchar' })
  @Index()
  roomId: string | null;

  /** Populated for direct messages. */
  @Column({ nullable: true, type: 'varchar' })
  receiverId: string | null;

  @Column({ type: 'varchar' })
  @Index()
  senderId: string;

  @Column({ nullable: true, type: 'varchar' })
  @Index()
  conversationId: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: false })
  isEdited: boolean;

  @Column({ nullable: true, type: 'timestamptz' })
  editedAt: Date | null;

  @Column({ nullable: true, type: 'timestamptz' })
  readAt: Date | null;
  
  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.SENT,
  })
  @Index()
  status: MessageStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /** Soft-delete — rows are retained for audit; use withDeleted to include. */
  @DeleteDateColumn({ nullable: true, type: 'timestamptz' })
  deletedAt: Date | null;
}
