import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { type FieldValues, FormProvider, type UseFormReturn } from 'react-hook-form';
import { toSafeLog } from '@/shared/utils/error-log.utils';
import { cn } from '@/shared/utils/style/cn';
import Button, { type ButtonSize } from '@/shared/ui/actions/Button';
import { FormMetaProvider } from '@/shared/ui/form/form.context';
import CustomModalLayout from './CustomModalLayout';
import { MODAL_OVERLAY_CLASS, modalStyles } from './modal.theme';
import { useOpenAutoFocus } from './modal.utils';

/**
 * FormModal — full-page form modal.
 *
 * Figma: PMS-NEW node 1644-77325.
 * Dùng `CustomModalLayout` làm khung dark-flat (header + divider · body có
 * padding · footer + divider). Radix Dialog lo overlay, animation, a11y
 * (focus trap, Escape, aria). Title hiển thị uppercase; bản a11y giữ
 * nguyên case qua `DialogPrimitive.Title` ẩn (`sr-only`).
 */

// ── Sizes ─────────────────────────────────────────────────────────────────────

/**
 * Bậc bề rộng của `FormModal`: sm 560 · md 800 · lg 960 · xl 1200.
 *
 * ⚠️ RỘNG HƠN thang của `Modal` (sm 400 · md 520 · lg 640 · xl 768) ở cùng tên
 * bậc. Cố ý: form xếp nhãn + ô theo 2 cột nên 520px là chật. Đổi `<Modal>` sang
 * `<FormModal>` mà giữ nguyên `size` thì hộp thoại sẽ rộng ra thấy rõ.
 */
