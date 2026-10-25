import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { useCountdownAnnouncer } from '../hooks/useCountdownAnnouncer';
import { useScoreGain } from '../hooks/useScoreGain';

/** Hai hook hiển thị phụ của màn câu hỏi: điểm vừa nhận và đọc số giây ở các mốc cho trình đọc màn hình iOS. */

describe('useScoreGain', () => {
  it('điểm vừa nhận = điểm hiện tại − điểm lúc dựng lần đầu (mốc chụp một lần)', async () => {
    const { rerender, result } = await renderHook(
      ({ score }: { score: number | undefined }) => useScoreGain(score),
      {
        initialProps: { score: 500 as number | undefined },
      },
    );
    expect(result.current).toBe(0);

    await rerender({ score: 1200 });
    expect(result.current).toBe(700);

    // Mốc KHÔNG dời theo điểm mới: điểm tăng tiếp thì chênh lệch tăng tiếp.
    await rerender({ score: 1300 });
    expect(result.current).toBe(800);
  });

  it('chưa có điểm (me = null) lúc mở câu ⇒ mốc là 0', async () => {
    const { rerender, result } = await renderHook(
      ({ score }: { score: number | undefined }) => useScoreGain(score),
      {
        initialProps: { score: undefined as number | undefined },
      },
    );

    await rerender({ score: 900 });

    expect(result.current).toBe(900);
  });

  it('điểm không bao giờ giảm ⇒ không trả số âm', async () => {
    const { rerender, result } = await renderHook(
      ({ score }: { score: number | undefined }) => useScoreGain(score),
      {
        initialProps: { score: 800 as number | undefined },
      },
    );

    await rerender({ score: 300 });

    expect(result.current).toBe(0);
  });
});

describe('useCountdownAnnouncer', () => {
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  const original = Platform.OS;

  afterEach(() => {
    announce.mockClear();
    Platform.OS = original;
  });

  it('iOS: chỉ đọc ở các mốc (10 · 5 · 3 · hết giờ)', async () => {
    Platform.OS = 'ios';
    const { rerender } = await renderHook(
      ({ seconds }: { seconds: number }) => useCountdownAnnouncer(seconds, 20),
      {
        initialProps: { seconds: 20 },
      },
    );
    expect(announce).not.toHaveBeenCalled();

    for (const seconds of [10, 9, 5, 4, 3, 0]) await rerender({ seconds });

    expect(announce.mock.calls.map(([text]) => text)).toEqual([
      'Còn 10 giây',
      'Còn 5 giây',
      'Còn 3 giây',
      'Hết giờ',
    ]);
  });

  it('Android: KHÔNG đọc bằng announce (đã có live region — tránh nghe hai lần)', async () => {
    Platform.OS = 'android';
    const { rerender } = await renderHook(
      ({ seconds }: { seconds: number }) => useCountdownAnnouncer(seconds, 20),
      {
        initialProps: { seconds: 20 },
      },
    );

    await rerender({ seconds: 10 });

    expect(announce).not.toHaveBeenCalled();
  });
});
