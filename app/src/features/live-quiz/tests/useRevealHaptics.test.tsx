import { renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { useRevealHaptics } from '../hooks/useRevealHaptics';

/** app.md p5-01 §6: rung nhẹ lúc công bố đáp án của người chơi (đúng ⇒ vừa, sai ⇒ nhẹ); host/chưa công bố ⇒ không rung. */

beforeEach(() => jest.clearAllMocks());

it('đúng ⇒ rung vừa', async () => {
  await renderHook(() => useRevealHaptics('correct'));

  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
});

it('sai/bỏ trống ⇒ rung nhẹ', async () => {
  await renderHook(() => useRevealHaptics('wrong'));

  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
});

it('chưa công bố (hoặc là host) ⇒ không rung', async () => {
  await renderHook(() => useRevealHaptics(null));

  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});

it('kết quả đổi từ null sang có ⇒ rung đúng MỘT lần', async () => {
  const { rerender } = await renderHook(
    ({ outcome }: { outcome: 'correct' | null }) => useRevealHaptics(outcome),
    {
      initialProps: { outcome: null as 'correct' | null },
    },
  );

  await rerender({ outcome: 'correct' });
  await rerender({ outcome: 'correct' });

  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
});
