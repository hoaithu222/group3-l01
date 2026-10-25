import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import GemIcon from '../icons/GemIcon';
import Modal from './Modal';
import Button from '@/shared/ui/actions/Button';
import {
  CONFIRM_VARIANTS,
  confirmDialogStyles,
  type ConfirmDialogVariant,
} from './confirm-dialog.theme';

/**
 * ConfirmDialog — hộp thoại xác nhận khung HUD (vát 4 góc).
 *
 * Figma: PMS-NEW node 469-4474 · variant: confirm · delete · success · warning · info.
 *
 * Layout CỐ TÌNH khác `FormModal`: mọi thứ dồn về trục giữa
 *   gem (kèm 2 cánh) → tiêu đề → mô tả → [khuyến nghị] → hàng nút
 *
 * Hàng nút mặc định [huỷ · chính]. Khai `secondaryActionLabel` → 3 nút [huỷ ·
 * phụ · chính] khi có lối thoát thứ ba (vd "Ở lại · Lưu & Rời khỏi · Rời khỏi").
 *
 * Khung giữ brand green cho MỌI variant; màu ngữ nghĩa (đỏ/vàng/xanh) chỉ nằm ở
 * gem + nút hành động + quầng nhỏ sau gem, qua biến CSS `--accent`. Lý do &
 * cấu hình: `confirm-dialog.theme.ts` §PHÂN VAI MÀU + §CONFIRM_VARIANTS.
 */

