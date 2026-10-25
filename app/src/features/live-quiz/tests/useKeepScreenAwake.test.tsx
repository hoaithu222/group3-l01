import { renderHook } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { KEEP_AWAKE_TAG, useKeepScreenAwake } from '../hooks/useKeepScreenAwake';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

/** app.md p5-01 §6: giữ màn sáng trong lúc phiên `IN_PROGRESS`, nhả ngay khi hết/rời màn. */

beforeEach(() => jest.clearAllMocks());

it('phiên đang chơi ⇒ giữ sáng, gỡ màn ⇒ nhả', async () => {
  const { unmount } = await renderHook(() => useKeepScreenAwake(true));

  expect(activateKeepAwakeAsync).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
  expect(deactivateKeepAwake).not.toHaveBeenCalled();

  await unmount();
  expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
});

it('chưa/không còn chơi ⇒ không giữ sáng', async () => {
  await renderHook(() => useKeepScreenAwake(false));

  expect(activateKeepAwakeAsync).not.toHaveBeenCalled();
});

it('hết phiên (true → false) ⇒ nhả ngay, không đợi gỡ màn', async () => {
  const { rerender } = await renderHook(
    ({ active }: { active: boolean }) => useKeepScreenAwake(active),
    { initialProps: { active: true } },
  );

  await rerender({ active: false });

  expect(deactivateKeepAwake).toHaveBeenCalledWith(KEEP_AWAKE_TAG);
});

it('kích hoạt lỗi (thiết bị không cho) ⇒ không làm hỏng màn chơi', async () => {
  jest.mocked(activateKeepAwakeAsync).mockRejectedValueOnce(new Error('unsupported'));

  await expect(renderHook(() => useKeepScreenAwake(true))).resolves.toBeDefined();
});
