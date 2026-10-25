import { useEffect, useRef } from 'react';

/**
 * Trễ một nhịp cho `FlashList` đo bố cục lô tin vừa tải — `scrollToItem` gọi ngay lúc hàng vừa xuất hiện trong `rows` thì
 * danh sách chưa có kích thước để cuộn tới (hiện vẫn ở đáy lô `around` như chưa có gì xảy ra).
 */
const LAYOUT_SETTLE_MS = 200;

/**
 * Mở màn ở `?m=<messageId>` (kết quả tìm / mục "Đã lưu" / tin ghim — p1-09, deep link p1-03): `useMessages` đã tải lô
 * `around` nhưng `MessageList` bắt đầu ở ĐÁY lô (`startRenderingFromBottom`) nên tin cần xem có thể nằm ngoài khung nhìn.
 * Khi hàng của tin xuất hiện lần ĐẦU (`isLoaded`), gọi `jumpTo` (cuộn giữa màn + tô nổi 2 giây) đúng MỘT lần cho mỗi id —
 * không kéo người dùng về lại tin đó mỗi lần danh sách đổi (tin mới tới, tải thêm trang cũ…).
 *
 * `jumpTo` đi qua ref: nó đổi tham chiếu mỗi lần `rows` đổi, để vào deps thì hẹn giờ bị huỷ/đặt lại liên tục.
 */
export function useOpenAtMessage(
  messageId: string | undefined,
  isLoaded: boolean,
  jumpTo: (messageId: string) => void,
): void {
  const doneRef = useRef<string | undefined>(undefined);
  const jumpRef = useRef(jumpTo);

  useEffect(() => {
    jumpRef.current = jumpTo;
  });

  useEffect(() => {
    // "Đã làm rồi" chỉ có nghĩa cho MỘT lần đặt mục tiêu: mục tiêu bị xoá (nhảy xong) thì lần đặt lại đúng tin đó (chạm thanh ghim lần nữa
    // sau khi đã về "tin mới nhất") phải chạy lại, không bị `doneRef` chặn.
    if (!messageId) {
      doneRef.current = undefined;
      return undefined;
    }
    if (!isLoaded || doneRef.current === messageId) return undefined;
    const timer = setTimeout(() => {
      doneRef.current = messageId;
      jumpRef.current(messageId);
    }, LAYOUT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [messageId, isLoaded]);
}
