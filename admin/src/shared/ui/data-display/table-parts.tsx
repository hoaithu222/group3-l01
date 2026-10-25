/**
 * @file table-parts.tsx
 * @description Sub-component + helper nội bộ của `Table` — body row, body row có
 * kéo-thả (dnd-kit) + tay cầm kéo `<TableDragHandle>`. Tách khỏi `Table.tsx` để
 * mỗi file 1 trách nhiệm; `Table.tsx` chỉ giữ component chính. Phần header nằm ở
 * `table-header.tsx`.
 */
import { ALIGN_CLASS } from './table-align';
import { createContext, memo, useCallback, useContext, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import type { DraggableAttributes, UniqueIdentifier } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';

/**
 * Ô header TẦNG TRÊN gộp nhiều cột (vd "T08" trải trên cặp "KH" / "TT"). Các cột
 * LIÊN TIẾP khai cùng `key` gộp làm một ô; cột không khai `group` trải dọc cả 2
 * tầng. Không cột nào khai → header giữ nguyên 1 tầng.
 */
export interface TableColumnGroup {
  key: string;
  label?: React.ReactNode;
}

export interface TableColumn<TData> {
  /** ID cột, đồng thời là accessor key mặc định (`row[key]`). */
  key: string;
  /** Nội dung header. */
  header?: React.ReactNode;
  /** Render cell tuỳ biến. Bỏ qua → hiển thị `row[key]`. */
  cell?: (row: TData, rowIndex: number) => React.ReactNode;
  /** Độ rộng cột (px number hoặc CSS width string). */
  width?: number | string;
  /** Căn lề nội dung cột. Default `left`. */
  align?: 'left' | 'center' | 'right';
  /** Căn theo chiều dọc nội dung cell. Default `middle`. */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Cho phép kéo giãn cột này. Default `true` khi Table bật `resizable`. */
  resizable?: boolean;
  /**
   * Cho phép bấm header để sắp xếp theo cột này. Table CHỈ render UI + bắn
   * `onSortChange`; việc sắp xếp dữ liệu do caller làm (xem hook `useTableSort`)
   * — nhờ vậy bảng cây có thể sort trong từng cấp mà không phá cấu trúc.
   */
  sortable?: boolean;
  /**
   * Ghim cột khi cuộn NGANG. Chỉ áp dụng cho các cột LIÊN TIẾP tính từ trái và
   * cột phải có `width` dạng số (Table cần số để tính vị trí `left`).
   */
  frozen?: boolean;
  /**
   * Override className cho `<td>` của RIÊNG cột này (vd `px-0` để cell-renderer
   * tự quản padding — nút/control bên trong chạm sát viền ô). Merge SAU class
   * mặc định qua `cn()` nên thắng padding gốc `px-3`; các cột khác không đổi.
   */
  cellClassName?: string;
  /** Gộp cột này vào một ô header TẦNG TRÊN — xem `TableColumnGroup`. */
  group?: TableColumnGroup;
  /**
   * Override className cho `<th>` của RIÊNG cột này — đối xứng với
   * `cellClassName`. Dùng khi cần vạch ngăn / tô nền chỉ ở một vài cột (vd mép
   * phải của cụm KH-TT) mà `headerClassName` (áp cho MỌI ô header) không làm được.
   */
  headerCellClassName?: string;
}

/** Chiều sắp xếp của cột đang active. */
export type TableSortDir = 'asc' | 'desc';

const VALIGN_CLASS = {
  top: 'align-top',
  middle: 'align-middle',
  bottom: 'align-bottom',
} as const;

/**
 * `gridBorder=false` (default, Figma 4182:56139): divider dưới mờ (white/10%) —
 * hợp bảng thưa/nhiều khoảng trắng. `gridBorder=true`: divider đặc `divider-1`
 * (cùng token header đang dùng) — bảng dày dữ liệu cần lưới rõ để mắt dò theo
 * hàng/cột (kiểu bảng Gantt/spreadsheet).
 * ⚠️ Hover phải ĐẶC (opaque). Ô GHIM (frozen) dùng `bg-inherit` → nếu nền dòng là
 * màu ALPHA (nav-hover-bg = rgba…/10%) thì ô ghim trong suốt, để lộ cột cuộn phía
 * sau khi kéo ngang (chữ chồng). color-mix primary-5 với bg-2 cho MÀU ĐẶC y hệt.
 */
const rowBaseClass = (gridBorder: boolean) =>
  cn(
    'group bg-bg-2 border-b transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary-5)_12%,var(--color-bg-2))]',
    gridBorder ? 'border-divider-1' : 'border-divider-white-10',
  );

/**
 * Dòng BẤM ĐƯỢC (`onRowClick`): con trỏ tay + vòng focus khi tới bằng bàn phím. Dùng `outline` chứ không
 * `ring` vì `box-shadow` không vẽ được trên `<tr>` của bảng `border-collapse`.
 */
const ROW_CLICKABLE_CLASS =
  'cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring-focus';

/**
 * Enter / Space trên dòng bấm được = bấm dòng. Không có nó, MỌI bảng dùng `onRowClick` (mở chi tiết
 * người dùng, báo cáo, nhật ký…) chỉ dùng được bằng chuột — người dùng bàn phím/đọc màn hình không mở
 * nổi chi tiết (WCAG 2.1.1).
 *
 * CHỈ xử lý khi CHÍNH dòng đang focus (`target === currentTarget`): phím gõ trong nút/liên kết/ô nhập
 * nằm BÊN TRONG dòng thuộc về phần tử đó, không được kéo theo `onRowClick`.
 */
function useRowKeyActivate<TData>(
  onRowClick: ((row: TData, index: number) => void) | undefined,
  row: TData,
  index: number,
) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (!onRowClick || e.target !== e.currentTarget) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); // Space không cuộn trang
      onRowClick(row, index);
    },
    [onRowClick, row, index],
  );
}

