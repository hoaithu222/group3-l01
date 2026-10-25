import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ANDROID_CHANNEL_IDS, ANDROID_CHANNELS, ensureAndroidChannels } from '../android-channels';

/**
 * Bảng kênh khớp `app.md` §6 và `android.channelId` mà BE gửi. Lệch id là push rơi vào kênh `fallback`
 * mà người dùng không tắt tiếng được từng loại.
 */

const mockedSetChannel = jest.mocked(Notifications.setNotificationChannelAsync);
const { HIGH } = Notifications.AndroidImportance;

async function withPlatform(os: 'android' | 'ios', run: () => Promise<void>): Promise<void> {
  const original = Platform.OS;
  Platform.OS = os;
  try {
    await run();
  } finally {
    Platform.OS = original;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ANDROID_CHANNELS', () => {
  it('id vẫn khớp AndroidChannel của BE (gồm cả calls, dù JS không tạo kênh đó)', () => {
    // Hậu tố `-v2`: kênh cũ bị tạo IM LẶNG (`sound: null`) mà Android khoá cấu hình kênh đã tạo.
    expect(Object.values(ANDROID_CHANNEL_IDS).sort()).toEqual([
      'default-v2',
      'mentions-v2',
      'superapp-call-ring-v1',
    ]);
  });

  // Kênh `calls` do NATIVE tạo (`superapp-call-ring-v1`, nhạc chuông thật) — xem chú thích
  // trong `android-channels.ts`. JS tạo lại là hai mục trùng nghĩa trong Cài đặt.
  it('JS chỉ tạo hai kênh default | mentions', () => {
    expect(ANDROID_CHANNELS.map((channel) => channel.id).sort()).toEqual(['default-v2', 'mentions-v2']);
  });

  it('mức ưu tiên theo app.md §6: default HIGH, mentions HIGH', () => {
    const importance = Object.fromEntries(ANDROID_CHANNELS.map((c) => [c.id, c.importance]));
    expect(importance).toEqual({ 'default-v2': HIGH, 'mentions-v2': HIGH });
  });

  it('không kênh nào của JS bypass DND (chuông cuộc gọi là việc của native)', () => {
    expect(ANDROID_CHANNELS.filter((c) => c.bypassDnd)).toEqual([]);
  });
});

describe('ensureAndroidChannels', () => {
  it('tạo hai kênh trên Android', async () => {
    await withPlatform('android', async () => {
      await ensureAndroidChannels();
    });
    expect(mockedSetChannel.mock.calls.map(([id]) => id).sort()).toEqual(['default-v2', 'mentions-v2']);
  });

  it('không làm gì trên iOS (không có khái niệm kênh)', async () => {
    await withPlatform('ios', async () => {
      await ensureAndroidChannels();
    });
    expect(mockedSetChannel).not.toHaveBeenCalled();
  });
});
