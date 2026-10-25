/**
 * @file table-header.tsx
 * @description Phần header của `Table` — ô `<th>` dùng chung + 1 hoặc 2 dòng header.
 *
 *  Cột khai `group` → header tách 2 TẦNG: tầng trên gộp các cột LIÊN TIẾP cùng
 *  `group.key` bằng `colSpan`; tầng dưới là header riêng của từng cột. Cột KHÔNG
 *  khai `group` trải dọc cả 2 tầng bằng `rowSpan` nên bảng vẫn đọc như header 1
 *  tầng. Không cột nào khai `group` → chỉ render đúng 1 dòng như trước.
 */
import { memo, useMemo } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { ALIGN_CLASS } from './table-align';
import type { TableColumn, TableSortDir } from './table-parts';
import type { HeaderGroupSpan } from './table-header-groups';

const HEADER_SIZE_CLASS = {
  sm: 'py-1.5',
  md: 'py-2.5',
  lg: 'py-3',
  xl: 'py-3.5',
} as const;

/**
 * MỌI vạch của header (dọc lẫn ngang) đều vẽ bằng `box-shadow` INSET qua style
 * INLINE — KHÔNG phải `border`/class Tailwind.
 *
 * ⛔ Mọi `<th>` ở đây đều `position: sticky` — ghim dọc (`top`) LUÔN LUÔN, và
 * ghim ngang (`left`) thêm nữa nếu là cột `frozen`. Trong bảng `border-collapse`,
 * vạch NẰM GIỮA một ô sticky và ô liền kề (tầng dưới / dòng body đầu / cột cuộn
 * sau cột ghim) là đường "collapsed" — trình duyệt (Chrome) không paint lại nhất
 * quán đường collapsed này mỗi khi layer sticky dịch chuyển lúc cuộn (đã tái hiện
 * được lỗi này bằng test cuộn thật), nên vạch chớp tắt/biến mất giữa chừng.
 *
 * `box-shadow` vẽ RIÊNG trên từng ô, không tham gia cơ chế gộp viền của
 * `border-collapse` nên không dính lỗi — nhưng `box-shadow` là MỘT thuộc tính
 * CSS duy nhất, hai class Tailwind `shadow-[...]` riêng (dọc + ngang) trên cùng
 * một ô sẽ ĐÈ NHAU qua tailwind-merge chứ không cộng dồn. Vì vậy build MỘT
 * chuỗi gộp (`,` nối nhiều lớp) rồi gán qua `style.boxShadow`, không qua class.
 */
const HEADER_SHADOW_RIGHT = 'inset -1px 0 0 0 var(--color-border-1)';
const HEADER_SHADOW_BOTTOM = 'inset 0 -1px 0 0 var(--color-border-1)';

const headerCellShadow = (opts: { right?: boolean; bottom?: boolean }): string | undefined => {
  const layers: string[] = [];
  if (opts.right) layers.push(HEADER_SHADOW_RIGHT);
  if (opts.bottom) layers.push(HEADER_SHADOW_BOTTOM);
  return layers.length > 0 ? layers.join(', ') : undefined;
};

export type TableHeaderSize = keyof typeof HEADER_SIZE_CLASS;

interface HeaderCellParams<TData> {
  col: TableColumn<TData>;
  /** Bề rộng đang áp (kéo giãn > khai báo). */
  width?: number | string;
  /** Vị trí `left` khi ghim; bỏ trống = cột cuộn tự do. */
  left?: number;
  /** Khoảng cách tới đỉnh vùng cuộn — tầng dưới phải trừ chiều cao tầng trên. */
  top: number;
  /** Cột ghim CUỐI — kẻ vạch tách vùng ghim với vùng cuộn. */
  lastFrozen: boolean;
  /** Vạch dọc giữa các cột (`columnDividers`, trừ cột cuối bảng). */
  divider: boolean;
  /** Trải dọc 2 tầng khi cột không thuộc nhóm nào. */
  rowSpan?: number;
  /**
   * Vạch ngang tách HẲN header khỏi dòng dữ liệu đầu tiên (`Table.headerBorder`).
   * Mọi lệnh gọi `renderHeaderCell` đều là tầng CUỐI của cột đó (tầng dưới của
   * header 1 hoặc 2 tầng), nên cờ này luôn đúng nghĩa "đáy header" bất kể có
   * grouped header hay không.
   */
  bottomBorder: boolean;
  headerClassName?: string;
  headerSize: TableHeaderSize;
  canResize: boolean;
  resizing: boolean;
  onResizeStart: (key: string, startWidth: number, e: React.PointerEvent) => void;
  sortDir?: TableSortDir | null;
  isSorted: boolean;
  onSortChange?: (key: string | null, dir: TableSortDir | null) => void;
}

