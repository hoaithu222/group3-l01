import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { cn } from '@/shared/utils/style/cn';
import { measureColumnStops } from '@/shared/utils/browser/scroll-snap.utils';
import EmptyState from '@/shared/ui/feedback/EmptyState';
import Pagination from '@/shared/ui/navigation/Pagination';
import ScrollEdgeNav from '@/shared/ui/navigation/ScrollEdgeNav';
import { useColumnResize } from './useColumnResize';
import { ALIGN_CLASS } from './table-align';
import {
  SortableTableBodyRow,
  TableBodyRow,
  TableDragHandle,
  type TableColumn,
  type TableColumnGroup,
  type TableSortDir,
} from './table-parts';
import { TableHeaderGroupRow, TableHeaderRow } from './table-header';
import { buildHeaderGroups } from './table-header-groups';

// Sub-component + type công khai tách sang `table-parts` / `table-header` —
// re-export để barrel `@/shared/ui` và consumer vẫn import từ "./Table" như cũ.
export { TableDragHandle };
export type { TableColumn, TableColumnGroup, TableSortDir };

/**
 * Table — data table cho dữ liệu lấy từ API (server-side pagination).
 *
 * Consumer CHỈ truyền `data` (trang hiện tại) + `columns` + state phân trang
 * (`currentPage`, `pageSize`, `total`) lấy thẳng từ API. Table hiển thị và bắn
 * sự kiện đổi trang qua `onPageChange` / `onPageSizeChange` để consumer fetch
 * lại. Không phụ thuộc thư viện table.
 *
 * Usage:
 *   const { data, isLoading } = useQuery(...);
 *   <Table
 *     data={data?.items ?? []}
 *     columns={columns}
 *     loading={isLoading}
 *     currentPage={page}
 *     pageSize={size}
 *     total={data?.total ?? 0}
 *     onPageChange={setPage}
 *     onPageSizeChange={setSize}
 *   />
 */
const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];

export interface TableProps<TData> {
  /** Dữ liệu của TRANG hiện tại (đã phân trang từ API). */
  data: TData[];
  /** Định nghĩa cột. */
  columns: TableColumn<TData>[];
  /** Tạo key ổn định cho mỗi dòng (default: index trong mảng). */
  rowKey?: (row: TData, index: number) => string | number;
  /** className tuỳ biến theo từng dòng (vd: highlight dòng chưa đọc). */
  rowClassName?: (row: TData, index: number) => string | undefined;
  /**
   * Inline style áp lên `<tr>` — dành cho giá trị người dùng chọn tại RUNTIME
   * (màu, cỡ chữ theo cấp) không ánh xạ về class tĩnh được.
   *
   * ⚠️ `<td>` đã có `text-fg-1`, nên `color` đặt ở đây KHÔNG tự xuống ô. Muốn cả
   * dòng đổi màu thì kèm `rowClassName` ép thừa kế, vd
   * `'[&>td]:text-inherit [&>td_*]:text-inherit'`.
   *
   * PHẢI ổn định reference (useCallback) để không phá memo dòng.
   */
  rowStyle?: (row: TData, index: number) => React.CSSProperties | undefined;
  /** Click vào 1 dòng — bật con trỏ pointer + highlight. */
  onRowClick?: (row: TData, index: number) => void;
  /**
   * Bấm ĐÚP vào 1 dòng — dành cho lối "bấm 1 lần = chọn, bấm 2 lần = sửa".
   *
   * ⚠️ Trình duyệt vẫn bắn `onRowClick` 2 lần TRƯỚC khi bắn cái này, nên handler
   * click phải chịu được việc chạy lại trên đúng dòng đó (chọn lại = vô hại).
   *
   * PHẢI ổn định reference (useCallback) để không phá memo dòng.
   */
  onRowDoubleClick?: (row: TData, index: number) => void;
  /**
   * Bọc mỗi `<tr>` bằng element tuỳ biến (vd `<ContextMenu asChild>` để chuột
   * phải trên dòng). Nhận chính element `<tr>` + row + index, trả về node thay
   * thế. PHẢI ổn định reference (useCallback) để không phá memo dòng.
   */
  renderRowWrapper?: (rowElement: React.ReactElement, row: TData, index: number) => React.ReactNode;
  /**
   * Dòng TRẢI HẾT chiều ngang (dòng phân cách nhóm, dòng tổng…): trả về node
   * ⇒ dòng đó render 1 `<td colSpan={columns.length}>` thay cho các cell theo
   * cột; trả `null` ⇒ dòng thường. PHẢI ổn định reference (useCallback) để
   * không phá memo dòng.
   */
  fullRowCell?: (row: TData, index: number) => React.ReactNode | null;
  /**
   * Dòng TỔNG dính đáy vùng cuộn (`<tfoot>` sticky) — trả node cho từng cột,
   * `null`/`undefined` = ô trống. Cột GHIM vẫn ghim đúng như ở body nên cuộn cả
   * hai chiều dòng tổng vẫn khớp cột.
   *
   * Bỏ trống ⇒ KHÔNG dựng `<tfoot>`. Bảng rỗng cũng không dựng: tổng của 0 dòng
   * chỉ là một hàng số 0 đè lên chỗ báo "chưa có dữ liệu".
   *
   * PHẢI ổn định reference (`useCallback`).
   */
  footerCell?: (column: TableColumn<TData>) => React.ReactNode;
  /** className override cho `<tr>` của dòng tổng (vd đổi nền). */
  footerClassName?: string;
  /** Đang tải dữ liệu — hiển thị trạng thái loading. */
  loading?: boolean;

