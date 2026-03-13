import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatRoomMember } from './entity/chat-room-member.entity';
import { Chat } from './entity/chat.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockChat = (overrides: Partial<Chat> = {}): Chat =>
  ({
    id: 'msg-1',
    senderId: 'u1',
    receiverId: 'u2',
    roomId: null,
    conversationId: 'u1_u2',
    message: 'hello',
    isEdited: false,
    editedAt: null,
    readAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  } as Chat);

const mockMember = (overrides: Partial<ChatRoomMember> = {}): ChatRoomMember =>
  ({
    id: 'mem-1',
    roomId: 'room-1',
    userId: 'u1',
    role: 'user',
    leftAt: null,
    joinedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ChatRoomMember);

// ── Repo factory ──────────────────────────────────────────────────────────────

const makeQb = () => {
  const qb: Record<string, jest.Mock> = {};
  const chain = [
    'where', 'andWhere', 'orWhere', 'orderBy', 'addOrderBy',
    'take', 'update', 'set',
  ];
  chain.forEach((m) => { qb[m] = jest.fn().mockReturnThis(); });
  qb['getMany']  = jest.fn().mockResolvedValue([]);
  qb['execute']  = jest.fn().mockResolvedValue({ affected: 0 });
  return qb;
};

const chatRepoFactory = () => ({
  create:               jest.fn(),
  save:                 jest.fn(),
  findOne:              jest.fn(),
  softDelete:           jest.fn(),
  createQueryBuilder:   jest.fn().mockReturnValue(makeQb()),
});

const memberRepoFactory = () => ({
  create:    jest.fn(),
  save:      jest.fn(),
  findOne:   jest.fn(),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;
  let chatRepo: ReturnType<typeof chatRepoFactory>;
  let memberRepo: ReturnType<typeof memberRepoFactory>;

  beforeEach(async () => {
    chatRepo   = chatRepoFactory();
    memberRepo = memberRepoFactory();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(Chat),           useValue: chatRepo },
        { provide: getRepositoryToken(ChatRoomMember), useValue: memberRepo },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => expect(service).toBeDefined());

  // ── sendMessage ─────────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('creates and saves a direct message', async () => {
      const chat = mockChat();
      chatRepo.create.mockReturnValue(chat);
      chatRepo.save.mockResolvedValue(chat);

      const result = await service.sendMessage({
        senderId: 'u1', receiverId: 'u2', message: 'hello',
      });

      expect(chatRepo.create).toHaveBeenCalled();
      expect(chatRepo.save).toHaveBeenCalled();
      expect(result).toEqual(chat);
    });

    it('enforces membership when roomId is present', async () => {
      memberRepo.findOne.mockResolvedValue(null); // not a member

      await expect(
        service.sendMessage({ senderId: 'u1', roomId: 'room-1', message: 'hi' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── editMessage ─────────────────────────────────────────────────────────────

  describe('editMessage', () => {
    it('edits own message', async () => {
      const chat = mockChat();
      chatRepo.findOne.mockResolvedValue(chat);
      chatRepo.save.mockResolvedValue({ ...chat, message: 'edited', isEdited: true });

      const result = await service.editMessage('msg-1', 'u1', 'edited');
      expect(result.isEdited).toBe(true);
      expect(result.message).toBe('edited');
    });

    it('throws NotFoundException when message missing', async () => {
      chatRepo.findOne.mockResolvedValue(null);
      await expect(service.editMessage('x', 'u1', 'text')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when editing another user message', async () => {
      chatRepo.findOne.mockResolvedValue(mockChat({ senderId: 'other' }));
      await expect(service.editMessage('msg-1', 'u1', 'text')).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to edit any message', async () => {
      const chat = mockChat({ senderId: 'other' });
      chatRepo.findOne.mockResolvedValue(chat);
      chatRepo.save.mockResolvedValue({ ...chat, message: 'fixed', isEdited: true });

      const result = await service.editMessage('msg-1', 'admin-1', 'fixed', true);
      expect(result.message).toBe('fixed');
    });
  });

  // ── deleteMessage ───────────────────────────────────────────────────────────

  describe('deleteMessage', () => {
    it('soft-deletes own message and returns entity', async () => {
      const chat = mockChat();
      chatRepo.findOne.mockResolvedValue(chat);
      chatRepo.softDelete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteMessage('msg-1', 'u1');
      expect(chatRepo.softDelete).toHaveBeenCalledWith({ id: 'msg-1' });
      expect(result).toEqual(chat);
    });

    it('throws ForbiddenException when deleting another user message', async () => {
      chatRepo.findOne.mockResolvedValue(mockChat({ senderId: 'other' }));
      await expect(service.deleteMessage('msg-1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── joinRoom / leaveRoom ────────────────────────────────────────────────────

  describe('joinRoom', () => {
    it('creates a new membership if none exists', async () => {
      const member = mockMember();
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(member);
      memberRepo.save.mockResolvedValue(member);

      const result = await service.joinRoom('room-1', 'u1');
      expect(memberRepo.create).toHaveBeenCalled();
      expect(result).toEqual(member);
    });

    it('re-activates an existing membership', async () => {
      const existing = mockMember({ leftAt: new Date() });
      memberRepo.findOne.mockResolvedValue(existing);
      memberRepo.save.mockResolvedValue({ ...existing, leftAt: null });

      const result = await service.joinRoom('room-1', 'u1');
      expect(result.leftAt).toBeNull();
    });
  });

  describe('leaveRoom', () => {
    it('sets leftAt on active membership', async () => {
      const member = mockMember();
      memberRepo.findOne.mockResolvedValue(member);
      memberRepo.save.mockResolvedValue({ ...member, leftAt: new Date() });

      await service.leaveRoom('room-1', 'u1');
      expect(memberRepo.save).toHaveBeenCalled();
    });

    it('is a no-op when membership not found', async () => {
      memberRepo.findOne.mockResolvedValue(null);
      await expect(service.leaveRoom('room-1', 'u1')).resolves.toBeUndefined();
      expect(memberRepo.save).not.toHaveBeenCalled();
    });
  });
});
