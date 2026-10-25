import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import Button from '@/shared/ui/actions/Button';
import { MODAL_OVERLAY_CLASS, modalStyles, modalLayoutStyles } from './modal.theme';
import { useOpenAutoFocus } from './modal.utils';

/**
 * `default` — khung chữ nhật viền brand.
 * `hud`     — khung vát 4 góc + viền màu theo biến CSS `--hud` (ConfirmDialog).
 */
export type ModalFrame = 'default' | 'hud';

/**
 * Bậc bề rộng của `Modal`: xs 320 · sm 400 · md 520 · lg 640 · xl 768 …
 *
 * ⚠️ `FormModal` dùng THANG RIÊNG và RỘNG HƠN (sm 560 · md 800 · lg 960 ·
 * xl 1200) — cùng chữ `md` nhưng 520 ở đây và 800 ở đó. Cố ý: form thường xếp
 * nhãn + ô theo 2 cột nên 520px là chật. Nhớ điều này khi đổi qua lại giữa
 * `<Modal>` và `<FormModal>`.
 */
export type ModalSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | 'auto'
  | 'screen'
  | 'full';

// Cap chung qua `max-w-[calc(100vw-32px)]` ở Content → các size lớn tự co theo viewport.
const SIZE_W: Record<ModalSize, string> = {
  xs: 'w-[320px]',
  sm: 'w-[400px]',
  md: 'w-[520px]',
  lg: 'w-[640px]',
  xl: 'w-[768px]',
  '2xl': 'w-[900px]',
  '3xl': 'w-[1024px]',
  '4xl': 'w-[1200px]',
  '5xl': 'w-[1400px]',
  '6xl': 'w-[1600px]',
  auto: 'w-auto',
  screen: 'w-[calc(100vw-64px)]',
  full: 'w-full px-10',
};

// ── Footer ────────────────────────────────────────────────────────────────────

interface ModalFooterProps {
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmCn?: string;
  /** Đang xử lý (submit/save) → nút xác nhận hiện loading, khóa cả 2 nút. */
  loading?: boolean;
}

/**
 * Footer mặc định — dùng `<Button>` của kit2 thay cho 3 hằng class tự chế
 * trước đây (BASE_BTN/CANCEL_BTN/CONFIRM_BTN). Nhờ vậy nút trong modal có
 * cùng focus ring + trạng thái active với mọi nút khác trong app.
 */
