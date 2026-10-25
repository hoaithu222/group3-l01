/**
 * Logger DUY NHẤT của app — thay mọi `console.*` (ESLint `no-console` chặn, chỉ file này được miễn).
 *
 * ── Vì sao có nó ─────────────────────────────────────────────────────────────
 * `console.*` rải khắp nơi thì không có chỗ nào để (1) tắt log ồn ở bản phát hành, (2) đẩy dấu vết vào
 * dịch vụ báo lỗi (Sentry — p0-11), (3) soát "có log nào lộ token/nội dung tin không". Gom về một cửa
 * thì cả ba là việc của MỘT file.
 *
 * ── Mức log ──────────────────────────────────────────────────────────────────
 *  · `debug` · `info` — CHỈ ở dev (`__DEV__`): dấu vết cho người phát triển, bản phát hành im lặng.
 *  · `warn` · `error` — LUÔN ra console (kể cả bản phát hành): `adb logcat`/Console của Xcode là dấu vết
 *    duy nhất còn lại khi người dùng báo lỗi và chưa có dịch vụ báo lỗi (xem `ErrorBoundary`). Nơi gọi
 *    muốn `warn` chỉ ở dev thì tự bọc `if (__DEV__)` như trước — logger không đoán thay.
 *
 * ── Đầu ra ───────────────────────────────────────────────────────────────────
 * ⚠️ Chuyển TIẾP NGUYÊN VĂN `(message, ...args)` xuống `console` — không thêm tiền tố/màu vào tham số
 * đầu. Lý do: nhiều test (và công cụ soi log) so khớp đúng chuỗi đó; thêm tiền tố là vỡ chúng lặng lẽ.
 * Tên vùng (`[push]`, `[auth.store]`) viết ngay trong `message`, như cách các chỗ cũ vẫn làm.
 *
 * ── Đường vào dịch vụ báo lỗi ────────────────────────────────────────────────
 * `addLogSink(fn)` đăng ký một "ống xả" nhận MỌI dòng log đã phát (kể cả `info` ở bản phát hành —
 * Sentry cần breadcrumb). Ví dụ lúc khởi tạo Sentry:
 *
 * ```ts
 * addLogSink((level, message) => Sentry.addBreadcrumb({ category: 'app', level, message }));
 * ```
 *
 * ⛔ KHÔNG truyền token, mật khẩu, mã mời, nội dung tin nhắn vào bất kỳ mức log nào — ống xả gửi đi
 * ra ngoài máy. Cần in object có thể chứa bí mật thì đi qua `redactSecrets` (`core/api/client.helpers`).
 */

export type LogLevel = 'debug' | 'error' | 'info' | 'warn';

/** Ống xả: nhận mọi dòng log đã phát. ⛔ Không được ném lỗi (logger nuốt, nhưng đừng dựa vào đó). */
export type LogSink = (level: LogLevel, message: string, args: readonly unknown[]) => void;

const sinks = new Set<LogSink>();

/** Đăng ký ống xả. Trả hàm huỷ đăng ký. */
export function addLogSink(sink: LogSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

/** `debug`/`info` chỉ chạy ở dev; `warn`/`error` luôn chạy. */
function isEnabled(level: LogLevel): boolean {
  return level === 'warn' || level === 'error' || __DEV__;
}

function emit(level: LogLevel, message: string, args: readonly unknown[]): void {
  if (!isEnabled(level)) return;

  // Một ống xả hỏng (Sentry chưa khởi tạo, mạng…) KHÔNG được làm hỏng dòng log lẫn mã đang gọi nó.
  for (const sink of sinks) {
    try {
      sink(level, message, args);
    } catch {
      // Nuốt có chủ ý — không có chỗ nào an toàn để báo lỗi của chính ống báo lỗi.
    }
  }

  // Gọi qua `console[level]` (không phải tham chiếu hàm đã lưu) để test dùng được `jest.spyOn(console, …)`.
  // File DUY NHẤT được phép chạm `console`: `eslint.config.js` miễn `no-console` cho đúng đường dẫn này.
  console[level](message, ...args);
}

export const logger = {
  debug: (message: string, ...args: unknown[]): void => emit('debug', message, args),
  info: (message: string, ...args: unknown[]): void => emit('info', message, args),
  warn: (message: string, ...args: unknown[]): void => emit('warn', message, args),
  error: (message: string, ...args: unknown[]): void => emit('error', message, args),
};
