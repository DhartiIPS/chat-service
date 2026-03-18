import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('chat_room_members')
@Index(['roomId', 'userId'], { unique: true })
export class ChatRoomMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  roomId: string;

  @Column({ type: 'varchar' })
  @Index()
  userId: string;

  /** Role within this specific room. */
  @Column({ type: 'varchar', default: 'user' })
  role: 'admin' | 'user' | 'doctor' | 'patient';

  /** Null means the member is currently active in the room. */
  @Column({ nullable: true, type: 'timestamptz' })
  leftAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
