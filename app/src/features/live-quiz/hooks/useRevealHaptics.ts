import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';

/**
 * Rung nhẹ lúc công bố đáp án của người chơi (app.md p5-01 §6): đúng ⇒ vừa, sai/bỏ trống ⇒ nhẹ. `null` (chưa công bố, hoặc
 * là host) ⇒ không rung. Dựa vào cài đặt rung của hệ điều hành (tắt rung là không rung) — không tự bỏ qua. `outcome` đổi
 * đúng MỘT lần mỗi câu vì nơi gọi đặt `key` theo chỉ số câu.
 */
export function useRevealHaptics(outcome: 'correct' | 'wrong' | null): void {
  useEffect(() => {
    if (outcome === null) return;
    void Haptics.impactAsync(
      outcome === 'correct'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
  }, [outcome]);
}
