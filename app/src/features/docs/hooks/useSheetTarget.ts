import { useCallback, useState } from 'react';

/**
 * Một tấm/hộp thoại gắn với MỘT đối tượng (hàng được chọn): `open(target)` mở, `close()` chỉ ẩn còn `target` GIỮ LẠI.
 * ⚠️ Không đặt `target` về `null` lúc đóng: tấm trượt còn chạy hiệu ứng đóng ~250 ms, xoá nội dung ngay là thấy tấm rỗng/nhảy chiều cao.
 */
export function useSheetTarget<T>() {
  const [state, setState] = useState<{ target: T | null; visible: boolean }>({
    target: null,
    visible: false,
  });
  const open = useCallback((target: T) => setState({ target, visible: true }), []);
  const close = useCallback(() => setState((prev) => ({ ...prev, visible: false })), []);
  return { close, open, target: state.target, visible: state.visible };
}

/** Tấm/hộp thoại KHÔNG gắn đối tượng nào (đổi tên tài liệu đang mở, lưu phiên bản…): chỉ mở/đóng. */
export function useDisclosure() {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return { close, open, visible };
}
