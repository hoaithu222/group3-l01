import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';
import { useFeature } from '@/shell/capabilities';

import { callsService } from '../../api/calls.service';
import { callStoreApi } from '../../store/call.store';
import { voiceRoomService } from '../api/voice-room.service';
import { VoiceRoomPreviewScreen } from '../screens/VoiceRoomPreviewScreen';
import { apiError, makePreview, makePreviewParticipant, makeRoomCall, renderWithProviders, sheetLayersWithoutFlex1 } from './helpers';

/** VR-01 (app.md §8): chạm kênh VOICE chỉ mở PREVIEW — không xin quyền, không tạo phiên; rỗng/đầy/lưu trữ/mất mạng/404/cờ tắt. */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  useConnectionState: jest.fn(() => 'connected'),
  useRoomSubscription: jest.fn(() => ({ status: 'joined' })),
  useSocketEvent: jest.fn(),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn(() => true) }));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('device-1')) }));
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
}));
jest.mock('../api/voice-room.service', () => ({ voiceRoomService: { getPreview: jest.fn() } }));
jest.mock('../../api/calls.service', () => ({ callsService: { create: jest.fn() } }));

const getPreview = jest.mocked(voiceRoomService.getPreview);
const token = { expiresAt: '2026-09-25T10:10:00.000Z', livekitUrl: 'wss://lk', token: 'jwt' };
const ui = (props: Partial<Parameters<typeof VoiceRoomPreviewScreen>[0]> = {}) => <VoiceRoomPreviewScreen channelId="ch1" wsId="ws1" {...props} />;

beforeEach(() => {
  jest.clearAllMocks();
  getPreview.mockReset(); // không để mockResolvedValue của test trước làm "lần thử lại" thành công ngoài ý muốn
  jest.mocked(callsService.create).mockReset();
  jest.mocked(useFeature).mockReturnValue(true);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  callStoreApi.dispatch({ type: 'RESET' });
});