  // --- Pagination (controlled) ---
  /** Hiển thị footer phân trang. Default `true`. */
  pagination?: boolean;
  /** Trang hiện tại (1-based). Default `1`. */
  currentPage?: number;
  /** Số dòng mỗi trang. Default `10`. */
  pageSize?: number;
  /** Tổng số dòng ở mọi trang. Default `data.length`. */
  total?: number;
  /** Tuỳ chọn số dòng/trang trong menu. Default `[10, 20, 50, 100]`. */
  pageSizeOptions?: number[];
  /** Đổi trang (1-based) — fetch lại dữ liệu. */
  onPageChange?: (page: number) => void;
  /** Đổi số dòng/trang — fetch lại dữ liệu. */
  onPageSizeChange?: (pageSize: number) => void;

  // --- Display ---
  /** Hiển thị khi không có dữ liệu. */
  emptyMessage?: React.ReactNode;
  /** className wrapper ngoài cùng. */
  className?: string;
  /**
   * Bảng GIÃN HẾT chiều cao còn lại của khung chứa (thay vì cao đúng bằng nội
   * dung). Bật cờ này = vỏ ngoài cùng tự nhận `min-h-0 flex-1`.
   *
   * ── CHUỖI CHIỀU CAO — bốn mắt xích, đứt một cái là bảng bỏ trống phần dưới ──
   *
   *   <PageBody overflow="hidden" stack={false}>   `min-h-0 flex-1` ⇒ ăn hết
   *                                                 phần dôi của trang
   *     <BoxPanel bodyOverflow="hidden">           root `h-full`, thân thành
   *                                                 `flex flex-col` ⇒ con giãn được
   *       <Table fill>                             vỏ bảng ăn hết thân panel
   *         └ vùng cuộn `min-h-0 flex-1`           (sẵn có, không cần khai)
   *
   * ⚠️ `fill` CHỈ có tác dụng khi CHA là flex column. Cha là khối `block`
   *    (vd `<BoxPanel>` để mặc định `bodyOverflow="scroll"`) thì `flex-1` vô
   *    nghĩa — bảng lại cao bằng nội dung. Cha `block` NHƯNG có chiều cao xác
   *    định thì dùng `className="h-full"` thay cho `fill`.
   *
   * **Default `false`** — giữ nguyên hành vi của mọi bảng đang chạy (cao bằng
   * nội dung, hoặc do call-site tự truyền `className="min-h-0 flex-1"` /
   * `className="h-full"`; hai lối này vẫn dùng được và cộng dồn với `fill`).
   */
  fill?: boolean;
  /** className override cho header row + ô header (vd: nền azure đậm). */
  headerClassName?: string;
  /** className override cho table */
  tableClassName?: string;
  /** className override cho pagination */
  paginationClassName?: string;
  /** Nhãn trước số kết quả ("Kết quả:"). */
  countLabel?: string;
  /** Hậu tố sau số dòng/trang ("/trang"). */
  pageSizeSuffix?: string;
  /** Số nút trang tối đa ở cụm giữa. */
  maxPageButtons?: number;
  /** Chiều cao header row. Default `md`. */
  headerSize?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hiện divider dọc giữa các cột (border phải, trừ cột cuối). Default `false`. */
  columnDividers?: boolean;
  /**
   * Divider dòng/cột dùng token đặc `divider-1` (cùng tông header) thay vì mờ
   * `divider-white-10` mặc định. Bật cho bảng dày dữ liệu cần lưới rõ để mắt dò
   * theo hàng/cột (kiểu bảng Gantt/spreadsheet). Default `false`.
   */
  gridBorder?: boolean;
  /**
   * Vạch mảnh (token `border-1`, vẽ bằng `box-shadow` inline — xem
   * `headerCellShadow` ở `table-header.tsx`) tách HẲN header khỏi dòng dữ liệu
   * đầu tiên. Header 2 tầng (cột khai `group`) LUÔN có vạch giữa 2 tầng (không
   * phụ thuộc cờ này) — cờ này chỉ thêm vạch đáy header/thân bảng.
   *
   * ⛔ Cố tình dùng `box-shadow` thay vì `border`: MỌI vạch của header (dọc lẫn
   * ngang, kể cả vạch ghim cột) đều qua `box-shadow`, không riêng vạch này —
   * mọi `<th>` đều `position: sticky`, và trong bảng `border-collapse` thì viền
   * giữa một ô sticky với ô liền kề KHÔNG cùng sticky (tầng dưới, dòng body đầu,
   * hay cột cuộn sau cột ghim) bị Chrome bỏ vẽ ngay khi cuộn (đã tái hiện được
   * lỗi này bằng test cuộn thật). `box-shadow` không tham gia cơ chế gộp viền
   * nên không dính lỗi.
   *
   * Default `false` (bảng thưa dựa vào tương phản nền azure-8/bg-2 là đủ). Bật
   * cho bảng dày dữ liệu hoặc header 2 tầng — ranh giới header/thân cần rõ hơn
   * để mắt không lẫn dòng đầu vào tầng dưới của header.
   */
  headerBorder?: boolean;
  /**
   * Thuật toán layout của `<table>`.
   * `fixed` → tôn trọng `column.width`, cột không width chia đều phần còn lại;
   * cho phép cell `truncate` cắt nội dung dài thay vì giãn rộng (tránh scroll ngang).
   *
   * BỎ TRỐNG (khuyến nghị) → suy theo `resizable`: mặc định `resizable` bật nên ra
   * `fixed`. Truyền tay thì giá trị của bạn THẮNG — kể cả `auto` (khi đó handle kéo
   * vẫn hiện nhưng `table-layout: auto` coi `<col width>` là gợi ý, kéo sẽ không ăn
   * chắc; muốn kéo được thì để `fixed`).
   */
  layout?: 'auto' | 'fixed';
  /**
   * Cho phép kéo giãn chiều rộng cột bằng chuột (handle ở mép phải header).
   *
   * **Default `true`** (chốt 2026-08-17): bảng nào cũng có lúc cần nới một cột để
   * đọc, khoá sẵn thì mỗi bảng lại phải tự bật.
   *
   * ⚠️ Kéo cột chỉ ăn chắc với `table-layout: fixed`, nên bật cờ này mà KHÔNG truyền
   * `layout` thì bảng chạy `fixed`. Bảng cần cột tự co theo nội dung phải nói rõ
   * `layout="auto"` (và chấp nhận kéo không ăn), hoặc `resizable={false}`.
   */
  resizable?: boolean;
  /** Chiều rộng tối thiểu khi kéo cột (px). Default `60`. */
  minColumnWidth?: number;
  /**
   * Sàn chiều rộng của `<table>` (px hoặc CSS width). Bỏ trống → bảng luôn co
   * đúng bằng khung chứa và các cột bị BÓP lại khi khung hẹp.
   *
   * Truyền vào khi tổng bề rộng cột có ý nghĩa đọc được (bảng nhiều cột, cột số
   * cần đủ chỗ): dưới ngưỡng này bảng ngừng co, tràn ra và vùng cuộn sẵn có của
   * Table hiện thanh CUỘN NGANG — người dùng kéo xem cột bên phải thay vì phải
   * đọc những cột đã bị bóp còn vài chục px. Đặt cùng chỗ khai `columns` để hai
   * con số không lệch nhau.
   */
  minWidth?: number | string;
  /** Chiều cao cố định mỗi dòng body (px). Bỏ trống → cao theo nội dung. */
  rowHeight?: number;
  /**
   * Cặp nút cuộn NGANG dán ở hai mép bảng (`<TableScrollNav>`). Bật cho bảng
   * nhiều cột: thanh cuộn ngang nằm tít dưới đáy nên xem cột bên phải là phải
   * rời mắt xuống kéo — nút này đi tiếp ngay tại chỗ. Mỗi nhịp bấm đi ĐÚNG một
   * cột (giữ nút thì cuộn liên tục), cột ghim vẫn đứng yên.
   *
   * Nút mờ khi đứng yên, rê chuột vào mới sáng; bảng không tràn ngang thì cả
   * hai tự ẩn. Default `false` — bảng vừa khung không cần thêm nút. */
  scrollNav?: boolean;
  /**
   * Override vị trí lớp nút mép (`<ScrollEdgeNav className>`). Mặc định nút nằm
   * NGOÀI mép bảng 8px (`-inset-x-2`), ăn vào dải padding của card bọc ngoài.
   * Khung bọc KHÔNG có padding, hoặc cắt `overflow-hidden` sát mép bảng, thì
   * truyền `inset-x-0` — không thì nút bị khuất mất một nửa.
   */
  scrollNavClassName?: string;

