import { act, renderHook } from '@testing-library/react-native';
import { setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

import { useMicLevel } from '../hooks/useMicLevel';
import { flushMicrotasks } from './hook-wrapper';

/**
 * Mức mic thử ở pre-join (app.md §3.2 `MicLevelMeter`): chỉ đo khi được bật, dừng NGAY khi tắt/rời và XOÁ tệp tạm (bản ghi âm thử không được nằm lại
 * trong bộ nhớ đệm — riêng tư). `expo-audio` là module native nên dùng bản giả; hành vi thật trên máy chưa kiểm chứng.
 */
const mockRecorder = {
  isRecording: false,
  prepareToRecordAsync: jest.fn(() => Promise.resolve()),
  record: jest.fn(() => {
    mockRecorder.isRecording = true;
  }),
  stop: jest.fn(() => {
    mockRecorder.isRecording = false;
    return Promise.resolve();
  }),
  uri: 'file:///cache/mic-test.m4a',
};
let mockMetering: number | undefined = -30;

jest.mock('expo-audio', () => ({
  RecordingPresets: { LOW_QUALITY: {} },
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioRecorder: jest.fn(() => mockRecorder),
  useAudioRecorderState: jest.fn(() => ({ isRecording: mockRecorder.isRecording, metering: mockMetering })),
}));
jest.mock('expo-file-system/legacy', () => ({ deleteAsync: jest.fn(() => Promise.resolve()) }));

const props = (enabled: boolean) => ({ initialProps: { enabled } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRecorder.isRecording = false;
  mockMetering = -30;
});

describe('useMicLevel', () => {
  it('tắt (mặc định): mức 0, không mở micro, không ghi', async () => {
    const { result } = await renderHook(({ enabled }: { enabled: boolean }) => useMicLevel(enabled), props(false));

    expect(result.current).toBe(0);
    expect(setAudioModeAsync).not.toHaveBeenCalled();
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it('bật: chuẩn bị + ghi để đo; mức dBFS → 0..100 (-60 dB = 0, 0 dB = 100, -30 dB = 50)', async () => {
    const { result, rerender } = await renderHook(({ enabled }: { enabled: boolean }) => useMicLevel(enabled), props(false));

    await rerender({ enabled: true });
    await act(flushMicrotasks);
    expect(setAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: true });
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);

    await rerender({ enabled: true });
    expect(result.current).toBe(50);
    mockMetering = 0;
    await rerender({ enabled: true });
    expect(result.current).toBe(100);
    mockMetering = undefined; // chưa có số đo → coi như im lặng
    await rerender({ enabled: true });
    expect(result.current).toBe(0);
  });

  it('tắt lại (hoặc rời pre-join): dừng đo NGAY và xoá tệp tạm; mức về 0', async () => {
    const { result, rerender } = await renderHook(({ enabled }: { enabled: boolean }) => useMicLevel(enabled), props(true));
    await act(flushMicrotasks);

    await rerender({ enabled: false });
    await act(flushMicrotasks);
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/mic-test.m4a', { idempotent: true });
    expect(result.current).toBe(0);
  });

  it('gỡ màn (unmount) cũng dừng đo và xoá tệp tạm', async () => {
    const { unmount } = await renderHook(({ enabled }: { enabled: boolean }) => useMicLevel(enabled), props(true));
    await act(flushMicrotasks);

    await unmount();
    await act(flushMicrotasks);
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
  });

  it('bật → tắt → bật nhanh: lượt chuẩn bị mới CHỜ lượt dừng trước xong rồi mới ghi lại (thanh mức không kẹt ở 0)', async () => {
    let releaseStop: () => void = () => undefined;
    const { rerender } = await renderHook(({ enabled }: { enabled: boolean }) => useMicLevel(enabled), props(true));
    await act(flushMicrotasks);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);

    mockRecorder.stop.mockImplementationOnce(() => {
      mockRecorder.isRecording = false;
      return new Promise<void>((resolve) => (releaseStop = resolve));
    });
    await rerender({ enabled: false });
    await rerender({ enabled: true });
    await act(flushMicrotasks);
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1); // còn chờ lượt dừng

    await act(async () => releaseStop());
    await act(flushMicrotasks);
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(mockRecorder.record).toHaveBeenCalledTimes(2);
  });

  it('không mở được micro (lỗi native): không ném, mức đứng ở 0 — người dùng vẫn vào họp bình thường', async () => {
    jest.mocked(setAudioModeAsync).mockRejectedValueOnce(new Error('no mic'));
    const { result } = await renderHook(({ enabled }: { enabled: boolean }) => useMicLevel(enabled), props(true));
    await act(flushMicrotasks);

    expect(result.current).toBe(0);
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });
});