/**
 * Ô header của MỘT cột. Là hàm render (không phải component) để giữ nguyên ranh
 * giới memo hiện tại: chỉ dòng header được memo, không thêm tầng component con.
 */
function renderHeaderCell<TData>(p: HeaderCellParams<TData>) {
  const { col } = p;
  const canSort = !!col.sortable && !!p.onSortChange;
  // asc → desc → bỏ sort.
  const nextSort = (): [string | null, TableSortDir | null] =>
    !p.isSorted ? [col.key, 'asc'] : p.sortDir === 'asc' ? [col.key, 'desc'] : [null, null];

  const shadow = headerCellShadow({ right: p.lastFrozen || p.divider, bottom: p.bottomBorder });

  // Cột sắp xếp được PHẢI tự khai hướng sắp xếp hiện tại — nút bên trong chỉ nói "Sắp xếp theo X", không
  // cho người dùng đọc màn hình biết bảng đang sắp theo cột nào, chiều nào.
  const ariaSort = !canSort
    ? undefined
    : p.isSorted
      ? p.sortDir === 'desc'
        ? 'descending'
        : 'ascending'
      : 'none';

  return (
    <th
      key={col.key}
      aria-sort={ariaSort}
      className={cn(
        // `sticky` đã là positioned element → tay cầm kéo `absolute` neo đúng
        // vào th mà KHÔNG cần thêm `relative` (relative sẽ đè mất sticky →
        // header thôi cố định khi bảng bật resizable).
        'sticky z-10 bg-azure-8',
        // Cột ghim: nằm trên các header khác khi cuộn ngang.
        p.left != null && 'z-20',
        'px-3 text-body text-neutral-0 whitespace-nowrap',
        HEADER_SIZE_CLASS[p.headerSize],
        ALIGN_CLASS[col.align ?? 'left'],
        p.headerClassName,
        // Đặt SAU CÙNG để thắng class chung qua tailwind-merge (§headerCellClassName).
        col.headerCellClassName,
      )}
      rowSpan={p.rowSpan}
      scope="col"
      style={{
        top: p.top,
        ...(p.width != null ? { width: p.width } : {}),
        ...(p.left != null ? { left: p.left } : {}),
        ...(shadow ? { boxShadow: shadow } : {}),
      }}
    >
      {canSort ? (
        <button
          aria-label={`Sắp xếp theo ${typeof col.header === 'string' ? col.header : col.key}`}
          className={cn(
            'inline-flex w-full items-center gap-1 whitespace-nowrap',
            'cursor-pointer transition-colors hover:text-neutral-0',
            col.align === 'center' && 'justify-center',
            col.align === 'right' && 'justify-end',
          )}
          type="button"
          onClick={() => p.onSortChange?.(...nextSort())}
        >
          {col.header}
          {/* Cặp mũi tên lên/xuống sát text — nửa đang sort sáng, nửa còn lại mờ. */}
          <span className="inline-flex shrink-0 flex-col leading-none">
            <SystemIcon
              className={p.isSorted && p.sortDir === 'asc' ? 'text-accent-5' : 'text-neutral-0/40'}
              name="caret-large-up-bold"
              size={8}
            />
            <SystemIcon
              className={cn(
                '-mt-0.5',
                p.isSorted && p.sortDir === 'desc' ? 'text-accent-5' : 'text-neutral-0/40',
              )}
              name="caret-large-down-bold"
              size={8}
            />
          </span>
        </button>
      ) : (
        col.header
      )}
      {p.canResize && (
        <span
          aria-label="Kéo giãn cột"
          aria-orientation="vertical"
          className={cn(
            /**
             * Vùng BẮT chuột rộng 10px, nằm TRỌN trong ô ở mép phải.
             *
             * ⛔ Bản trước là `w-[1px]` — đúng bề rộng của vạch — nên phải trỏ chính
             * xác vào 1 pixel, nhích một chút là mất hover, gần như không kéo nổi.
             * Vùng bắt và vạch NHÌN THẤY là hai thứ khác nhau: vùng bắt phải rộng,
             * vạch vẫn mảnh.
             *
             * ⛔ KHÔNG nhô ra ngoài ô để bắt cả hai bên đường biên: `th` là
             * `sticky z-10` — tức một stacking context — nên phần nhô ra luôn bị `th`
             * KẾ TIẾP (cùng z, đứng sau trong DOM) phủ lên và ăn mất pointer. 10px
             * nằm gọn trong `px-3` (12px) nên cũng không che chữ tiêu đề.
             */
            'group/resize absolute top-0 right-0 flex h-full w-2.5 justify-end',
            'cursor-col-resize touch-none select-none',
          )}
          role="separator"
          onPointerDown={(e) => {
            const th = e.currentTarget.parentElement as HTMLElement;
            p.onResizeStart(col.key, th.offsetWidth, e);
          }}
        >
          <span
            aria-hidden
            className={cn(
              'h-full w-px transition-colors',
              p.resizing ? 'bg-primary-5' : 'bg-transparent group-hover/resize:bg-primary-5/60',
            )}
          />
        </span>
      )}
    </th>
  );
}