  // --- Kéo-thả sắp xếp (opt-in) ---
  /**
   * Bật kéo-thả sắp xếp dòng (dnd-kit). Cần đặt 1 cột chứa `<TableDragHandle />`
   * để làm tay cầm kéo. `onReorder` bắn khi thả sang vị trí mới.
   */
  sortable?: boolean;
  /** Kéo-thả xong → trả về key dòng đang kéo + key dòng đích (theo `rowKey`). */
  onReorder?: (activeKey: UniqueIdentifier, overKey: UniqueIdentifier) => void;
  /** Dòng nào được phép kéo (vd chỉ dòng đã lưu, bỏ dòng draft). Default: tất cả. */
  isRowDraggable?: (row: TData, index: number) => boolean;
  /**
   * Sắp xếp theo cột — Table CHỈ render UI header (mũi tên) + bắn `onSortChange`.
   * Dữ liệu do caller tự sort (hook `useTableSort` cho bảng phẳng; bảng cây tự
   * sort trong từng cấp). Cột muốn bật phải khai `sortable: true`.
   */
  sortKey?: string | null;
  sortDir?: TableSortDir | null;
  onSortChange?: (key: string | null, dir: TableSortDir | null) => void;

  /**
   * Lắng nghe scroll của vùng cuộn body (dùng cho infinite scroll / lazy render).
   * Gắn thẳng vào container `overflow-auto` bên trong Table.
   */
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  /**
   * Callback ref nhận CHÍNH vùng cuộn body (`div.overflow-auto`) — để consumer gắn
   * thư viện ảo hoá (vd `@tanstack/react-virtual` qua `getScrollElement`). Chỉ nhận
   * callback (không nhận RefObject) để không phải ghi `.current` vào prop; được gọi
   * song song với ref nội bộ (vẫn dùng cho `scrollNav`).
   */
  scrollContainerRef?: React.RefCallback<HTMLDivElement>;
  /**
   * Ảo hoá (windowing): chiều cao (px) đệm TRÊN/DƯỚI phần dòng đang render — để
   * giữ đúng tổng chiều cao vùng cuộn khi chỉ render 1 cửa sổ dòng. `data` khi đó
   * chỉ là lát cắt đang nhìn thấy. Bỏ trống = không ảo hoá.
   */
  padTop?: number;
  padBottom?: number;
}

