import { memo, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/shared/utils/style/cn';

/**
 * TimeColumn — một cột số cuộn được (Giờ hoặc Phút) trong panel của `TimePicker`.
 *
 * Helper NỘI BỘ của time-picker — KHÔNG re-export ra `@/shared/ui`.
 */
interface TimeColumnProps {
  label: string;
  items: number[];
  /** Số đang chọn — `null` khi chưa có giá trị. */
  value: number | null;
  onPick: (n: number) => void;
  className?: string;
}

/** Chiều cao mỗi ô — phải khớp `h-9` bên dưới, dùng để tính `scrollTop`. */
const CELL_H = 36;

const pad2 = (n: number) => String(n).padStart(2, '0');

export const TimeColumn = memo(function TimeColumn({
  label,
  items,
  value,
  onPick,
  className,
}: TimeColumnProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Panel unmount khi đóng → effect này chạy đúng mỗi lần MỞ: kéo ô đang chọn
  // vào giữa tầm nhìn. Dùng `scrollTop` thay `scrollIntoView` để tuyệt đối
  // không đụng tới scroll của trang phía sau.
  useEffect(() => {
    const list = listRef.current;
    if (!list || value == null) return;
    const idx = items.indexOf(value);
    if (idx < 0) return;
    list.scrollTop = Math.max(0, idx * CELL_H - (list.clientHeight - CELL_H) / 2);
  }, [items, value]);

  // Popover portal ra ngoài Dialog có thể bị RemoveScroll (scroll-lock của
  // Modal) chặn wheel → tự cuộn tay để chắc chắn dùng được trong Modal.
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.currentTarget.scrollTop += e.deltaY;
  }, []);

  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', className)}>
      <span className="border-b border-divider-2 px-3 py-2 text-center text-caption-12-medium text-fg-4">
        {label}
      </span>
      <div ref={listRef} className="max-h-[200px] overflow-y-auto py-1" onWheel={handleWheel}>
        {items.map((n) => (
          <button
            key={n}
            className={cn(
              'flex h-9 w-full cursor-pointer items-center justify-center text-body-14 transition-colors',
              n === value
                ? 'bg-primary-6 text-body-14-semibold text-neutral-0'
                : 'text-fg-1 hover:bg-bg-2',
            )}
            type="button"
            onClick={() => onPick(n)}
          >
            {pad2(n)}
          </button>
        ))}
      </div>
    </div>
  );
});
