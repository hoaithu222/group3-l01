import { isAxiosError } from 'axios';
import { useCallback, useMemo, useState } from 'react';

import { getErrorCode } from '@/core/api/client.helpers';

let counter = 0;

/** djb2 → base36: đủ để phân biệt hai body khác nhau; KHÔNG dùng cho bảo mật. */
function shortHash(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * `Idempotency-Key` mới — độ dài luôn trong 8–128 ký tự mà BE yêu cầu (`idempotency.ts`: `z.string().min(8).max(128)`).
 *
 * ⛔ KHÔNG dùng `Crypto.randomUUID()` (`expo-crypto`) — trong Jest nó lặng lẽ trả `undefined`; ở đây chỉ cần KHÔNG TRÙNG
 * trong một phiên. `signature` (chữ ký của body sắp gửi) được băm vào khoá để hai body khác nhau không bao giờ chung khoá.
 */
export function newIdempotencyKey(prefix: string, signature = ''): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${shortHash(signature)}-${Date.now().toString(36)}-${counter}-${random}`;
}

/**
 * `RES_004` (409) — lượt TRƯỚC với cùng khoá còn đang chạy ở server (`IdempotencyInProgressError`). Đó chưa phải câu trả lời đã
 * chốt: đổi khoá lúc này là mở đường cho lượt trước hoàn tất VÀ lượt mới cũng chạy ⇒ tạo trùng. Giữ khoá để lần thử sau nhận đúng
 * kết quả của lượt đầu.
 */
const IN_PROGRESS_CODE = 'RES_004';

/**
 * Phản hồi này đã bị BE LƯU dưới khoá chưa? `idempotency.ts` lưu MỌI phản hồi có mã < 500 (kể cả 4xx) 24 giờ rồi phát lại nguyên
 * văn cho cùng khoá. (Bản BE từ 2026-09-25 không còn lưu 429 của bộ giới hạn chạy SAU nó; ta vẫn xoay khoá sau 429 vì 429 nghĩa là
 * CHƯA làm gì — an toàn, và cũng đúng với bản BE cũ hơn.) Vậy sau một lỗi 4xx dứt khoát (`TPL_001`, `VAL_001`, `WS_006`…) mà
 * gửi lại CÙNG khoá thì nhận lại đúng câu lỗi cũ dù người dùng đã sửa dữ liệu; sau một lượt THÀNH CÔNG thì gửi lại cùng khoá là
 * "thành công giả" (kết quả cũ, không làm gì). Không có phản hồi (mất mạng/timeout) hoặc 5xx thì BE KHÔNG lưu — giữ khoá để thử
 * lại an toàn; `RES_004` (đang xử lý) cũng giữ khoá, xem `IN_PROGRESS_CODE`.
 */
export function shouldRotateIdempotencyKey(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined || status >= 500) return false;
  return getErrorCode(error) !== IN_PROGRESS_CODE;
}

/**
 * Khoá chống gửi trùng cho MỘT ý định ghi (tạo nhóm, áp mẫu…). Spec "sinh một lần khi mở form" đúng cho ca chính — bấm hai
 * lần, mạng chậm, thử lại sau 5xx: cùng body ⇒ cùng khoá ⇒ BE chỉ làm MỘT lần. Nhưng khoá KHÔNG giữ nguyên tuyệt đối; nó đổi khi:
 *  · `signature` (chữ ký body) đổi — người dùng sửa dữ liệu;
 *  · `rotate()` được gọi — sau khi BE đã chốt một câu trả lời (`shouldRotateIdempotencyKey`: 4xx hoặc thành công).
 */
export function useIdempotencyKey(prefix: string, signature: string) {
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(
    () => newIdempotencyKey(prefix, `${signature}#${attempt}`),
    [prefix, signature, attempt],
  );
  const rotate = useCallback(() => setAttempt((value) => value + 1), []);
  return { key, rotate };
}
