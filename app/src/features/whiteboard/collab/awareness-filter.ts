import type { HocuspocusProvider } from '@hocuspocus/provider';

/**
 * ⛔ BẮT BUỘC cho client bảng trắng (`collab/README.md` §3.3, đo thật ở `collab/tests/whiteboard.test.ts`).
 *
 * `HocuspocusProvider` 3.4.4 đăng ký `awareness.on('update', boundAwarenessUpdateHandler)` và handler đó GỬI LẠI mọi thay đổi awareness lên
 * server — kể cả state của NGƯỜI KHÁC vừa nhận về (origin = chính provider). Mỗi kết nối bị đổ ≈ (N−1) × tần suất tin vào trần chung
 * 200 tin/giây: đo với 30 client ~22 Hz thì server đóng `rate-limited` sau ~0,4 s. Hậu quả nếu quên: 20–30 người cùng vẽ là cả phòng bị
 * ngắt liên tục, mà lúc 2–3 người thử thì vẫn chạy bình thường (lỗi chỉ lộ ở quy mô).
 *
 * Cách chữa: gỡ handler mặc định và gắn lại bản chỉ chuyển tiếp thay đổi KHÔNG đến từ provider (tức state của CHÍNH mình: con trỏ, vùng chọn,
 * hết hạn `outdatedTimeout`). Gọi ĐÚNG MỘT lần, ngay sau khi tạo provider, trước khi gọi `setAwarenessField`.
 * ⚠️ `provider.destroy()` gọi `awareness.off('update', boundAwarenessUpdateHandler)` — handler mới của ta không bị gỡ ở đó, nhưng
 * `awareness.destroy()` (cũng do `destroy()` gọi) xoá mọi listener nên không rò.
 */
export function installAwarenessFilter(provider: HocuspocusProvider): void {
  const awareness = provider.awareness;
  if (!awareness) return;
  awareness.off('update', provider.boundAwarenessUpdateHandler);
  awareness.on('update', (changes: unknown, origin: unknown) => {
    if (origin !== provider) provider.awarenessUpdateHandler(changes, origin);
  });
}
