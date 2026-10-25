import { ConfirmSheet } from '@/shared/ui/bottom-sheet';

export interface ConfirmHostActionDialogProps {
  confirmLabel: string;
  /** Hành động không hoàn tác được (mời ra, kết thúc) ⇒ ô biểu tượng + nút xác nhận ĐỎ. Việc hoàn tác được (khoá phòng, tắt mic tất cả) để `false`. */
  danger?: boolean;
  description: string;
  /** Đang gọi API — nút xác nhận khoá + vòng quay, "Huỷ" khoá, không đóng được bằng nền mờ giữa chừng. */
  loading?: boolean;
  title: string;
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Xác nhận thao tác chủ trì trước khi gọi API (app.md p2-05 §3.2 `ConfirmHostActionDialog`): mời ra khỏi cuộc họp, tắt mic tất cả, kết thúc…
 * Nêu RÕ tên người/hậu quả trong `title`/`description` — cha ghép chuỗi ("Mời Lan ra khỏi cuộc họp?"). Không optimistic cho mời ra/khoá
 * (chờ server), nên nút `loading` cho tới khi có kết quả.
 *
 * ✅ Tấm xác nhận đáy (`ConfirmSheet`) thay hộp thoại giữa màn: cùng khuôn với các tấm khác của phòng (Rời, Thêm, Người tham gia), nút nằm
 * trong tầm ngón cái, và `danger` tô ĐỎ chính nút xác nhận — `Dialog` cũ chỉ đổi biểu tượng, nút "Kết thúc"/"Mời ra" vẫn màu thương hiệu.
 * ⚠️ Nút xếp DỌC (chính trên): "Tắt mic tất cả" không vừa nửa hàng ở máy 320dp / cỡ chữ 1.3 (nhãn một dòng bị cắt).
 */
export function ConfirmHostActionDialog({
  confirmLabel,
  danger = false,
  description,
  loading = false,
  title,
  visible,
  onCancel,
  onConfirm,
}: ConfirmHostActionDialogProps) {
  return (
    <ConfirmSheet
      actionsLayout="column"
      confirmLabel={confirmLabel}
      description={description}
      icon={danger ? 'alert-warning' : 'alert-information'}
      loading={loading}
      title={title}
      tone={danger ? 'danger' : 'primary'}
      visible={visible}
      onClose={onCancel}
      onConfirm={onConfirm}
    />
  );
}