export type { ConfirmDialogVariant };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: ConfirmDialogVariant;
  title: string;
  description?: React.ReactNode;
  /**
   * Dòng khuyến nghị dưới mô tả (vd "Lưu thay đổi trước khi rời trang").
   * Bỏ trống → không render cả cụm divider + dòng gợi ý.
   */
  recommendation?: React.ReactNode;
  cancelLabel?: string;
  actionLabel?: string;
  /** Nhãn nút hành động PHỤ (giữa). Có nhãn → bố cục 3 nút; bỏ trống → 2 nút. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** Spinner + khoá nút cho riêng hành động phụ (vd đang gọi API lưu). */
  secondaryLoading?: boolean;
  /** Custom icon inside the GemIcon (overrides variant default). */
  icon?: React.ReactNode;
  /** Hiển thị spinner + disable buttons trên nút action (vd: đang gọi API). */
  loading?: boolean;
  /** Nút đóng (✕) góc phải trên. Mặc định hiện. */
  showClose?: boolean;
  /**
   * Tự đóng dialog ngay khi confirm (mặc định true).
   * Đặt false khi cần giữ dialog mở tới lúc tác vụ async xong — caller tự đóng.
   */
  closeOnConfirm?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** Element that triggers the dialog (uncontrolled mode). */
  children?: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  defaultOpen,
  onOpenChange,
  variant = 'confirm',
  title,
  description,
  recommendation,
  cancelLabel = 'Hủy bỏ',
  actionLabel,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryLoading = false,
  icon,
  loading = false,
  showClose = true,
  closeOnConfirm = true,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const cfg = CONFIRM_VARIANTS[variant];
  const label = actionLabel ?? cfg.defaultLabel;
  const actionExtraCn = 'actionCn' in cfg ? cfg.actionCn : undefined;
  const hasSecondary = !!secondaryActionLabel;
  const slots = confirmDialogStyles({ triple: hasSecondary });
  // Đang chạy 1 nhánh → khoá cả hàng nút + ✕ (đừng cho bấm "Rời khỏi" giữa lúc lưu).
  const busy = loading || secondaryLoading;

  const handleCancel = () => {
    if (busy) return;
    onCancel?.();
    onOpenChange?.(false);
  };

  const handleConfirm = () => {
    onConfirm?.();
  };

  const handleSecondaryAction = () => {
    onSecondaryAction?.();
  };

  /**
   * Đóng dialog sau khi hành động chạy xong.
   *
   * ⛔ KHÔNG tự gọi `onOpenChange?.(false)`: ở chế độ uncontrolled (truyền
   * `children` làm trigger, không có `open`/`onOpenChange`) prop đó là
   * `undefined` → dialog KHÔNG BAO GIỜ đóng. Bọc `DialogPrimitive.Close` để
   * Radix tự hạ cờ `open` nội bộ VÀ vẫn bắn `onOpenChange(false)` lên caller
   * controlled → chạy đúng cho cả hai chế độ.
   */
  const withClose = (node: React.ReactNode) =>
    closeOnConfirm ? (
      <DialogPrimitive.Close asChild disabled={busy}>
        {node}
      </DialogPrimitive.Close>
    ) : (
      node
    );

  return (
    <Modal
      // `cfg.accent` set biến `--accent` (màu ngữ nghĩa) trên panel → quầng sau
      // gem + glow nút đọc theo. Khung giữ brand green. `w-[460px]` nới hơn size
      // sm để mô tả căn giữa không bị gãy dòng xấu; 3 nút cần thêm bề ngang.
      className={cn(hasSecondary ? 'w-[540px]' : 'w-[460px]', cfg.accent)}
      defaultOpen={defaultOpen}
      frame="hud"
      noPadding
      open={open}
      showClose={false}
      size="sm"
      trigger={children}
      onOpenChange={onOpenChange}
    >
      <div className={slots.root()}>
        {/* Nền: quầng variant (trên-trái) · quầng teal (dưới-phải) · sheen chéo */}
        <span aria-hidden className={slots.aura()} />
        <span aria-hidden className={slots.counterGlow()} />
        <span aria-hidden className={slots.sheen()} />

        {showClose && (
          <DialogPrimitive.Close aria-label="Đóng" className={slots.close()} disabled={busy}>
            <SystemIcon name="xmark-outline" size={16} />
          </DialogPrimitive.Close>
        )}

        {/* Gem + 2 cánh gạch ngang */}
        <div className={slots.gemRow()}>
          <span aria-hidden className={slots.wing({ side: 'left' })} />
          <GemIcon
            color={cfg.gemColor}
            icon={icon ?? <SystemIcon className={cfg.iconCn} name={cfg.icon} />}
            size="md"
          />
          <span aria-hidden className={slots.wing({ side: 'right' })} />
        </div>

        {/* Radix cần Title/Description để đọc màn hình thông báo đúng */}
        <div className={slots.titleGroup()}>
          <DialogPrimitive.Title className={slots.title()}>{title}</DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className={slots.description()}>
              {description}
            </DialogPrimitive.Description>
          )}
        </div>

        {recommendation && (
          <>
            <span aria-hidden className={slots.divider()} />
            <div className={slots.tipRow()}>
              <SystemIcon className="text-primary-5" name="bolt-lightning-outline" size={16} />
              <span className={slots.tipLabel()}>Khuyến nghị:</span>
              <span className={slots.tipText()}>{recommendation}</span>
            </div>
          </>
        )}

        <span aria-hidden className={slots.divider()} />

        <div className={slots.actions()}>
          <DialogPrimitive.Close asChild disabled={busy}>
            <Button
              className={slots.cancel()}
              disabled={busy}
              size="lg"
              skin="neutral"
              variant="secondary"
              onClick={handleCancel}
            >
              {cancelLabel}
            </Button>
          </DialogPrimitive.Close>
          {hasSecondary &&
            withClose(
              <Button
                className={slots.secondaryAction()}
                disabled={busy}
                loading={secondaryLoading}
                size="lg"
                onClick={handleSecondaryAction}
              >
                {secondaryActionLabel}
              </Button>,
            )}
          {withClose(
            <Button
              className={cn(slots.action(), actionExtraCn)}
              disabled={busy}
              loading={loading}
              size="lg"
              skin={'actionSkin' in cfg ? cfg.actionSkin : undefined}
              onClick={handleConfirm}
            >
              {label}
            </Button>,
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
