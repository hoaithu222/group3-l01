import { renderHook } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useKeepAwake } from '@/shared/hooks/useKeepAwake';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

/** Giữ màn sáng khi `active`, nhả ngay khi hết/rời màn — mỗi nơi dùng một `tag` riêng (thư viện đếm theo tag). */

beforeEach(() => jest.clearAllMocks());

it('active ⇒ giữ sáng đúng tag; gỡ màn ⇒ nhả đúng tag', async () => {
  const { unmount } = await renderHook(() => useKeepAwake('study-mock-attempt', true));

  expect(activateKeepAwakeAsync).toHaveBeenCalledWith('study-mock-attempt');
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  await unmount();
  expect(deactivateKeepAwake).toHaveBeenCalledWith('study-mock-attempt');
});

it('không active ⇒ không giữ sáng', async () => {
  await renderHook(() => useKeepAwake('study-mock-attempt', false));

  expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
});

it('true → false (hết giờ/đã nộp) ⇒ nhả NGAY, không đợi gỡ màn', async () => {
  const { rerender } = await renderHook(
    ({ active }: { active: boolean }) => useKeepAwake('study-mock-attempt', active),
    { initialProps: { active: true } },
  );

  await rerender({ active: false });
  expect(deactivateKeepAwake).toHaveBeenCalledWith('study-mock-attempt');
});

it('kích hoạt lỗi (thiết bị không cho) ⇒ không làm hỏng màn đang chạy', async () => {
  jest.mocked(activateKeepAwakeAsync).mockRejectedValueOnce(new Error('unsupported'));

  await expect(renderHook(() => useKeepAwake('study-mock-attempt', true))).resolves.toBeDefined();
});
