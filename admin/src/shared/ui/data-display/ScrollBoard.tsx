/**
 * ScrollBoard — bảng TỰ CUỘN cho màn hình treo tường.
 *
 * Bài toán nó giải: một màn hình không ai bấm vào (sảnh, phòng điều hành) cần
 * cho xem 40 dòng trong khoảng cao chỉ đủ 8 dòng. Không có chuột để cuộn, nên
 * bảng phải tự đưa dòng tiếp theo lên.
 *
 * ── Bốn thứ bản gốc (DataV `scrollBoard`) KHÔNG có, ở đây có ───────────────
 *
 * 1. **Vừa khung thì KHÔNG cuộn.** `data.length <= rowCount` ⇒ bảng đứng yên
 *    hoàn toàn. Bản gốc vẫn chạy vòng lặp, nên một bảng 3 dòng trong khung 8
 *    dòng cứ nhích lên rồi nhảy về — trông như lỗi hiển thị.
 * 2. **Rê chuột vào thì DỪNG.** Người đi ngang muốn đọc kỹ một dòng thì dòng
 *    đó phải chịu đứng yên. Cuộn tiếp ngay khi chuột rời đi.
 * 3. **`prefers-reduced-motion` ⇒ tắt tự cuộn**, đổi sang vùng cuộn tay bình
 *    thường — vẫn xem được đủ dữ liệu, chỉ là không tự chạy.
 * 4. **Tab ẩn thì dừng.** `document.hidden` ⇒ hẹn giờ ngưng, nên bảng mở nền
 *    cả ngày không đốt CPU và không "nhảy cóc" 200 dòng khi quay lại tab.
 *
 * ⚠️ CHIỀU CAO DÒNG LÀ CỐ ĐỊNH (`rowHeight`). Đây là ràng buộc thật, không
 *    phải cho tiện: phép cuộn dịch đúng một `rowHeight` mỗi nhịp, nên dòng cao
 *    thấp khác nhau sẽ trôi lệch dần và cuối cùng cắt ngang giữa chữ. Nội dung
 *    dài phải `truncate`, đừng để xuống dòng.
 *
 * ⛔ ĐỪNG dùng cho bảng người dùng CẦN thao tác (sắp xếp, chọn dòng, phân
 *    trang) — dùng `<Table>`. Bảng này để NGẮM, không để làm việc.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { usePrefersReducedMotion } from '@/shared/hooks';
import { cn } from '@/shared/utils/style/cn';

export interface ScrollBoardColumn<TRow> {
  key: string;
  header?: ReactNode;
  /** Bề ngang cột. Số ⇒ px cố định; bỏ trống ⇒ chia đều phần còn lại. */
  width?: number;
  align?: 'left' | 'center' | 'right';
  cell: (row: TRow, index: number) => ReactNode;
}

export interface ScrollBoardProps<TRow> {
  data: readonly TRow[];
  columns: readonly ScrollBoardColumn<TRow>[];
  rowKey: (row: TRow, index: number) => string | number;
  /** Số dòng hiện cùng lúc. Mặc định 6. */
  rowCount?: number;
  /** Chiều cao mỗi dòng (px). Mặc định 40. Xem cảnh báo ở đầu file. */
  rowHeight?: number;
  /** Nhịp chờ giữa hai lần nhích (ms). Mặc định 2500. */
  interval?: number;
  /** Ẩn hàng tiêu đề. */
  hideHeader?: boolean;
  /** Dừng tự cuộn từ bên ngoài (vd khi mở hộp thoại đè lên). */
  paused?: boolean;
  className?: string;
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

function ScrollBoardInner<TRow>({
  data,
  columns,
  rowKey,
  rowCount = 6,
  rowHeight = 40,
  interval = 2500,
  hideHeader = false,
  paused = false,
  className,
}: ScrollBoardProps<TRow>) {
  const reducedMotion = usePrefersReducedMotion();
  const [hovering, setHovering] = useState(false);
  const [offset, setOffset] = useState(0);
  // `shifting` bật trong lúc dòng đang trượt lên; tắt xong mới cộng `offset`.
  const [shifting, setShifting] = useState(false);

  const overflowing = data.length > rowCount;
  const autoScroll = overflowing && !reducedMotion && !paused && !hovering;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoScroll) return;

