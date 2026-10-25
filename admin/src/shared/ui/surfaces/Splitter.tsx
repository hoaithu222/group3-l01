/**
 * Splitter — kit2 resizable 2-pane container.
 *
 * Exactly two children, separated by a draggable handle. Supports horizontal
 * (default — left/right panes) and vertical (top/bottom panes) orientation.
 *
 *   <Splitter initialSize={320} minSize={200} maxSize={520}>
 *     <LeftPane />
 *     <RightPane />
 *   </Splitter>
 *
 * `initialSize`, `minSize`, `maxSize` accept a number (pixels) or a percentage
 * string ("40%") — percentages resolve against the current container size.
 * `onResize(size: number)` fires every drag tick with the current pixel size.
 *
 * Implementation note: document-level POINTER listeners during drag — avoids
 * pointerleave issues when the cursor exits the splitter while still pressed,
 * và pointer (thay cho mouse) là thứ duy nhất chạy được trên cảm ứng: Safari
 * iPad không giả lập sự kiện chuột cho thao tác KÉO. Xem `handlePointerDown`.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { splitterStyles, type SplitterOrientation } from './splitter.theme';

export type { SplitterOrientation };

export interface SplitterProps {
  /** Exactly two panes — first is resizable, second fills remaining space. */
  children: [React.ReactNode, React.ReactNode];
  /** Initial size of the first pane. Number = px; string = CSS value (e.g. "40%"). */
  initialSize?: number | string;
  /** Minimum size for the first pane during drag. Number = px; string = CSS % (e.g. "20%"). */
  minSize?: number | string;
  /** Maximum size for the first pane during drag. Number = px; string = CSS % (e.g. "60%"). */
  maxSize?: number | string;
  /** Split direction. `horizontal` = side-by-side; `vertical` = stacked. */
  orientation?: SplitterOrientation;
  /**
   * Pane nào GIỮ kích thước cố định; pane còn lại là PHẦN CÒN LẠI (`flex-1`) và tự nuốt
   * mọi khoảng dôi ra khi khung rộng lên hoặc khi pane bên kia bị thu.
   *
   * Mặc định `first` — giữ nguyên hành vi cũ cho mọi nơi đang dùng.
   *
   * Dùng `second` khi thứ ở GIỮA mới là nội dung chính và hai bên là panel phụ: ví dụ
   * trang Kho tài liệu `[cây | bảng | chi tiết]`. Ở đó bảng phải là phần còn lại, nếu
   * không thì thu gọn một panel bên sẽ chia phần trống cho CẢ hai pane thay vì dồn hết
   * cho bảng — đúng thứ người dùng mong đợi khi bấm nút thu.
   */
  sizedSide?: 'first' | 'second';
  /** Fires on each drag tick with the current first-pane size in pixels. */
  onResize?: (size: number) => void;
  /**
   * Hoãn resize: trong lúc kéo chỉ hiện đường preview, chỉ áp size khi THẢ chuột.
   * Dùng cho pane nặng (canvas WebGL / iframe) để tránh resize liên tục gây nháy.
   */
  deferResize?: boolean;
  /**
   * Ẩn 1 pane (CSS off-screen) — component vẫn mounted, không unmount.
   * Pane còn lại tự fill toàn bộ không gian. Dùng khi muốn giữ state/WebGL alive.
   */
  collapsed?: boolean;
  /**
   * Pane nào bị ẩn khi `collapsed=true`. Default `first` (giữ behavior cũ).
   * Dùng `second` khi muốn ẩn pane thứ hai (vd: full-3D, ẩn gantt).
   */
  collapsedSide?: 'first' | 'second';
  /**
   * Cách ẩn pane:
   * - `offscreen` (default) — nhấc ra ngoài màn hình, giữ NGUYÊN kích thước. Bắt buộc cho pane chứa
   *   canvas WebGL: co về 0 sẽ kích hoạt resize và sinh lỗi framebuffer.
   * - `shrink` — co bề rộng về 0 kèm transition (mượt), pane còn lại giãn ra theo. Chỉ dùng cho
   *   pane nội dung DOM thường.
   */
  collapseMode?: 'offscreen' | 'shrink';
  /** Optional class merged onto the root container. */
  className?: string;
}

function resolveInitialPx(value: number | string | undefined, total: number): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    const pct = Number.parseFloat(trimmed.slice(0, -1));
    if (Number.isFinite(pct)) return Math.round((pct / 100) * total);
  }
  const px = Number.parseFloat(trimmed);
  return Number.isFinite(px) ? px : null;
}

/** Resolve px/% bound → px against container `total`; undefined khi không đặt. */
function resolveBound(value: number | string | undefined, total: number): number | undefined {
  const px = resolveInitialPx(value, total);
  return px == null ? undefined : px;
}

function clampSize(value: number, min?: number, max?: number, total?: number): number {
  let next = value;
  if (typeof min === 'number') next = Math.max(min, next);
  if (typeof max === 'number') next = Math.min(max, next);
  if (typeof total === 'number') next = Math.min(total, Math.max(0, next));
  return next;
}