// ── Drag handle context — cấp listeners của dòng sortable cho `<TableDragHandle>` ──
interface RowDragCtx {
  attributes: DraggableAttributes | Record<string, never>;
  listeners: SyntheticListenerMap | undefined;
}
const RowDragContext = createContext<RowDragCtx | null>(null);

/**
 * Tay cầm kéo — đặt trong `cell` của 1 cột khi Table bật `sortable`. Chỉ vùng
 * này khởi tạo kéo (không phải cả dòng) → tránh xung đột với click/nhập inline.
 */
export const TableDragHandle = memo(({ className }: { className?: string }) => {
  const ctx = useContext(RowDragContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      {...(ctx.attributes as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      {...(ctx.listeners as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      aria-label="Kéo để sắp xếp"
      className={cn(
        'cursor-grab text-fg-4 transition-colors hover:text-fg-1 active:cursor-grabbing',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <SystemIcon name="grip-dots-vertical-outline" size={10} />
    </button>
  );
});
TableDragHandle.displayName = 'TableDragHandle';

/**
 * Ô của dòng trải hết chiều ngang — dùng chung cho row thường và row kéo-thả.
 * Local (không export): chỉ `TableBodyRow` / `SortableTableBodyRow` cần tới.
 */
const FullRowCell = memo(
  ({ colSpan, children }: { colSpan: number; children: React.ReactNode }) => (
    <td className="px-3 py-2 text-body-14 text-fg-1" colSpan={colSpan}>
      {children}
    </td>
  ),
);
FullRowCell.displayName = 'FullRowCell';

interface TableBodyRowProps<TData> {
  row: TData;
  index: number;
  columns: TableColumn<TData>[];
  columnDividers: boolean;
  /** Chiều cao cố định dòng (px) — bỏ trống → cao theo nội dung. */
  rowHeight?: number;
  onRowClick?: (row: TData, index: number) => void;
  /** Bấm đúp 1 dòng — cho lối "bấm 1 lần = chọn, bấm 2 lần = sửa". Xem `TableProps`. */
  onRowDoubleClick?: (row: TData, index: number) => void;
  rowClassName?: (row: TData, index: number) => string | undefined;
  /** Inline style áp lên `<tr>` — cho giá trị RUNTIME không ra class được. Xem `TableProps`. */
  rowStyle?: (row: TData, index: number) => React.CSSProperties | undefined;
  /** Bọc `<tr>` bằng element tuỳ biến (vd context menu). Xem `TableProps`. */
  renderRowWrapper?: (rowElement: React.ReactElement, row: TData, index: number) => React.ReactNode;
  /** Key cột ghim → vị trí `left` (px). Table tính, row chỉ áp lên `<td>`. */
  frozenLeft?: Record<string, number>;
  /** Dòng trải hết chiều ngang (`<td colSpan>`) — xem `TableProps.fullRowCell`. */
  fullRowCell?: (row: TData, index: number) => React.ReactNode | null;
  /** Divider đặc `divider-1` thay vì mờ `divider-white-10` — xem `TableProps.gridBorder`. */
  gridBorder?: boolean;
}

/** Duyệt cột → mảng `<td>` của 1 dòng (memo theo cột/row/index). Dùng chung 2 loại row. */
function useRowCells<TData>(
  columns: TableColumn<TData>[],
  row: TData,
  index: number,
  columnDividers: boolean,
  rowHeight?: number,
  frozenLeft?: Record<string, number>,
  gridBorder = false,
) {
  const dividerToken = gridBorder ? 'border-divider-1' : 'border-divider-white-10';
  return useMemo(
    () =>
      columns.map((col, colIndex) => {
        const left = frozenLeft?.[col.key];
        // Ô ghim: `bg-inherit` để bám đúng nền dòng (hover / dòng đang chọn).
        const isLastFrozen = left != null && frozenLeft?.[columns[colIndex + 1]?.key] == null;
        return (
          <td
            key={col.key}
            className={cn(
              'px-3 text-body-14 text-fg-1',
              rowHeight != null ? 'py-0' : 'py-2',
              ALIGN_CLASS[col.align ?? 'left'],
              VALIGN_CLASS[col.verticalAlign ?? 'middle'],
              columnDividers && colIndex < columns.length - 1 && cn('border-r', dividerToken),
              // Ô GHIM: `bg-inherit` bám nền dòng (hover/chọn). Thêm `border-b` RIÊNG vì
              // trong `border-collapse`, cell `sticky` hay mất viền dưới của <tr> (quirk
              // Chrome) → divider dòng vùng ghim biến mất, lệch với vùng cuộn.
              left != null && cn('sticky z-[1] border-b bg-inherit', dividerToken),
              isLastFrozen && cn('border-r', dividerToken),
              // Đặt SAU CÙNG để thắng `px-3` mặc định qua tailwind-merge (§cellClassName).
              col.cellClassName,
            )}
            // Cột nào đang ở dưới con trỏ — dùng để đưa tiêu điểm vào ĐÚNG ô vừa bấm
            // đúp khi mở chế độ sửa on-cell (`onRowDoubleClick` chỉ trả `(row, index)`,
            // không có cột). Đọc qua `td.dataset.colKey`.
            data-col-key={col.key}
            style={left != null ? { left } : undefined}
          >
            {col.cell
              ? col.cell(row, index)
              : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
          </td>
        );
      }),
    [columns, row, index, columnDividers, rowHeight, frozenLeft, dividerToken],
  );
}

/**
 * 1 dòng body — memo hoá để chỉ re-render khi `row`/`columns`/handler đổi
 * reference. Nhờ vậy gõ 1 ô (chỉ dòng đó đổi ref) không kéo cả bảng render lại.
 * Điều kiện: `columns`, `onRowClick`, `rowClassName` phải ổn định ở phía caller.
 */
function TableBodyRowBase<TData>({
  row,
  index,
  columns,
  columnDividers,
  rowHeight,
  onRowClick,
  onRowDoubleClick,
  rowClassName,
  rowStyle,
  renderRowWrapper,
  frozenLeft,
  fullRowCell,
  gridBorder,
}: TableBodyRowProps<TData>) {
  const cells = useRowCells(columns, row, index, columnDividers, rowHeight, frozenLeft, gridBorder);
  const handleClick = useCallback(() => onRowClick?.(row, index), [onRowClick, row, index]);
  const handleKeyDown = useRowKeyActivate(onRowClick, row, index);
  const handleDoubleClick = useCallback(
    () => onRowDoubleClick?.(row, index),
    [onRowDoubleClick, row, index],
  );
  const full = fullRowCell?.(row, index) ?? null;

  const tr = (
    <tr
      className={cn(
        rowBaseClass(!!gridBorder),
        onRowClick && ROW_CLICKABLE_CLASS,
        rowClassName?.(row, index),
      )}
      style={{ ...(rowHeight != null && { height: rowHeight }), ...rowStyle?.(row, index) }}
      tabIndex={onRowClick ? 0 : undefined}
      onClick={onRowClick ? handleClick : undefined}
      onDoubleClick={onRowDoubleClick ? handleDoubleClick : undefined}
      onKeyDown={onRowClick ? handleKeyDown : undefined}
    >
      {full == null ? cells : <FullRowCell colSpan={columns.length}>{full}</FullRowCell>}
    </tr>
  );

  return renderRowWrapper ? <>{renderRowWrapper(tr, row, index)}</> : tr;
}

export const TableBodyRow = memo(TableBodyRowBase) as typeof TableBodyRowBase;

interface SortableTableBodyRowProps<TData> extends TableBodyRowProps<TData> {
  rowId: UniqueIdentifier;
  draggable: boolean;
}

/** Dòng body có kéo-thả (dnd-kit) — cấp listeners qua context cho `<TableDragHandle>`. */
function SortableTableBodyRowBase<TData>({
  rowId,
  draggable,
  row,
  index,
  columns,
  columnDividers,
  rowHeight,
  onRowClick,
  onRowDoubleClick,
  rowClassName,
  rowStyle,
  renderRowWrapper,
  frozenLeft,
  fullRowCell,
  gridBorder,
}: SortableTableBodyRowProps<TData>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
    disabled: !draggable,
  });
  const cells = useRowCells(columns, row, index, columnDividers, rowHeight, frozenLeft, gridBorder);
  const handleClick = useCallback(() => onRowClick?.(row, index), [onRowClick, row, index]);
  const handleKeyDown = useRowKeyActivate(onRowClick, row, index);
  const handleDoubleClick = useCallback(
    () => onRowDoubleClick?.(row, index),
    [onRowDoubleClick, row, index],
  );
  const dragCtx = useMemo<RowDragCtx>(() => ({ attributes, listeners }), [attributes, listeners]);
  const full = fullRowCell?.(row, index) ?? null;

  const tr = (
    <tr
      ref={setNodeRef}
      className={cn(
        rowBaseClass(!!gridBorder),
        onRowClick && ROW_CLICKABLE_CLASS,
        isDragging && 'relative z-10 opacity-70',
        rowClassName?.(row, index),
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(rowHeight != null ? { height: rowHeight } : {}),
        ...rowStyle?.(row, index),
      }}
      tabIndex={onRowClick ? 0 : undefined}
      onClick={onRowClick ? handleClick : undefined}
      onDoubleClick={onRowDoubleClick ? handleDoubleClick : undefined}
      onKeyDown={onRowClick ? handleKeyDown : undefined}
    >
      {full == null ? cells : <FullRowCell colSpan={columns.length}>{full}</FullRowCell>}
    </tr>
  );

  return (
    <RowDragContext.Provider value={dragCtx}>
      {renderRowWrapper ? renderRowWrapper(tr, row, index) : tr}
    </RowDragContext.Provider>
  );
}

export const SortableTableBodyRow = memo(
  SortableTableBodyRowBase,
) as typeof SortableTableBodyRowBase;