export type FormModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_W: Record<FormModalSize, string> = {
  sm: 'w-[560px]',
  md: 'w-[800px]',
  lg: 'w-[960px]',
  xl: 'w-[1200px]',
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FormModalProps<T extends FieldValues = FieldValues> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Header title — displayed uppercase. */
  title: string;
  children?: React.ReactNode;
  size?: FormModalSize;
  /** Kích thước button footer (Hủy/Xác nhận). Mặc định `md`. */
  buttonSize?: ButtonSize;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel?: () => void;
  /** Called on confirm click. When `form` is provided, this is the submit handler. */
  onConfirm?: (data?: T) => void | Promise<void>;
  /** Node phụ ở footer (bên trái, vd nút "Lưu nháp"). */
  extraActions?: React.ReactNode;
  /** When true, body area scrolls independently (max-h-[60vh]). */
  scrollable?: boolean;
  /**
   * When true, body + form fill the modal height as a bounded flex column
   * (`min-h-0 flex-1 overflow-hidden`) so children manage their own scroll.
   * Pair with a fixed-height `className` (vd `h-[90vh]`). Opt-in — mặc định
   * không đổi hành vi modal khác.
   */
  fitHeight?: boolean;
  /** Element that triggers the modal (uncontrolled mode). */
  trigger?: React.ReactNode;
  className?: string;
  /**
   * When provided, the modal wraps children in FormProvider and wires the
   * confirm button to form.handleSubmit(onConfirm).
   */
  form?: UseFormReturn<T>;
  readOnly?: boolean;
  /** Vô hiệu hoá nút xác nhận (vd khi chờ pre-check pass). */
  confirmDisabled?: boolean;
  /**
   * Bảng màu của nút xác nhận. `danger` (đỏ) cho thao tác phá huỷ/khó hoàn tác (khoá tài khoản, xoá,
   * ẩn nội dung); bỏ trống = màu thương hiệu.
   */
  confirmSkin?: 'danger';
  /**
   * Ẩn cặp nút mặc định (Huỷ / Xác nhận) để tự dựng TOÀN BỘ footer qua
   * `extraActions`. Dùng khi form có > 2 hành động hoặc cần thứ tự nút riêng
   * (vd Tạo công văn: Hủy bỏ · Lưu nháp · Gửi đi — cả ba canh phải).
   * Khi bật, `extraActions` chiếm trọn bề ngang footer.
   */
  hideDefaultFooter?: boolean;
  /**
   * Tự focus ô nhập liệu ĐẦU TIÊN trong form khi mở modal. Mặc định `true`.
   * Bỏ qua nút footer (Xác nhận/Huỷ) để tránh Enter accidental submit.
   * - Element có attribute `data-autofocus="true"` được ưu tiên.
   * - Element có `data-modal-autofocus-skip="true"` sẽ bị bỏ qua.
   * Truyền `false` khi modal chỉ hiển thị info (không có input) hoặc muốn
   * giữ hành vi mặc định của Radix.
   */
  autoFocusFirst?: boolean;
  /**
   * Ghi đè hoàn toàn hành vi auto-focus của Radix. Nhận Event, gọi
   * `event.preventDefault()` nếu muốn tự chọn phần tử focus. Ưu tiên hơn
   * `autoFocusFirst`.
   */
  onOpenAutoFocus?: (event: Event) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const panelSlots = modalStyles();

function FormModal<T extends FieldValues = FieldValues>({
  open,
  defaultOpen,
  onOpenChange,
  title,
  children,
  size = 'md',
  buttonSize = 'md',
  cancelLabel = 'Hủy bỏ',
  confirmLabel = 'Xác nhận',
  onCancel,
  onConfirm,
  scrollable = false,
  fitHeight = false,
  trigger,
  className,
  form,
  readOnly = false,
  confirmDisabled = false,
  confirmSkin,
  extraActions,
  hideDefaultFooter = false,
  autoFocusFirst = true,
  onOpenAutoFocus,
}: FormModalProps<T>) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCancel = () => {
    onCancel?.();
    onOpenChange?.(false);
  };

  // Radix gọi `onOpenAutoFocus` khi mở dialog. Mặc định Radix focus phần tử
  // focusable đầu tiên (thường rơi vào nút đóng ở header) → user vẫn phải
  // click ra ô input. `preventDefault()` rồi tự focus vào input đầu tiên
  // trong body form → user gõ được luôn.
  const handleOpenAutoFocus = useOpenAutoFocus(contentRef, {
    enabled: autoFocusFirst,
    onOpenAutoFocus,
    preferForm: true,
  });

  /**
   * Gửi form.
   *
   * ⛔ CẢ HAI nhánh đều phải bắt lỗi, vì NÉM LỖI LÀ API ĐƯỢC TÀI LIỆU HOÁ:
   * `docs/rules/form-validation.md §4` dạy `form.setError(...)` rồi
   * `throw` để chặn modal đóng khi trùng mã. Không bắt thì:
   *  - nhánh có form: `handleSubmit` của RHF ném tiếp → unhandled rejection,
   *    người dùng thấy modal đứng im còn console đỏ lòm;
   *  - nhánh không form: mất luôn thông tin lỗi.
   *
   * Bắt xong thì KHÔNG đóng modal — đó chính là điều bên gọi muốn. Lỗi để
   * nguyên cho bên gọi hiển thị (thường là `setError` dưới ô nhập).
   */
  const closeOnSuccess = async (run: () => Promise<void> | void) => {
    try {
      await run();
      onOpenChange?.(false);
    } catch (err) {
      // `console.error` chứ không phải `console.log`: đây là lỗi, và nó cần
      // hiện đúng mức nghiêm trọng trong công cụ phát triển.
      // `toSafeLog`: lỗi axios mang theo `config.data` (mật khẩu) và `Authorization` (token).
      console.error('[FormModal] onConfirm ném lỗi — giữ modal mở:', toSafeLog(err));
    }
  };

  const handleConfirm = form
    ? form.handleSubmit((data) => closeOnSuccess(() => onConfirm?.(data)))
    : () => closeOnSuccess(() => onConfirm?.());

  const isSubmitting = form?.formState.isSubmitting ?? false;

  return (
    <DialogPrimitive.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={MODAL_OVERLAY_CLASS} />

        {/* Panel — dùng chung khung + trang trí với `Modal` qua modal.theme */}
        <DialogPrimitive.Content
          ref={contentRef}
          // FormModal không có vùng mô tả → nói rõ với Radix là KHÔNG có
          // `aria-describedby`, nếu không mỗi lần mở modal console lại cảnh báo
          // "Missing `Description` or `aria-describedby`".
          aria-describedby={undefined}
          // ⛔ `touch:` DÙNG `dvh`, KHÔNG PHẢI `vh` — cùng lý do đã ghi ở
          // `modal.theme.ts`: Safari iPad tính `100vh` theo lúc thanh URL ĐÃ THU
          // LẠI nên nó LỚN HƠN vùng nhìn thấy ~60–90px. Modal cao `90vh` vì thế
          // thò xuống dưới thanh công cụ và HÀNG NÚT [Huỷ] [Lưu] ở chân modal nằm
          // ngoài màn — người dùng không bấm được, cũng không cuộn tới được vì
          // chính panel mới là thứ bị tràn. Thấy rõ nhất ở iPad mini/Air NẰM NGANG
          // (cao 744/820px). Trên mọi trình duyệt máy tính `dvh === vh` → PC và
          // laptop KHÔNG đổi một pixel nào.
          className={cn(
            panelSlots.panel(),
            'max-h-[90vh] touch:max-h-[90dvh]',
            SIZE_W[size],
            className,
          )}
          onClick={(e) => e.stopPropagation()}
          onOpenAutoFocus={handleOpenAutoFocus}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Trang trí khung — lưới nền + ray sáng mép trên + ngoặc 4 góc */}
          <span aria-hidden="true" className={panelSlots.texture()} />
          <span aria-hidden="true" className={panelSlots.topRail()} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'tl' })} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'tr' })} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'bl' })} />
          <span aria-hidden="true" className={panelSlots.corner({ at: 'br' })} />

          {/* A11y title — Radix cần Title; bản hiển thị do CustomModalLayout render */}
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

          <CustomModalLayout
            bodyClassName={cn(
              'p-4 min-h-0',
              fitHeight
                ? 'overflow-hidden'
                : scrollable
                  ? // ⚠️ KHÔNG `[scrollbar-gutter:stable]` ở đây: gutter chỉ chừa
                    // cạnh phải và nằm NGOÀI padding → body thành 16px trái /
                    // 26px phải, lệch so với header + footer. Xem `modal.theme.ts`
                    // slot `body`. Cần chống jitter thì dùng `stable both-edges`.
                    'overflow-y-auto'
                  : 'overflow-visible',
            )}
            className="min-h-0 flex-1"
            footer={
              <div
                className="flex w-full items-center justify-between gap-4"
                data-modal-footer="true"
              >
                {/* `hideDefaultFooter` → `extraActions` tự dựng cả footer nên
                    cho nó chiếm trọn bề ngang (căn phải là việc của caller). */}
                <div className={cn('flex items-center gap-4', hideDefaultFooter && 'w-full')}>
                  {extraActions}
                </div>
                {!hideDefaultFooter && (
                  <div className="flex items-center gap-4">
                    <Button
                      size={buttonSize}
                      type="button"
                      variant="secondary"
                      onClick={handleCancel}
                    >
                      {cancelLabel}
                    </Button>
                    <Button
                      disabled={confirmDisabled || isSubmitting}
                      form={form ? 'form-modal-form' : undefined}
                      loading={isSubmitting}
                      size={buttonSize}
                      skin={confirmSkin}
                      type={form ? 'submit' : 'button'}
                      variant="primary"
                      onClick={form ? undefined : handleConfirm}
                    >
                      {isSubmitting ? 'Đang xử lý...' : confirmLabel}
                    </Button>
                  </div>
                )}
              </div>
            }
            title={title.toUpperCase()}
            onClose={() => onOpenChange?.(false)}
          >
            {form ? (
              <FormProvider {...form}>
                <FormMetaProvider value={{ readOnly, autoSave: false }}>
                  <form
                    className={cn(
                      'flex flex-col gap-4',
                      fitHeight && 'min-h-0 flex-1 overflow-hidden h-full',
                    )}
                    id="form-modal-form"
                    noValidate
                    onSubmit={handleConfirm}
                  >
                    {children}
                  </form>
                </FormMetaProvider>
              </FormProvider>
            ) : (
              children
            )}
          </CustomModalLayout>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default FormModal;