function Table<TData>({
  data,
  columns,
  rowKey,
  rowClassName,
  rowStyle,
  onRowClick,
  onRowDoubleClick,
  renderRowWrapper,
  fullRowCell,
  footerCell,
  footerClassName,
  loading = false,
  pagination = true,
  currentPage = 1,
  pageSize = 12,
  total,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  emptyMessage = 'Không có dữ liệu',
  className,
  fill = false,
  headerClassName,
  countLabel,
  pageSizeSuffix,
  maxPageButtons,
  headerSize = 'md',
  // KHÔNG đặt default ở đây: `undefined` là tín hiệu "chưa ai chọn" để `effectiveLayout`
  // suy theo `resizable`. Đặt `'auto'` sẵn thì nó luôn thắng và resize hết tác dụng.
  layout,
  tableClassName,
  paginationClassName,
  columnDividers = false,
  gridBorder = false,
  headerBorder = false,
  resizable = true,
  minColumnWidth = 60,
  minWidth,
  rowHeight,
  scrollNav = false,
  scrollNavClassName,
  sortable = false,
  onReorder,
  isRowDraggable,
  sortKey,
  sortDir,
  onSortChange,
  onScroll,
  padTop = 0,
  padBottom = 0,
  scrollContainerRef,
}: TableProps<TData>) {
  const resolvedTotal = useMemo(() => total ?? data.length, [total, data.length]);
  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(resolvedTotal / pageSize)),
    [resolvedTotal, pageSize],
  );
  const getRowKey = useCallback(
    (row: TData, index: number) => (rowKey ? rowKey(row, index) : index),
    [rowKey],
  );

  const resize = useColumnResize({ enabled: resizable, minWidth: minColumnWidth });

  /** Vùng cuộn của bảng — `<TableScrollNav>` cuộn chính div này. */
  const scrollRef = useRef<HTMLDivElement>(null);
  // Callback ref: ghi vào ref nội bộ (cho scrollNav) + gọi callback consumer (cho
  // virtualizer). Merge để không mất bên nào.
  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      scrollContainerRef?.(node);
    },
    [scrollContainerRef],
  );

  /**
   * Cột ghim (`column.frozen`) — tính vị trí `left` cộng dồn theo bề rộng. Chỉ
   * ghim các cột LIÊN TIẾP tính từ trái; gặp cột không có width dạng số thì
   * dừng (không đủ dữ liệu để tính offset kế tiếp).
   */
  const frozenLeft = useMemo(() => {
    const map: Record<string, number> = {};
    let offset = 0;
    for (const col of columns) {
      if (!col.frozen) break;
      map[col.key] = offset;
      const width = resize.widths[col.key] ?? (typeof col.width === 'number' ? col.width : null);
      if (width == null) break;
      offset += width;
    }
    return Object.keys(map).length === 0 ? undefined : map;
  }, [columns, resize.widths]);

  /**
   * Header 2 TẦNG — chỉ dựng khi có cột khai `group`; `null` giữ nguyên header 1
   * dòng nên mọi bảng đang chạy không đổi gì.
   */
  const headerGroups = useMemo(() => buildHeaderGroups(columns), [columns]);

  /**
   * Chiều cao THẬT của tầng header trên: tầng dưới `sticky` phải trừ đúng số này
   * mới dính khít bên dưới khi cuộn dọc. Đo bằng ResizeObserver vì chiều cao đổi
   * theo `headerSize` và theo việc chữ có xuống dòng hay không.
   */
  const [groupRowHeight, setGroupRowHeight] = useState(0);
  const groupRowRef = useCallback((node: HTMLTableRowElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setGroupRowHeight(node.getBoundingClientRect().height),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /**
   * Nút mép (`scrollNav`) đi ĐÚNG một cột: mốc dừng = mép trái từng cột cuộn
   * được, ĐO tại thời điểm bấm nên cột vừa kéo giãn / vừa bật-tắt vẫn ra đúng.
   * Khối cột ghim đứng yên nên phải trừ bề rộng của nó khỏi mốc (xem
   * `measureColumnStops`).
   */
  const frozenCount = frozenLeft ? Object.keys(frozenLeft).length : 0;
  const getColumnStops = useCallback(
    () => measureColumnStops(scrollRef.current, frozenCount),
    [frozenCount],
  );
  // Bật resize → luôn dùng table-fixed để width kéo được tôn trọng.
  /**
   * `layout` truyền tay THẮNG; bỏ trống mới suy theo `resizable`.
   *
   * ⛔ Bản trước là `resizable ? 'fixed' : layout` — cờ resize ĐÈ cả `layout` người
   * gọi chỉ định. Từ khi `resizable` mặc định `true`, công thức đó biến mọi bảng
   * thành `fixed` và KHÔNG còn cách nào xin lại `auto` ngoài việc tắt resize.
   */
  const effectiveLayout = useMemo(
    () => layout ?? (resizable ? 'fixed' : 'auto'),
    [layout, resizable],
  );

  // Duyệt data → dòng body (mỗi dòng là component memo). Memo mảng để không map
  // lại khi Table render vì lý do không liên quan tới data/cột/handler.
  const bodyRows = useMemo(
    () =>
      data.map((row, index) => {
        const key = getRowKey(row, index);
        return sortable ? (
          <SortableTableBodyRow
            key={key}
            columnDividers={columnDividers}
            columns={columns}
            draggable={isRowDraggable ? isRowDraggable(row, index) : true}
            frozenLeft={frozenLeft}
            fullRowCell={fullRowCell}
            gridBorder={gridBorder}
            index={index}
            renderRowWrapper={renderRowWrapper}
            row={row}
            rowClassName={rowClassName}
            rowHeight={rowHeight}
            rowId={key}
            rowStyle={rowStyle}
            onRowClick={onRowClick}
            onRowDoubleClick={onRowDoubleClick}
          />
        ) : (
          <TableBodyRow
            key={key}
            columnDividers={columnDividers}
            columns={columns}
            frozenLeft={frozenLeft}
            fullRowCell={fullRowCell}
            gridBorder={gridBorder}
            index={index}
            renderRowWrapper={renderRowWrapper}
            row={row}
            rowClassName={rowClassName}
            rowHeight={rowHeight}
            rowStyle={rowStyle}
            onRowClick={onRowClick}
            onRowDoubleClick={onRowDoubleClick}
          />
        );
      }),
    [
      data,
      columns,
      columnDividers,
      gridBorder,
      rowHeight,
      frozenLeft,
      fullRowCell,
      onRowClick,
      onRowDoubleClick,
      rowClassName,
      rowStyle,
      renderRowWrapper,
      getRowKey,
      sortable,
      isRowDraggable,
    ],
  );

  // dnd-kit — chỉ dùng khi bật `sortable`. Handle kéo bằng `<TableDragHandle>`.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Key các dòng được phép kéo (theo thứ tự data) — items của SortableContext.
  const sortableIds = useMemo(
    () =>
      data.reduce<UniqueIdentifier[]>((acc, row, index) => {
        if (!isRowDraggable || isRowDraggable(row, index)) acc.push(getRowKey(row, index));
        return acc;
      }, []),
    [data, isRowDraggable, getRowKey],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (over && active.id !== over.id) onReorder?.(active.id, over.id);
    },
    [onReorder],
  );

  const handlePageChange = useCallback(
    (index: number) => onPageChange?.(index + 1),
    [onPageChange],
  );
  const handlePageSizeChange = useCallback(
    (size: number) => onPageSizeChange?.(size),
    [onPageSizeChange],
  );

  const scroller = (
    <div
      ref={setScrollNode}
      // `touch:overscroll-contain` — vùng cuộn của bảng phải NUỐT đà vuốt của
      // chính nó. Thiếu nó, trên iPad vuốt hết bảng là đà chuyển tiếp ra vùng
      // cha: cuộn ngang hết cột thì Safari hiểu thành "lùi lại trang trước"
      // (mất luôn màn đang mở), cuộn dọc hết dòng thì cả trang rubber-band.
      //
      // ⛔ PHẢI CÓ TIỀN TỐ `touch:` — đừng để trần. Chú thích cũ ở đây khẳng
      //    định "trên máy tính thuộc tính này không có tác dụng"; điều đó SAI.
      //    `overscroll-behavior: contain` chặn cả CHUỖI CUỘN CỦA CHUỘT: lăn
      //    quá dòng cuối của bảng sẽ KHÔNG cuộn tiếp trang nữa. Đó là đổi hành
      //    vi có thật trên laptop/PC, đúng thứ đợt máy tính bảng này cấm.
      //    (Bậc chạm còn được `globals.css` phủ thêm một lần qua
      //    `[class*='overflow-auto']` — ở đây khai lại cho đọc code thấy ngay.)
      className={cn('min-h-0 flex-1 overflow-auto touch:overscroll-contain', tableClassName)}
      onScroll={onScroll}
    >
      {/* Khi rỗng → table cao full để empty-state canh giữa vùng còn lại. */}
      <table
        className={cn(
          'w-full border-collapse',
          effectiveLayout === 'fixed' && 'table-fixed',
          // Đang kéo → chặn bôi đen text toàn bảng.
          resize.resizingKey && 'select-none',
          data.length === 0 && 'h-full',
        )}
        style={minWidth == null ? undefined : { minWidth }}
      >
        {/* Header 2 tầng: `table-fixed` chỉ đọc bề rộng ở DÒNG ĐẦU, mà dòng đầu
            lúc này toàn ô `colSpan` → bề rộng từng cột phải khai qua `<colgroup>`. */}
        {headerGroups && (
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={{ width: resize.widths[col.key] ?? col.width }} />
            ))}
          </colgroup>
        )}
        <thead>
          {/* Header — Figma 612:6485: nền azure-8 (#042945) + chữ trắng. */}
          {headerGroups && (
            <TableHeaderGroupRow
              columnDividers={columnDividers}
              columns={columns}
              frozenLeft={frozenLeft}
              groups={headerGroups}
              headerBorder={headerBorder}
              headerClassName={headerClassName}
              headerSize={headerSize}
              resizable={resizable}
              resizingKey={resize.resizingKey}
              rowRef={groupRowRef}
              sortDir={sortDir}
              sortKey={sortKey}
              widths={resize.widths}
              onResizeStart={resize.onResizeStart}
              onSortChange={onSortChange}
            />
          )}
          <TableHeaderRow
            columnDividers={columnDividers}
            columns={columns}
            frozenLeft={frozenLeft}
            groupedOnly={!!headerGroups}
            headerBorder={headerBorder}
            headerClassName={headerClassName}
            headerSize={headerSize}
            resizable={resizable}
            resizingKey={resize.resizingKey}
            sortDir={sortDir}
            sortKey={sortKey}
            topOffset={headerGroups ? groupRowHeight : 0}
            widths={resize.widths}
            onResizeStart={resize.onResizeStart}
            onSortChange={onSortChange}
          />
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                className="h-full px-3 py-8 text-center align-middle text-body-14 text-fg-3 bg-bg-1"
                colSpan={columns.length}
              >
                {/*
                  Câu rỗng dạng CHUỖI → dựng `EmptyState` (icon + câu) cho MỌI bảng, thay vì một dòng
                  chữ trơ trọi giữa vùng trống lớn. Nơi gọi đã tự truyền `<EmptyState>` (icon riêng,
                  mô tả, nút) thì giữ nguyên node đó.
                */}
                {loading ? (
                  'Đang tải...'
                ) : typeof emptyMessage === 'string' ? (
                  <EmptyState title={emptyMessage} titleClassName="text-body-14-medium text-fg-3" />
                ) : (
                  emptyMessage
                )}
              </td>
            </tr>
          ) : (
            <>
              {/* Ảo hoá: đệm chiều cao phần dòng CHƯA render phía trên. */}
              {padTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={columns.length} style={{ height: padTop, padding: 0 }} />
                </tr>
              )}
              {bodyRows}
              {/* Đệm chiều cao phần dòng CHƯA render phía dưới. */}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={columns.length} style={{ height: padBottom, padding: 0 }} />
                </tr>
              )}
            </>
          )}
        </tbody>

        {/* Dòng TỔNG dính đáy vùng cuộn. `sticky` đặt trên từng `<td>` chứ không
            trên `<tr>`: trong `border-collapse`, `position` trên `<tr>` bị nhiều
            trình duyệt bỏ qua. Ô GHIM sticky CẢ HAI chiều (bottom + left) và z cao
            hơn để cuộn ngang không bị các ô tổng khác trườn lên trên. */}
        {footerCell && data.length > 0 && (
          <tfoot>
            <tr className={cn('bg-bg-3', footerClassName)}>
              {columns.map((col, colIndex) => {
                const left = frozenLeft?.[col.key];
                const isLastFrozen =
                  left != null && frozenLeft?.[columns[colIndex + 1]?.key] == null;
                return (
                  <td
                    key={col.key}
                    className={cn(
                      // `tabular-nums` khai TƯỜNG MINH (visual-hierarchy §3.3):
                      // dòng TỔNG gần như luôn là số và phải thẳng cột với ô số ở
                      // body. `globals.css` đã đặt sẵn trên `body` nên đây là chốt
                      // chặn, không phải sửa lỗi — cùng lối `Progress`/`NumberInput`.
                      'sticky bottom-0 px-3 text-body-14-medium tabular-nums text-fg-1 bg-inherit',
                      rowHeight != null ? 'py-0' : 'py-2',
                      // Viền trên tách hẳn khỏi dòng cuối — đây là dòng TỔNG, không
                      // phải một dòng dữ liệu nữa.
                      'border-t-2 border-t-border-2',
                      ALIGN_CLASS[col.align ?? 'left'],
                      columnDividers &&
                        colIndex < columns.length - 1 &&
                        cn('border-r', gridBorder ? 'border-divider-1' : 'border-divider-white-10'),
                      left != null ? 'z-[3]' : 'z-[2]',
                      isLastFrozen &&
                        cn('border-r', gridBorder ? 'border-divider-1' : 'border-divider-white-10'),
                      col.cellClassName,
                    )}
                    style={{ ...(left != null ? { left } : undefined), height: rowHeight }}
                  >
                    {footerCell(col)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  const content = (
    // ⛔ `flex w-full flex-col` KHÔNG khai chiều cao ⇒ mặc định vỏ bảng cao ĐÚNG
    //    BẰNG NỘI DUNG. Đặt bảng 6 dòng vào panel cao 700px thì `flex-1` của vùng
    //    cuộn bên trong không có gì để chia và ~400px dưới hàng phân trang bỏ
    //    trống. `fill` (hoặc `className="min-h-0 flex-1"` / `"h-full"` do
    //    call-site truyền) là mắt xích nối chiều cao — xem docblock `fill`.
    <div className={cn('flex w-full flex-col', fill && 'min-h-0 flex-1', className)}>
      {/* Bọc thêm 1 lớp `relative` CHỈ khi bật `scrollNav`: nút mép là `absolute`
          neo vào lớp này, và bọc vô điều kiện sẽ đổi DOM của mọi bảng đang chạy. */}
      {scrollNav ? (
        // `group/scroll-edge`: rê chuột vào BẤT KỲ đâu trong bảng thì 2 nút mép
        // mới hiện ra (xem `<ScrollEdgeNav>`).
        <div className="group/scroll-edge relative flex min-h-0 flex-1 flex-col">
          {scroller}
          <ScrollEdgeNav
            className={scrollNavClassName}
            getStops={getColumnStops}
            targetRef={scrollRef}
          />
        </div>
      ) : (
        scroller
      )}

      {pagination && (
        <Pagination
          className={paginationClassName}
          countLabel={countLabel}
          maxPageButtons={maxPageButtons}
          pageCount={pageCount}
          pageIndex={currentPage - 1}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          pageSizeSuffix={pageSizeSuffix}
          total={resolvedTotal}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </div>
  );

  // Không sortable → trả thẳng; sortable → bọc DndContext + SortableContext.
  if (!sortable) return content;

  return (
    <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {content}
      </SortableContext>
    </DndContext>
  );
}

export default Table;
