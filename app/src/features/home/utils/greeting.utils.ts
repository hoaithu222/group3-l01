/**
 * Lời chào theo buổi. Mốc giờ theo thói quen nói của người Việt: sáng 5–10h, trưa 11–12h, chiều 13–17h, tối từ 18h
 * (kể cả khuya/rạng sáng 0–4h — "Chào buổi tối" tự nhiên hơn "chào buổi sáng" lúc 2 giờ sáng).
 *
 * Hàm THUẦN nhận giờ (0–23) chứ không tự đọc đồng hồ: test được từng mốc mà không phải giả lập thời gian.
 * Giờ ngoài 0–23 (dữ liệu hỏng) rơi về buổi tối cho khỏi ném lỗi giữa lúc dựng Trang chủ.
 */
export function getGreeting(hour: number): string {
  if (hour >= 5 && hour <= 10) return 'Chào buổi sáng';
  if (hour >= 11 && hour <= 12) return 'Chào buổi trưa';
  if (hour >= 13 && hour <= 17) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** Cảnh minh hoạ cạnh lời chào (`GreetingIllustration`). */
export type GreetingScene = 'afternoon' | 'evening' | 'morning' | 'night';

/**
 * Giờ → cảnh: sáng 5–11h (mặt trời toả tia + mây) · chiều 11–17h (mặt trời khuất nửa sau mây) · tối 17–22h (trăng khuyết
 * + ba sao) · đêm 22–5h (trăng + nhiều sao hơn). Mốc trái TÍNH, mốc phải KHÔNG (11h đã là chiều).
 *
 * ⚠️ Mốc CỐ Ý lệch với `getGreeting`: cảnh theo ÁNH TRỜI (17h trời đã chạng vạng), lời chào theo thói quen NÓI ("chiều"
 * tới hết 17h). Lúc 17h là "Chào buổi chiều" cạnh vầng trăng non — cảnh hoàng hôn, không phải lỗi.
 * Cùng luật THUẦN như trên: nhận giờ chứ không đọc đồng hồ; giờ hỏng (âm, > 23, NaN) rơi về `night`, không ném lỗi.
 */
export function getGreetingScene(hour: number): GreetingScene {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}
