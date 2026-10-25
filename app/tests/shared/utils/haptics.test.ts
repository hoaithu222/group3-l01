import * as Haptics from 'expo-haptics';

import { hapticSelection, hapticSuccess, hapticTap, hapticWarning } from '@/shared/utils/haptics';

/**
 * `expo-haptics` đã mock toàn cục ở `jest.setup.js`. Kiểm hai điều: mỗi nhịp gọi ĐÚNG loại rung, và rung hỏng (native ném
 * lỗi đồng bộ hoặc promise bị từ chối) KHÔNG lan ra hành động chính — nút gửi không được chết vì máy không có động cơ rung.
 */
describe('shared/utils/haptics', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('mỗi nhịp gọi đúng loại rung', () => {
    hapticTap();
    hapticSelection();
    hapticSuccess();
    hapticWarning();

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(
      1,
      Haptics.NotificationFeedbackType.Success,
    );
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(
      2,
      Haptics.NotificationFeedbackType.Warning,
    );
  });

  it('promise bị từ chối thì nuốt im lặng', async () => {
    jest.mocked(Haptics.impactAsync).mockRejectedValueOnce(new Error('no vibrator'));

    expect(() => hapticTap()).not.toThrow();
    // Cho promise bị từ chối chạy hết vòng — không có "unhandled rejection" nào lọt ra.
    await Promise.resolve();
  });

  it('lỗi ĐỒNG BỘ từ native cũng nuốt im lặng', () => {
    jest.mocked(Haptics.selectionAsync).mockImplementationOnce(() => {
      throw new Error('module missing');
    });

    expect(() => hapticSelection()).not.toThrow();
  });
});