interface TableHeaderRowProps<TData> {
  columns: TableColumn<TData>[];
  columnDividers: boolean;
  headerClassName?: string;
  headerSize: TableHeaderSize;
  resizable: boolean;
  widths: Record<string, number>;
  resizingKey: string | null;
  onResizeStart: (key: string, startWidth: number, e: React.PointerEvent) => void;
  /** Cột đang sắp xếp (null = không sort). */
  sortKey?: string | null;
  sortDir?: TableSortDir | null;
  /** Bấm header cột `sortable` — vòng trạng thái asc → desc → bỏ sort. */
  onSortChange?: (key: string | null, dir: TableSortDir | null) => void;
  /** Key cột ghim → vị trí `left` (px). */
  frozenLeft?: Record<string, number>;
  /**
   * Header 2 tầng: bỏ qua cột KHÔNG thuộc nhóm nào (đã trải `rowSpan` từ tầng
   * trên) và đẩy `top` xuống dưới tầng trên.
   */
  groupedOnly?: boolean;
  topOffset?: number;
  /** Vạch mảnh dưới đáy header, tách khỏi dòng dữ liệu đầu tiên (`Table.headerBorder`). */
  headerBorder?: boolean;
}

/** Bề rộng đang áp của 1 cột: ưu tiên số đã kéo giãn, sau đó mới tới khai báo. */
const widthOf = <TData,>(col: TableColumn<TData>, widths: Record<string, number>) =>
  widths[col.key] ?? col.width;

/**
 * Header row — tách riêng + memo hoá để KHÔNG map lại `columns` mỗi khi `data`
 * đổi (gõ ô, đổi trang…). Chỉ re-render khi cột / trạng thái resize đổi.
 */
function TableHeaderRowBase<TData>({
  columns,
  columnDividers,
  headerClassName,
  headerSize,
  resizable,
  widths,
  resizingKey,
  onResizeStart,
  sortKey,
  sortDir,
  onSortChange,
  frozenLeft,
  groupedOnly = false,
  topOffset = 0,
  headerBorder = false,
}: TableHeaderRowProps<TData>) {
  const cells = useMemo(
    () =>
      columns.map((col, colIndex) => {
        if (groupedOnly && !col.group) return null;
        const left = frozenLeft?.[col.key];
        return renderHeaderCell({
          col,
          width: widthOf(col, widths),
          left,
          top: topOffset,
          lastFrozen: left != null && frozenLeft?.[columns[colIndex + 1]?.key] == null,
          divider: columnDividers && colIndex < columns.length - 1,
          bottomBorder: headerBorder,
          headerClassName,
          headerSize,
          canResize: resizable && (col.resizable ?? true),
          resizing: resizingKey === col.key,
          onResizeStart,
          sortDir,
          isSorted: !!col.sortable && !!onSortChange && sortKey === col.key && !!sortDir,
          onSortChange,
        });
      }),
    [
      columns,
      columnDividers,
      headerClassName,
      headerSize,
      resizable,
      widths,
      resizingKey,
      onResizeStart,
      sortKey,
      sortDir,
      onSortChange,
      frozenLeft,
      groupedOnly,
      topOffset,
      headerBorder,
    ],
  );

  return <tr className={cn('bg-azure-8', headerClassName)}>{cells}</tr>;
}

