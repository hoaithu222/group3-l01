import { useState } from 'react';

/**
 * Điểm tôi VỪA nhận ở câu này = điểm hiện tại − điểm lúc câu MỞ. BE không trả điểm từng câu ở `quiz:reveal`, nhưng
 * `quiz:leaderboard` cập nhật `me.score` sau mỗi câu; nơi gọi (`QuestionStage`) sống đúng một câu (đặt `key` theo chỉ số câu)
 * nên `useState` chụp được điểm lúc mở câu.
 *
 * ⚠️ Vào phòng/mở lại app SAU khi câu đã được chấm thì mốc chụp đã gồm điểm câu này ⇒ trả 0 và nơi hiển thị ẩn dòng "+N" —
 * thà không hiện còn hơn hiện một con số bịa. Chỉ trả số DƯƠNG (điểm không bao giờ giảm).
 */
export function useScoreGain(score: number | undefined): number {
  const [base] = useState(score ?? 0);
  return Math.max(0, (score ?? 0) - base);
}