    let cancelled = false;
    const tick = () => {
      // Tab ẩn ⇒ hẹn lại chứ KHÔNG nhích. Nhích khi ẩn thì lúc quay lại người
      // dùng thấy bảng đã trôi qua vài chục dòng mà không hiểu vì sao.
      if (document.hidden) {
        timerRef.current = setTimeout(tick, interval);
        return;
      }
      if (cancelled) return;
      setShifting(true);
    };
    timerRef.current = setTimeout(tick, interval);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoScroll, interval, offset]);

  // Trượt xong ⇒ chốt vị trí mới và bỏ transition, nên không có cú giật ngược.
  const handleTransitionEnd = useCallback(() => {
    setShifting(false);
    setOffset((prev) => (data.length === 0 ? 0 : (prev + 1) % data.length));
  }, [data.length]);

  // Dư một dòng để dòng kế tiếp đã nằm sẵn dưới mép khi bắt đầu trượt.
  const visible = useMemo(() => {
    if (!overflowing) return data.map((row, i) => ({ row, index: i }));
    const take = rowCount + 1;
    return Array.from({ length: Math.min(take, data.length) }, (_, i) => {
      const index = (offset + i) % data.length;
      return { row: data[index], index };
    });
  }, [data, offset, overflowing, rowCount]);

  const gridTemplate = columns.map((c) => (c.width ? `${c.width}px` : 'minmax(0,1fr)')).join(' ');

  return (
    <div
      className={cn('flex flex-col overflow-hidden border border-border-1 bg-bg-1', className)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {!hideHeader && (
        <div
          className="grid shrink-0 items-center gap-2 border-b border-border-1 bg-bg-2 px-3 text-caption-12-medium text-fg-2"
          style={{ gridTemplateColumns: gridTemplate, height: rowHeight }}
        >
          {columns.map((c) => (
            <div key={c.key} className={cn('truncate', ALIGN[c.align ?? 'left'])}>
              {c.header}
            </div>
          ))}
        </div>
      )}

      <div
        // Máy giảm chuyển động: trả về vùng cuộn tay — vẫn xem được đủ dữ liệu.
        className={cn('relative', reducedMotion && overflowing && 'overflow-y-auto')}
        style={{ height: rowCount * rowHeight }}
      >
        <div
          className={cn(shifting && 'transition-transform duration-500 ease-in-out')}
          style={{ transform: shifting ? `translateY(-${rowHeight}px)` : undefined }}
          onTransitionEnd={handleTransitionEnd}
        >
          {/*
            Key an toàn khỏi trùng: khi cuộn ta lấy `min(rowCount + 1, length)`
            dòng, mà `overflowing` đã bảo đảm `length > rowCount`, nên số dòng
            lấy ra LUÔN ≤ tổng số dòng ⇒ các chỉ số `(offset + i) % length` đôi
            một khác nhau.
          */}
          {visible.map(({ row, index }) => (
            <div
              key={rowKey(row, index)}
              className={cn(
                'grid items-center gap-2 px-3 text-caption-12 text-fg-1',
                // Sọc chẵn/lẻ bám theo CHỈ SỐ THẬT của dòng, không theo vị trí
                // đang hiện: bám vị trí thì mỗi nhịp cuộn cả bảng đổi màu sọc.
                index % 2 === 1 && 'bg-bg-2',
              )}
              style={{ gridTemplateColumns: gridTemplate, height: rowHeight }}
            >
              {columns.map((c) => (
                <div key={c.key} className={cn('truncate', ALIGN[c.align ?? 'left'])}>
                  {c.cell(row, index)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const ScrollBoard = memo(ScrollBoardInner) as typeof ScrollBoardInner;

export default ScrollBoard;