function Splitter({
  children,
  initialSize = '40%',
  minSize,
  maxSize,
  orientation = 'horizontal',
  onResize,
  deferResize = false,
  collapsed = false,
  collapsedSide = 'first',
  sizedSide = 'first',
  collapseMode = 'offscreen',
  className,
}: SplitterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // Vị trí đường preview khi deferResize — không đổi `size` cho tới khi thả chuột.
  const [previewSize, setPreviewSize] = useState<number | null>(null);
  const previewSizeRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ startCoord: number; startSize: number; total: number } | null>(
    null,
  );

  // Initialise once we know the container size.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const total = orientation === 'horizontal' ? el.clientWidth : el.clientHeight;
    if (total <= 0) return;
    const next = resolveInitialPx(initialSize, total);
    if (next == null) return;
    setSize(clampSize(next, resolveBound(minSize, total), resolveBound(maxSize, total), total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation]);

  /**
   * ⛔ POINTER EVENTS, KHÔNG PHẢI MOUSE EVENTS.
   *
   * Bản trước nghe `mousedown` / `mousemove` / `mouseup`. Safari trên iPad CHỈ
   * giả lập chuỗi sự kiện chuột cho cú CHẠM RỒI NHẢ (tap), KHÔNG giả lập cho
   * thao tác KÉO ⇒ tay nắm hoàn toàn không kéo được bằng ngón tay, dù có nới
   * dày bao nhiêu đi nữa.
   *
   * `PointerEvent` kế thừa `MouseEvent` (cùng `clientX`/`clientY`) và trên
   * chuột nó bắn ĐÚNG cùng thời điểm với `mousedown`/`mousemove`/`mouseup` —
   * nên đổi sang pointer KHÔNG làm lệch hành vi trên PC/laptop một chút nào,
   * mà tự nhiên chạy được cả bút cảm ứng.
   *
   * `setPointerCapture` giữ luồng sự kiện dính vào tay nắm kể cả khi ngón tay
   * trượt ra ngoài nó — thiếu cái này thì kéo nhanh sẽ "rơi" giữa chừng.
   * Tay nắm đã có `touch-none` (xem `splitter.theme.ts`) nên trình duyệt không
   * cướp cử chỉ để cuộn trang.
   */
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el || size == null) return;
      // KHÔNG lọc theo `event.button`: bản `onMouseDown` cũ nhận MỌI nút chuột,
      // lọc thêm là đổi hành vi desktop mà chẳng giúp gì cho cảm ứng (chạm và
      // bút luôn báo `button === 0`).
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const total = orientation === 'horizontal' ? el.clientWidth : el.clientHeight;
      const startCoord = orientation === 'horizontal' ? event.clientX : event.clientY;
      dragStateRef.current = { startCoord, startSize: size, total };
      setDragging(true);
    },
    [orientation, size],
  );

  useEffect(() => {
    if (!dragging) return;
    // Gắn class vào <body> → cursor resize giữ nguyên toàn trang trong lúc kéo
    // (không nhảy về default khi qua element khác) + chặn bôi đen chữ. Gỡ khi thả.
    const bodyClass = orientation === 'horizontal' ? 'splitter-resizing-x' : 'splitter-resizing-y';
    document.body.classList.add(bodyClass);
    const onMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const coord = orientation === 'horizontal' ? event.clientX : event.clientY;
      // Pane chốt nằm bên PHẢI ⇒ kéo sang phải là làm nó HẸP đi ⇒ đảo dấu, nếu không
      // tay kéo một đằng panel chạy một nẻo.
      const delta = (coord - state.startCoord) * (sizedSide === 'second' ? -1 : 1);
      const next = clampSize(
        state.startSize + delta,
        resolveBound(minSize, state.total),
        resolveBound(maxSize, state.total),
        state.total,
      );
      if (deferResize) {
        // Chỉ di chuyển đường preview — KHÔNG resize pane (tránh nháy canvas).
        previewSizeRef.current = next;
        setPreviewSize(next);
      } else {
        setSize(next);
        onResize?.(next);
      }
    };
    const onUp = () => {
      // Commit size 1 lần khi thả (chế độ deferResize).
      if (deferResize && previewSizeRef.current != null) {
        setSize(previewSizeRef.current);
        onResize?.(previewSizeRef.current);
      }
      previewSizeRef.current = null;
      setPreviewSize(null);
      dragStateRef.current = null;
      setDragging(false);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    // Cảm ứng có thể bị HỆ ĐIỀU HÀNH cướp cử chỉ giữa chừng (vuốt từ mép màn,
    // gọi Control Center…). Không nghe `pointercancel` thì kéo dở dang và
    // `dragging` kẹt ở `true` — vạch dính theo ngón tay mãi sau khi đã nhả.
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.body.classList.remove(bodyClass);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, orientation, minSize, maxSize, onResize, deferResize, sizedSide]);

  const slots = splitterStyles({ orientation, dragging });

  /**
   * Style của pane ĐƯỢC CHỐT kích thước.
   *
   * ⛔ `flexGrow: 0` + `flexBasis: 'auto'` phải khai tường minh: khi pane chốt là pane
   * THỨ HAI, nó mang sẵn class `flex-1` (= `flex: 1 1 0%`) từ `splitter.theme.ts`. Thiếu
   * hai dòng này thì `width` bị `flex-basis: 0%` + `grow: 1` ghi đè và pane vẫn co giãn.
   */
  const fillStyle: React.CSSProperties =
    orientation === 'horizontal' ? { flex: 1, minWidth: 0 } : { flex: 1, minHeight: 0 };

  const sizedStyle: React.CSSProperties =
    size == null
      ? {
          flexBasis: typeof initialSize === 'number' ? `${initialSize}px` : initialSize,
          flexGrow: 0,
          flexShrink: 0,
        }
      : orientation === 'horizontal'
        ? { width: `${size}px`, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }
        : { height: `${size}px`, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' };

  const offscreenStyle = (currentSize: number | null): React.CSSProperties => ({
    position: 'absolute',
    [orientation === 'horizontal' ? 'left' : 'top']: '-10000px',
    ...(orientation === 'horizontal'
      ? { width: currentSize != null ? `${currentSize}px` : '40%', height: '100%' }
      : { height: currentSize != null ? `${currentSize}px` : '40%', width: '100%' }),
    visibility: 'hidden',
    pointerEvents: 'none',
  });

  const firstCollapsed = collapsed && collapsedSide === 'first';
  const secondCollapsed = collapsed && collapsedSide === 'second';
  const isShrink = collapseMode === 'shrink';

  /**
   * Co về 0 (giữ trong luồng layout) → transition chạy được, pane còn lại giãn theo từng frame.
   *
   * ⛔ `flexGrow: 0` BẮT BUỘC, không phải thừa. `paneSecond` mang sẵn class `flex-1`
   * (= `flex: 1 1 0%`), mà style inline này chỉ ghi đè `flex-shrink` — `flex-grow: 1`
   * còn nguyên nên pane ĐÃ THU vẫn NỞ ra chiếm nửa khung, để lại một mảng trống không ai
   * dùng cạnh pane còn lại. Lỗi chỉ lộ với `collapsedSide="second"` + `collapseMode="shrink"`:
   * `paneFirst` không có `flex-1` nên nhánh "first" xưa nay vẫn đúng, và consumer dùng
   * `collapsedSide="second"` còn lại (meeting-chat) chạy chế độ `offscreen` (position
   * absolute ⇒ ngoài luồng flex) nên cũng không chạm vào đường này.
   *
   * `flexBasis: 0` đi kèm để pane không giữ lại kích thước cơ sở của `flex-1`.
   */
  const shrinkStyle: React.CSSProperties =
    orientation === 'horizontal'
      ? { width: 0, flexGrow: 0, flexShrink: 0, flexBasis: 0 }
      : { height: 0, flexGrow: 0, flexShrink: 0, flexBasis: 0 };

  /** Style pane đang bị ẩn, theo chế độ. */
  const collapsedStyle = (currentSize: number | null) =>
    isShrink ? shrinkStyle : offscreenStyle(currentSize);

  // Chỉ bật transition ở chế độ shrink: chế độ offscreen mà transition sẽ thành cú "bay ngang".
  // Tắt trong lúc kéo — mỗi tick resize sẽ bị trễ 300ms, tay kéo một đằng panel chạy một nẻo.
  const paneTransition =
    isShrink && !dragging ? 'transition-[width,height] duration-300 ease-in-out' : '';

  return (
    <div ref={containerRef} className={cn(slots.root(), className)} data-orientation={orientation}>
      {/* collapsed: absolute off-screen giữ nguyên kích thước canvas — tránh WebGL resize → GL_INVALID_FRAMEBUFFER errors */}
      <div
        className={cn(slots.paneFirst(), paneTransition)}
        style={
          firstCollapsed
            ? collapsedStyle(size)
            : secondCollapsed || sizedSide === 'second'
              ? fillStyle
              : sizedStyle
        }
      >
        {children[0]}
      </div>

      {!collapsed && (
        <div
          aria-orientation={orientation}
          className={slots.handle()}
          role="separator"
          tabIndex={0}
          onPointerDown={handlePointerDown}
        >
          <span className={slots.handleGrip()}>
            <SystemIcon
              name={
                orientation === 'horizontal' ? 'grip-dots-vertical-outline' : 'ellipsis-outline'
              }
              size={12}
            />
          </span>
        </div>
      )}

      <div
        className={cn(slots.paneSecond(), paneTransition)}
        style={
          secondCollapsed
            ? collapsedStyle(size)
            : firstCollapsed || sizedSide === 'first'
              ? undefined
              : sizedStyle
        }
      >
        {children[1]}
      </div>

      {deferResize && dragging && previewSize != null && (
        <div
          aria-hidden
          className={slots.ghost()}
          style={
            orientation === 'horizontal'
              ? { left: `${previewSize}px` }
              : { top: `${previewSize}px` }
          }
        />
      )}
    </div>
  );
}

export default memo(Splitter);