describe('VoiceRoomPreviewScreen', () => {
  it('VR-01: mở preview chỉ ĐỌC — không tạo/vào phòng, không xin mic/camera; phòng trống có lời mời bắt đầu', async () => {
    getPreview.mockResolvedValue(makePreview());
    await renderWithProviders(ui());

    expect(await screen.findByText('Chưa có ai trong phòng')).toBeOnTheScreen();
    expect(screen.getByText('0/8 chỗ')).toBeOnTheScreen();
    expect(screen.getByText('Tham gia')).toBeOnTheScreen();
    expect(screen.getByText('Tham gia để nghe')).toBeOnTheScreen();
    expect(getPreview).toHaveBeenCalledWith('ch1');
    expect(callsService.create).not.toHaveBeenCalled();
    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(ensureCameraPermission).not.toHaveBeenCalled();
  });

  it('phòng có người: tên, chủ phòng, "3/8 chỗ"', async () => {
    getPreview.mockResolvedValue(
      makePreview({
        call: { hostId: 'host', id: 'call1', startedAt: '2026-09-25T10:00:00.000Z', version: 1 },
        participants: [makePreviewParticipant({ isHost: true, name: 'Hoa', userId: 'host' }), makePreviewParticipant({ name: 'Bình', userId: 'b' }), makePreviewParticipant({ name: 'Cường', userId: 'c' })],
        seatsLeft: 5,
      }),
    );
    await renderWithProviders(ui());

    expect(await screen.findByText(/3 người đang trong phòng/)).toBeOnTheScreen();
    expect(screen.getByText(/Chủ phòng: Hoa/)).toBeOnTheScreen();
    expect(screen.getByText('3/8 chỗ')).toBeOnTheScreen();
  });

  it('"Tham gia để nghe" → vào phòng KHÔNG xin quyền ở bước này, rồi mở màn phòng', async () => {
    getPreview.mockResolvedValue(makePreview());
    jest.mocked(callsService.create).mockResolvedValue({ call: makeRoomCall(), joined: false, serverNow: 'x', token });
    await renderWithProviders(ui());

    await fireEvent.press(await screen.findByText('Tham gia để nghe'));
    expect(callsService.create).toHaveBeenCalledWith(expect.objectContaining({ mediaKind: 'AUDIO', scopeId: 'ch1', scopeType: 'CHANNEL' }));
    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ params: { callId: 'call1' }, pathname: '/call/[callId]' });
  });

  it('phòng đầy: nút khoá + nói rõ "đã đủ người"; không gọi API khi bấm', async () => {
    getPreview.mockResolvedValue(makePreview({ myActions: { canJoin: false, joinBlockedReason: 'FULL' }, seatsLeft: 0 }));
    await renderWithProviders(ui());

    expect(await screen.findByText('Phòng đã đủ người.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tham gia'));
    expect(callsService.create).not.toHaveBeenCalled();
  });

  it('kênh đã lưu trữ: chỉ đọc — có nhãn, KHÔNG có nút vào phòng', async () => {
    getPreview.mockResolvedValue(makePreview({ myActions: { canJoin: false, joinBlockedReason: 'ARCHIVED' } }));
    await renderWithProviders(ui());

    expect(await screen.findByText(/Kênh đã lưu trữ/)).toBeOnTheScreen();
    expect(screen.queryByText('Tham gia')).toBeNull();
    expect(screen.queryByText('Tham gia để nghe')).toBeNull();
  });

  it('đã bị mời ra khỏi phiên này: nói rõ lý do, nút vào khoá (VR-06)', async () => {
    getPreview.mockResolvedValue(makePreview({ myActions: { canJoin: false, joinBlockedReason: 'REMOVED' } }));
    await renderWithProviders(ui());

    expect(await screen.findByText(/mời ra khỏi phiên phòng này/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tham gia'));
    expect(callsService.create).not.toHaveBeenCalled();
  });

  it('mất mạng: nút khoá, chữ "Cần kết nối mạng"', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    getPreview.mockResolvedValue(makePreview());
    await renderWithProviders(ui());

    expect(await screen.findByText('Cần kết nối mạng để tham gia.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tham gia'));
    expect(callsService.create).not.toHaveBeenCalled();
  });

  it('404: màn trung tính "Kênh không còn khả dụng" + về danh sách kênh; lỗi khác: Thử lại', async () => {
    getPreview.mockRejectedValueOnce(apiError(404, 'CALL_001'));
    await renderWithProviders(ui());
    expect(await screen.findByText('Kênh không còn khả dụng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Về danh sách kênh'));
    expect(router.replace).toHaveBeenCalledWith({ params: { wsId: 'ws1' }, pathname: '/workspaces/[wsId]/channels' });
  });

  it('lỗi mạng khi tải: "Thử lại" tải lại preview', async () => {
    getPreview.mockRejectedValue(new Error('mạng'));
    await renderWithProviders(ui());
    // Lỗi mạng được thử lại MỘT lần (mặc định của app, cách 1 giây) rồi mới hiện lỗi.
    expect(await screen.findByText('Không tải được phòng', {}, { timeout: 4000 })).toBeOnTheScreen();
    getPreview.mockResolvedValue(makePreview());
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(await screen.findByText('Chưa có ai trong phòng')).toBeOnTheScreen();
  });

  it('cờ `voice` tắt: không tải preview, không dựng nút vào phòng', async () => {
    jest.mocked(useFeature).mockReturnValue(false);
    await renderWithProviders(ui());

    expect(await screen.findByText('Phòng thoại chưa sẵn sàng')).toBeOnTheScreen();
    expect(getPreview).not.toHaveBeenCalled();
    expect(screen.queryByText('Tham gia')).toBeNull();
  });

  it('đang ở CHÍNH phòng này: nút "Quay lại phòng" (không tham gia lần hai); nút chat chỉ có khi được nối', async () => {
    callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
    callStoreApi.dispatch({ call: makeRoomCall(), joined: false, token, type: 'START_OK' });
    getPreview.mockResolvedValue(makePreview());
    await renderWithProviders(ui());

    await fireEvent.press(await screen.findByText('Quay lại phòng'));
    expect(callsService.create).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ params: { callId: 'call1' }, pathname: '/call/[callId]' });
    expect(screen.queryByText('Chat của phòng')).toBeNull();
  });

  it('có `renderRoomChat` → nút "Chat của phòng" đọc tin kênh không cần vào phòng', async () => {
    getPreview.mockResolvedValue(makePreview());
    await renderWithProviders(ui({ renderRoomChat: (id) => <Text>{`chat-${id}`}</Text> }));

    await fireEvent.press(await screen.findByText('Chat của phòng'));
    expect(await screen.findByText('chat-ch1')).toBeOnTheScreen();
    expect(callsService.create).not.toHaveBeenCalled();
    // Chat nằm trong thân tấm GIÃN hết chiều cao — thiếu thì `ChatRoom` sập, ô soạn dạt lên dưới tiêu đề (xem `sheetLayersWithoutFlex1`).
    expect(sheetLayersWithoutFlex1(screen.getByText('chat-ch1'))).toEqual([]);
  });
});
