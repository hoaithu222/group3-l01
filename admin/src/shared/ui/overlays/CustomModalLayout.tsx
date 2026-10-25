import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { modalLayoutStyles } from './modal.theme';

export interface CustomModalLayoutProps {
  /** Tiêu đề hiển thị ở thanh header. */
  title?: React.ReactNode;
  /**
   * Header tùy biến — khi truyền, THAY THẾ block `<p>{title}</p>` mặc định và
   * nới chiều cao header (auto height, `min-h-12`) để chứa nội dung nhiều dòng.
   * Dùng cho header có hierarchy (vd: số + meta + badge). Nếu không truyền,
   * header giữ nguyên hành vi 1 dòng `h-12` từ `title`.
   */
  header?: React.ReactNode;
  /** Override class cho vùng header bar (vd: padding dọc cho header nhiều dòng). */
  headerClassName?: string;
  /** Khi truyền, hiện nút đóng (xmark) ở góc phải header. */
  onClose?: () => void;
  /** Nội dung footer (thường là cụm Button). Không truyền → ẩn footer. */
  footer?: React.ReactNode;
  /** Hiện thanh header (title/header + close). Mặc định true. Đặt false để ẩn hẳn header bar. */
  showHeader?: boolean;
  /** Hiện divider ngăn cách dưới header. Mặc định true (theo design). */
  showDividerHeader?: boolean;
  /** Hiện divider ngăn cách trên footer. Mặc định true. */
  showDividerFooter?: boolean;
  /** Override class cho container ngoài cùng (vd: width). */
  className?: string;
  /** Override class vùng body (vd: bỏ padding để layout full-height tự quản). */
  bodyClassName?: string;
  children?: React.ReactNode;
}

const slots = modalLayoutStyles();

/**
 * CustomModalLayout — khung panel modal (header · body · footer).
 *
 * Là layout thuần (không bao Dialog) — đặt bên trong `Modal`/overlay hoặc dùng
 * độc lập. Width do `className` quyết định (mặc định `w-full`).
 *
 * Header: mặc định render `title` trong 1 dòng `h-12` (truncate). Truyền
 * `header` (ReactNode) để thay bằng header nhiều dòng (auto height, `min-h-12`)
 * — `title` bị bỏ qua khi có `header`.
 *
 * ⚠️ SỬA LỖI LIGHT MODE: bản cũ dùng `text-neutral-0` (TRẮNG) cho tiêu đề trên
 * nền `bg-bg-1` (cũng TRẮNG ở light theme) → tiêu đề modal vô hình khi bật chế
 * độ sáng; divider `neutral-0/10` cũng biến mất. Nay dùng token tự đảo theme
 * (`fg-1`, `divider-1`) nên đọc được ở cả hai theme.
 */
function CustomModalLayout({
  title,
  header,
  headerClassName,
  onClose,
  footer,
  showHeader = true,
  showDividerHeader = true,
  showDividerFooter = true,
  className,
  bodyClassName,
  children,
}: CustomModalLayoutProps) {
  return (
    <div className={cn(slots.root(), className)}>
      {/* Header — bar + ray gradient phía dưới */}
      {showHeader && (
        <div
          className={cn(
            slots.header(),
            // 1 dòng (title) → căn giữa cố định h-12; header tùy biến → auto height
            header ? 'min-h-12 items-start py-3' : 'h-12',
            headerClassName,
          )}
        >
          {/* Band vát góc — vẽ TRƯỚC nội dung; nội dung dùng `relative` để nằm trên */}
          {showDividerHeader && <span aria-hidden="true" className={slots.headerBand()} />}
          <span aria-hidden="true" className={slots.headerBandFill()} />

          {header ? (
            <div className="relative min-w-0 flex-1">{header}</div>
          ) : (
            <div className="relative flex min-w-0 flex-1 items-center gap-2.5">
              <span aria-hidden="true" className={slots.titleBar()} />
              <p className={slots.title()}>{title}</p>
            </div>
          )}

          {onClose && (
            <button
              aria-label="Đóng"
              className={cn(slots.close(), header && 'mt-0.5')}
              type="button"
              onClick={onClose}
            >
              <SystemIcon name="xmark-outline" size={14} />
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className={cn(slots.body(), 'px-4 py-4', bodyClassName)}>{children}</div>

      {/* Footer */}
      {footer && (
        <div className={cn(slots.footer(), !showDividerFooter && 'before:hidden')}>{footer}</div>
      )}
    </div>
  );
}

export default CustomModalLayout;
