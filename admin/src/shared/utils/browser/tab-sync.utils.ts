/**
 * @file tab-sync.utils.ts
 * @description Gửi/nhận tin giữa các tab của CÙNG một trình duyệt — phần THUẦN
 * (không React), để mã ngoài cây component (tầng HTTP, interceptor) cũng dùng được.
 * `useMultiTabSync` / `useMultiTabBroadcaster` chỉ là lớp bọc mỏng bên trên.
 *
 * Ưu tiên `BroadcastChannel` (Chrome 54+, Firefox 38+, Safari 15.4+); trình duyệt
 * cũ rơi xuống sự kiện `storage` của localStorage.
 *
 * ⚠️ `BroadcastChannel` KHÔNG gửi lại cho chính đối tượng kênh đã gửi, nhưng gửi
 * cho MỌI đối tượng kênh khác cùng tên — kể cả trong CÙNG tab. Nên `postTabMessage`
 * (mở kênh tạm) vẫn đến được người đăng ký của chính tab này. Bên nhận nào cần bỏ
 * tin do mình gửi thì tự gắn `from` vào nội dung và lọc.
 */

/** Tiền tố khoá kênh — dùng chung cho cả BroadcastChannel lẫn khoá `storage`. */
const CHANNEL_PREFIX = 'app:sync:';

/** Gửi `message` tới các tab khác. Không bao giờ ném lỗi (đây là việc "cố gắng hết sức"). */
export function postTabMessage<T>(channelName: string, message: T): void {
  if (typeof window === 'undefined') return;
  const key = CHANNEL_PREFIX + channelName;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(key);
      channel.postMessage(message);
      channel.close();
      return;
    } catch {
      // rơi xuống nhánh storage
    }
  }

  // Ghi rồi xoá ngay để kích `storage` event ở tab khác mà không để lại rác.
  try {
    window.localStorage.setItem(key, JSON.stringify({ _t: Date.now(), payload: message }));
    window.localStorage.removeItem(key);
  } catch {
    // localStorage bị chặn (chế độ riêng tư nghiêm ngặt) — không có đường nào khác.
  }
}

/** Nhận tin của kênh. Trả hàm huỷ đăng ký. */
export function subscribeTabMessages<T>(
  channelName: string,
  handler: (message: T) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const key = CHANNEL_PREFIX + channelName;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(key);
      channel.onmessage = (event: MessageEvent<T>) => handler(event.data);
      return () => channel.close();
    } catch {
      // rơi xuống nhánh storage
    }
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key || event.newValue == null) return;
    try {
      handler((JSON.parse(event.newValue) as { payload: T }).payload);
    } catch {
      // tin hỏng — bỏ qua
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
