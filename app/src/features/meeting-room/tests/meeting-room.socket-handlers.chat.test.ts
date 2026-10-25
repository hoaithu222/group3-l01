import { handleChatMessage } from '../hooks/meeting-room.socket-handlers';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, installFakeMedia, setPhase } from './controller-kit';

/** Tin nhắn mới trong nhóm chat họp khi sheet Chat đang đóng → badge chưa đọc trên thanh điều khiển (app.md §3.2). */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({ meetingRoomService: { leave: jest.fn(), snapshot: jest.fn() } }));

beforeEach(() => {
  installFakeMedia();
  setPhase('IN_ROOM');
});

afterEach(cleanupController);

const msg = (over = {}) => ({ authorId: 'u2', scopeId: 'conv1', scopeType: 'CONVERSATION', ...over });

describe('handleChatMessage', () => {
  it('tin của NGƯỜI KHÁC trong nhóm chat họp → tăng badge chưa đọc', () => {
    handleChatMessage(msg(), 'me');
    handleChatMessage(msg(), 'me');
    expect(meetingRoomApi.get().chatUnread).toBe(2);
  });

  it('tin của mình / hệ thống / hội thoại khác / kênh khác thì không đếm', () => {
    handleChatMessage(msg({ authorId: 'me' }), 'me');
    handleChatMessage(msg({ authorId: null }), 'me');
    handleChatMessage(msg({ scopeId: 'convKhac' }), 'me');
    handleChatMessage(msg({ scopeType: 'CHANNEL' }), 'me');
    expect(meetingRoomApi.get().chatUnread).toBe(0);
  });

  it('đang mở Chat thì không đếm (đã đọc); chưa có nhóm chat họp thì bỏ', () => {
    meetingRoomApi.patch({ sheet: 'CHAT' });
    handleChatMessage(msg(), 'me');
    expect(meetingRoomApi.get().chatUnread).toBe(0);

    meetingRoomApi.patch({ conversationId: null, sheet: 'NONE' });
    handleChatMessage(msg(), 'me');
    expect(meetingRoomApi.get().chatUnread).toBe(0);
  });
});
