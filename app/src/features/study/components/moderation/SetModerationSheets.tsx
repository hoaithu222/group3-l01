import type { ModerationKind } from '../../api/study.types';
import { SetModerationSheet } from './SetModerationSheet';

export interface SetModerationSheetsProps {
  /** Tấm đang mở; `null` = cả hai đóng. */
  open: ModerationKind | null;
  setId: string;
  setTitle: string;
  onClose: () => void;
}

/**
 * Hai tấm Ẩn / Khôi phục cạnh nhau, bật bằng `open`. Mỗi chiều MỘT tấm riêng (không đổi `kind` của một tấm) để lý do đã gõ, lỗi của lượt gửi trước và hook
 * mutation không lẫn giữa hai chiều, và để chữ trên tấm không nhảy về bản của chiều kia lúc nó đang trượt xuống (nếu dùng một tấm, đặt `open = null`
 * là tiêu đề/nút đổi ngay trong hiệu ứng đóng).
 */
export function SetModerationSheets({ onClose, open, setId, setTitle }: SetModerationSheetsProps) {
  return (
    <>
      <SetModerationSheet
        kind="hide"
        setId={setId}
        setTitle={setTitle}
        visible={open === 'hide'}
        onClose={onClose}
      />
      <SetModerationSheet
        kind="unhide"
        setId={setId}
        setTitle={setTitle}
        visible={open === 'unhide'}
        onClose={onClose}
      />
    </>
  );
}