export const TableHeaderRow = memo(TableHeaderRowBase) as typeof TableHeaderRowBase;

interface TableHeaderGroupRowProps<TData> extends TableHeaderRowProps<TData> {
  groups: HeaderGroupSpan[];
  /** Đo chiều cao thật của tầng trên để tầng dưới dính đúng chỗ khi cuộn dọc. */
  rowRef: React.Ref<HTMLTableRowElement>;
}

/**
 * TẦNG TRÊN của header 2 tầng: ô nhóm dùng `colSpan`, cột lẻ mượn nguyên ô
 * header thường nhưng `rowSpan={2}` để trải xuống tầng dưới.
 */
function TableHeaderGroupRowBase<TData>({
  columns,
  groups,
  columnDividers,
  headerClassName,
  headerSize,
  resizable,
  widths,
  resizingKey,
  onResizeStart,
  sortKey,
  sortDir,
  onSortChange,
  frozenLeft,
  rowRef,
  headerBorder = false,
}: TableHeaderGroupRowProps<TData>) {
  const cells = useMemo(
    () =>
      groups.map((group) => {
        const first = columns[group.start];
        const lastIndex = group.start + group.span - 1;
        const left = frozenLeft?.[first.key];
        const lastFrozen = left != null && frozenLeft?.[columns[lastIndex + 1]?.key] == null;
        const divider = columnDividers && lastIndex < columns.length - 1;

        if (!group.grouped)
          return renderHeaderCell({
            col: first,
            width: widthOf(first, widths),
            left,
            top: 0,
            lastFrozen,
            divider,
            rowSpan: 2,
            bottomBorder: headerBorder,
            headerClassName,
            headerSize,
            canResize: resizable && (first.resizable ?? true),
            resizing: resizingKey === first.key,
            onResizeStart,
            sortDir,
            isSorted: !!first.sortable && !!onSortChange && sortKey === first.key && !!sortDir,
            onSortChange,
          });

        // Ô nhóm KHÔNG khai `width`: bề rộng cột do `<colgroup>` quyết định
        // (table-fixed chỉ đọc dòng đầu, ô `colSpan` không tả nổi từng cột con).
        // Vạch dọc (ghim/divider) + vạch ngang (tách tầng NHÓM khỏi tầng CỘT bên
        // dưới — LUÔN có, không nó thì nhãn nhóm dính liền "Kế hoạch/Thực tế" bên
        // dưới) đều qua `box-shadow` inline — xem chú thích ở `headerCellShadow`.
        const groupShadow = headerCellShadow({ right: lastFrozen || divider, bottom: true });
        return (
          <th
            key={group.key}
            className={cn(
              'sticky top-0 z-10 bg-azure-8',
              left != null && 'z-20',
              'px-3 text-center text-body text-neutral-0 whitespace-nowrap',
              HEADER_SIZE_CLASS[headerSize],
              headerClassName,
            )}
            colSpan={group.span}
            scope="colgroup"
            style={{ ...(left != null ? { left } : {}), boxShadow: groupShadow }}
          >
            {group.label}
          </th>
        );
      }),
    [
      groups,
      columns,
      columnDividers,
      headerClassName,
      headerSize,
      resizable,
      widths,
      resizingKey,
      onResizeStart,
      sortKey,
      sortDir,
      onSortChange,
      frozenLeft,
      headerBorder,
    ],
  );

  return (
    <tr ref={rowRef} className={cn('bg-azure-8', headerClassName)}>
      {cells}
    </tr>
  );
}

export const TableHeaderGroupRow = memo(TableHeaderGroupRowBase) as typeof TableHeaderGroupRowBase;
