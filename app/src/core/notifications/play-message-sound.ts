import { createAudioPlayer } from 'expo-audio';

import messageSound from '../../../assets/sounds/message.wav';

/** Player xong thì tự giải phóng — âm rất ngắn (~0,2 s); chừa dư để không cắt đuôi trên máy chậm. */
const RELEASE_AFTER_MS = 1500;

/**
 * Phát âm báo tin mới TRONG ứng dụng (p1-07 `app.md` §6, khi banner hiện và `sound=true`). Best-effort: lỗi âm thanh
 * (không có thiết bị phát, đang gọi…) KHÔNG được làm hỏng luồng nhận push.
 *
 * ⚠️ CHƯA kiểm trên thiết bị thật: tệp `assets/sounds/message.wav` (≈ 7 KB, 16 kHz mono) là bản thay cho `message.m4a` mà
 * `app.md` nêu (không có công cụ mã hoá m4a trong môi trường dựng) — thay bằng âm chuẩn của thiết kế khi có.
 */
export function playMessageSound(): void {
  try {
    const player = createAudioPlayer(messageSound);
    player.play();
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // đã giải phóng
      }
    }, RELEASE_AFTER_MS);
  } catch {
    // không phát được — bỏ qua (xem chú thích hàm)
  }
}
