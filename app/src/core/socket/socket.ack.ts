import { socket } from './socket.client';

/** Kết quả ack chuẩn BE trả cho mọi sự kiện client→server có callback. */
export interface Ack {
  code?: string;
  ok: boolean;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * `socket.emit(event, payload, ack)` có TIMEOUT.
 *
 * ⛔ KHÔNG dùng `socket.timeout(ms).emit(...)` của chính thư viện — bản mock
 * dùng trong test (`__mocks__/socket.io-client.ts`) chỉ giả lập
 * `emit(event, payload, ack)` gọi ack NGAY, không có tầng `.timeout()`. Thêm
 * API đó vào đây bắt mọi test phải mock thêm một tầng nữa cho một tính năng
 * (`.timeout()`) mà bản thân `emitWithAck` không cần tới — tự đếm giờ bằng
 * `setTimeout` vừa đủ dùng, vừa khớp mock hiện có.
 *
 * ⚠️ KHÔNG BAO GIỜ reject — mất ack (server không trả lời trong `timeoutMs`)
 * trả về `{ok:false, code:'ACK_TIMEOUT'}` giống hệt một ack lỗi thật, để nơi
 * gọi xử lý bằng MỘT nhánh `if (!ack.ok)` thay vì phải viết thêm `try/catch`.
 */
export function emitWithAck<TPayload = unknown>(
  event: string,
  payload: TPayload,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Ack> {
  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, code: 'ACK_TIMEOUT' });
    }, timeoutMs);

    socket.emit(event, payload, (ack: Ack | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack ?? { ok: false, code: 'ACK_EMPTY' });
    });
  });
}