function ModalFooter({
  cancelLabel = 'Hủy bỏ',
  confirmLabel = 'Xác nhận',
  onCancel,
  onConfirm,
  confirmCn,
  loading = false,
}: ModalFooterProps) {
  return (
    // `w-full` — footer wrapper căn phải (`justify-end`), nếu không cụm nút
    // 2 cột `flex-1` sẽ co lại thay vì trải hết chiều ngang.
    <div className="flex w-full gap-3">
      <Button
        className="flex-1"
        disabled={loading}
        size="md"
        skin="neutral"
        type="button"
        variant="secondary"
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
      <Button
        className={cn('flex-1', confirmCn)}
        loading={loading}
        size="md"
        type="button"
        variant="primary"
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ModalProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Custom footer node. If omitted and onCancel/onConfirm provided, renders default buttons. */
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Kiểu khung panel. `hud` = vát 4 góc, màu viền theo `--hud`. */
  frame?: ModalFrame;
  showClose?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** Override confirm button classes (e.g. danger color). */
  confirmCn?: string;
  /** Đang xử lý → nút xác nhận (footer mặc định) hiện loading + khóa 2 nút. */
  loading?: boolean;
  /** Element that triggers the modal (uncontrolled mode). */
  trigger?: React.ReactNode;
  /**
   * When true, removes padding wrappers from body and footer so the consumer
   * can fully control inner layout (used by ConfirmDialog).
   */
  noPadding?: boolean;
  className?: string;
  /**
   * Passthrough Radix `onOpenAutoFocus` — chủ động chọn phần tử nhận focus khi mở
   * (vd `e.preventDefault(); inputRef.current?.focus()` để focus ô tìm thay vì nút
   * đóng mặc định). Bỏ trống → Radix focus phần tử focusable đầu tiên như cũ.
   * ⚠️ Ưu tiên hơn `autoFocusFirst`.
   */
  onOpenAutoFocus?: (event: Event) => void;
  /**
   * Tự focus ô input đầu tiên trong body modal (bỏ qua header close button +
   * footer). Mặc định `false` với `Modal` vì Modal thường dùng cho info/
   * confirm dialog. Bật `true` khi Modal chứa form nhập liệu.
   * Element có `data-autofocus="true"` được ưu tiên.
   */
  autoFocusFirst?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const layoutSlots = modalLayoutStyles();

function Modal({
  open,
  defaultOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  frame = 'default',
  showClose = true,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  confirmCn,
  loading = false,
  trigger,
  noPadding = false,
  className,
  onOpenAutoFocus,
  autoFocusFirst = false,
}: ModalProps) {
  const panelSlots = modalStyles({ frame });
  const contentRef = useRef<HTMLDivElement>(null);

  const handleOpenAutoFocus = useOpenAutoFocus(contentRef, {
    enabled: autoFocusFirst,
    onOpenAutoFocus,
  });
  const isHud = frame === 'hud';
  const hasHeader = !!(title ?? showClose);
  const hasBuiltinFooter = !!(onCancel ?? onConfirm);
  const resolvedFooter =
    footer ??
    (hasBuiltinFooter ? (
      <ModalFooter
        cancelLabel={cancelLabel}
        confirmCn={confirmCn}
        confirmLabel={confirmLabel}
        loading={loading}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    ) : null);

  return (
    <DialogPrimitive.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={MODAL_OVERLAY_CLASS} />

        <DialogPrimitive.Content
          ref={contentRef}
          className={cn(panelSlots.panel(), SIZE_W[size], className)}
          onClick={(e) => e.stopPropagation()}
          // Modal thường được render BÊN TRONG một row (vd row của react-arborist
          // trong kit2 Tree). Portal của React vẫn bubble event theo CÂY REACT, nên
          // phím gõ trong modal chui ngược lên handler của row/tree cha → type-ahead
          // của react-arborist gọi tree.focus(node) và CƯỚP focus khỏi ô Input.
          // Chặn tại biên overlay: handler BÊN TRONG modal đã chạy xong; chỉ cắt
          // đường lên ancestor. Escape/Enter của Radix dùng listener trên document
          // nên KHÔNG bị ảnh hưởng. (Cùng ý đồ với 2 dòng stopPropagation ở trên.)
          onKeyDown={(e) => e.stopPropagation()}
          onOpenAutoFocus={handleOpenAutoFocus}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Khung HUD vát góc — chỉ ở frame="hud"; z âm nên nằm dưới nội dung */}
          {isHud && (
            <>
              <span aria-hidden="true" className={panelSlots.frameEdge({ frame })} />
              <span aria-hidden="true" className={panelSlots.frameFill({ frame })} />
              <span aria-hidden="true" className={panelSlots.frameTick({ frame, tick: 'top' })} />
              <span
                aria-hidden="true"
                className={panelSlots.frameTick({ frame, tick: 'bottom' })}
              />
            </>
          )}

          {/* Trang trí khung — lưới nền + ray sáng mép trên + ngoặc 4 góc */}
          <span aria-hidden="true" className={panelSlots.texture({ frame })} />
          <span aria-hidden="true" className={panelSlots.topRail({ frame })} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'tl', frame })} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'tr', frame })} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'bl', frame })} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'br', frame })} />

          {/* Header — band vát góc vẽ TRƯỚC, nội dung `relative` để nằm trên */}
          {hasHeader && (
            <div className={cn(layoutSlots.header(), 'items-start py-3')}>
              <span aria-hidden="true" className={layoutSlots.headerBand()} />
              <span aria-hidden="true" className={layoutSlots.headerBandFill()} />

              <div className="relative flex min-w-0 flex-1 flex-col gap-1">
                {/*
                  Vạch + tiêu đề CÙNG một hàng `items-center` — tách khỏi khối
                  mô tả bên dưới. `items-center` canh vạch theo LINE-BOX thật
                  của dòng chữ, không phải một `mt-*` đoán tay theo cỡ chữ cụ
                  thể (bẫy cũ — xem ghi chú `titleBar` ở modal.theme.ts).
                */}
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className={layoutSlots.titleBar()} />
                  {title && (
                    <DialogPrimitive.Title className={cn(layoutSlots.title(), 'min-w-0')}>
                      {title}
                    </DialogPrimitive.Title>
                  )}
                </div>
                {description && (
                  // Thụt lề = bề rộng vạch (3px) + khe (10px, `gap-2.5`) để mô
                  // tả bắt đầu thẳng cột với chữ cái đầu của tiêu đề, không phải
                  // thẳng với vạch.
                  <DialogPrimitive.Description className="pl-[13px] text-caption-12 text-fg-on-dialog-muted">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>

              {showClose && (
                <DialogPrimitive.Close aria-label="Đóng" className={layoutSlots.close()}>
                  <SystemIcon name="xmark-outline" size={16} />
                </DialogPrimitive.Close>
              )}
            </div>
          )}

          {/* Body */}
          {children &&
            (noPadding ? (
              <>{children}</>
            ) : (
              <div className={cn(layoutSlots.body(), 'px-4 py-4')}>
                {!hasHeader ? (
                  // Radix requires Description accessible when no Title is set
                  <DialogPrimitive.Description asChild>
                    <div>{children}</div>
                  </DialogPrimitive.Description>
                ) : (
                  children
                )}
              </div>
            ))}

          {/* Footer */}
          {resolvedFooter &&
            (noPadding ? (
              <>{resolvedFooter}</>
            ) : (
              <div className={layoutSlots.footer()}>{resolvedFooter}</div>
            ))}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default Modal;
