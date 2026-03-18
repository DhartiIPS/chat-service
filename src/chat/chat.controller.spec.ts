import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;
  let service: jest.Mocked<ChatService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            sendMessage: jest.fn(),
            getMessages: jest.fn(),
            getMessagesByRoom: jest.fn(),
            editMessage: jest.fn(),
            deleteMessage: jest.fn(),
            markAsRead: jest.fn(),
            markAsReadDirect: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    service = module.get(ChatService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('handleSendMessage', () => {
    it('should delegate to ChatService.sendMessage', async () => {
      const dto = { senderId: 'u1', receiverId: 'u2', message: 'hello' };
      const saved = { id: 'msg-1', ...dto };
      service.sendMessage.mockResolvedValue(saved as never);

      const result = await controller.handleSendMessage(dto as never);
      expect(service.sendMessage).toHaveBeenCalledWith(dto);
      expect(result).toEqual(saved);
    });
  });

  describe('getDirectMessages', () => {
    it('should return paginated messages', async () => {
      const payload = { senderId: 'u1', receiverId: 'u2', limit: 20 };
      const page = { items: [], nextCursor: null };
      service.getMessages.mockResolvedValue(page);

      const result = await controller.getDirectMessages(payload);
      expect(service.getMessages).toHaveBeenCalledWith('u1', 'u2', undefined, 20);
      expect(result).toEqual(page);
    });
  });

  describe('deleteMessage', () => {
    it('should return { ok: true } after deletion', async () => {
      service.deleteMessage.mockResolvedValue({ id: 'msg-1' } as never);
      const result = await controller.deleteMessage({
        messageId: 'msg-1',
        userId: 'u1',
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('markRead', () => {
    it('should return updatedCount', async () => {
      service.markAsRead.mockResolvedValue(3);
      const result = await controller.markRead({
        roomId: 'room-1',
        userId: 'u1',
        lastMessageId: 'msg-5',
      });
      expect(result).toEqual({ ok: true, updatedCount: 3 });
    });
  });
});
