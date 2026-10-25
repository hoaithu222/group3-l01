import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Tree as ArboristTree,
  type NodeApi,
  type NodeRendererProps,
  type TreeApi,
} from 'react-arborist';
import { tv } from 'tailwind-variants';
import { cn, twMergeFontExtend } from '@/shared/utils/style/cn';
import {
  includesNormalized,
  includesSearch,
  normalizeSearch,
} from '@/shared/utils/format/string.utils';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { SystemIconName } from '@/shared/ui/icons/Icons';
import Image from '@/shared/ui/media/Image';
import Text from '@/shared/ui/primitives/Text';

/**
 * Tree — hiển thị cấu trúc cây dạng kit2, dựng trên `react-arborist`.
 *
 * Cấu trúc dữ liệu (đệ quy, mở rộng tự do):
 *
 *   type Node = {
 *     id: string;
 *     name: string;
 *     children?: Node[];
 *     icon?: SystemIconName;   // icon riêng từng node (tuỳ chọn)
 *     disabled?: boolean;      // làm mờ + chặn chọn/expand
 *   };
 *
 * Mặc định dùng nền glassmorphic giống `Popover` / `Dropdown` content.
 * Khi cần custom row hoàn toàn, truyền `renderNode` để thay thế phần body.
 *
 *   <Tree data={data} onSelect={(ids) => …} />
 *   <Tree ref={treeRef} data={data} />        // imperative expand/collapse
 *
 * API thông qua ref:
 *   treeRef.current?.expandAll()
 *   treeRef.current?.collapseAll()
 *   treeRef.current?.select(id)
 *
 * Selection mặc định là single; truyền `selectionMode="multi"` để cho phép
 * chọn nhiều (cmd/shift-click — xem lưu ý dưới). Logic cascade-check
 * (parent ↔ children) KHÔNG tự động — cần build TreeSelect riêng nếu muốn
 * checkbox cascade.
 *
 * ⚠️ **Multi-select rời rạc chỉ nhận `metaKey` (⌘ Cmd — Mac), KHÔNG nhận
 * `ctrlKey` (Windows/Linux)** — hành vi gốc của `NodeApi.handleClick`
 * (react-arborist), xem `node_modules/react-arborist/.../node-api.js`. Nơi
 * cần Ctrl+click hoạt động trên Windows (đa số user) thì tự vá cục bộ qua
 * `renderNode` (chặn `onRowClick` mặc định bằng `event.stopPropagation()`
 * rồi gọi thẳng `node.select/selectMulti/deselect/selectContiguous/activate`
 * — các method public của `NodeApi`), KHÔNG sửa file này để tránh đổi hành
 * vi những nơi khác đang dùng `Tree` (mẫu: `DocPickPanel`, 2025VCIPMS-893).
 */
export interface TreeNodeData {
  id: string;
  name: string;
  children?: TreeNodeData[];
  /** Icon riêng cho node. Nếu không có sẽ fallback theo logic dưới. */
  icon?: SystemIconName;
  /** Làm mờ row + chặn select; chặn luôn expand trừ khi bật `expandDisabled`. */
  disabled?: boolean;
  // Cho phép caller gắn thêm field tuỳ ý (badge, count, status…) để
  // tiêu thụ trong renderNode / renderTrailing.
  [key: string]: unknown;
}

export interface TreeHandle {
  /** Mở toàn bộ node. */
  expandAll: () => void;
  /** Đóng toàn bộ node. */
  collapseAll: () => void;
  /** Chọn node theo id (xoá selection cũ trong single mode). */
  select: (id: string) => void;
  /**
   * Bỏ chọn 1 node theo id — GIỮ nguyên các node khác đang chọn (multi mode).
   * Dùng khi caller quản lý selection từ NGOÀI cây (vd nút "x" trên chip liệt
   * kê node đã chọn) — phải đi qua `NodeApi.deselect()` thay vì tự lọc mảng id
   * ở component cha, vì `selectedIds`/`selection` chỉ đồng bộ MỘT CHIỀU
   * (arborist → ngoài qua `onSelect`); tự lọc mảng ở ngoài mà không gọi qua đây
   * sẽ làm cây "câm" — chip biến mất nhưng node vẫn tô sáng chọn trên cây.
   */
  deselect: (id: string) => void;
  /** Cuộn tới node đang focus. */
  scrollTo: (id: string) => void;
  /** Mở 1 node theo id (leaf → no-op). */
  open: (id: string) => void;
  /** Đóng 1 node theo id (đang mở → collapse; leaf/đã đóng → no-op). */
  close: (id: string) => void;
  /** Mở tất cả node CHA để lộ node `id` (không tự chọn/cuộn). */
  openParents: (id: string) => void;
}

export interface TreeProps {
  data: TreeNodeData[];

  // ─── Kích thước ────────────────────────────────────────────────────────────
  /**
   * Chiều cao: số (px) hoặc CSS length (vd "100%"). Mặc định 400.
   * Khi truyền chuỗi (vd "100%"), Tree tự đo container (ResizeObserver) để cấp
   * px cho virtualization → tự fill chiều cao cha (cha phải có height xác định).
   */
  height?: number | string;
  /** Chiều rộng cố định (px hoặc CSS length); mặc định `100%`. */
  width?: number | string;
  /** Chiều cao mỗi row (px). Mặc định 22 (theo design Figma 4227-25232). */
  rowHeight?: number;
  /** Khoảng thụt vào mỗi level (px). Mặc định 28 (canh cột con–label cha). */
  indent?: number;

  // ─── Selection ─────────────────────────────────────────────────────────────
  /** "single" (mặc định) hoặc "multi" (cmd/shift-click). */
  selectionMode?: 'single' | 'multi';
  /** Controlled — danh sách id đang chọn. */
  selectedIds?: string[];
  /**
   * Tự mở các node cha + cuộn tới node đang chọn (`selectedIds[0]`) khi cây đã đo
   * xong chiều cao. Dùng cho dropdown/popover cây: mở lại thấy ngay mục đã chọn.
   * Tree tự canh thời điểm (không cần rAF thủ công ở ngoài).
   */
  revealSelected?: boolean;
  /** Callback khi selection đổi — trả về mảng id. */
  onSelect?: (ids: string[]) => void;
  /**
   * Callback khi 1 node được mở/đóng (toggle) — trả về id node. Dùng cho
   * lazy-load: fetch children khi node mở lần đầu (consumer tự idempotent).
   */
  onToggle?: (id: string) => void;
  /**
   * Override class nền cho row đang chọn (mặc định `bg-nav-active-bg
   * text-fg-on-popup` — tint mờ 18-24%). Dùng khi 1 Tree cụ thể cần highlight
   * NỔI hơn mức chuẩn toàn app (vd node đang liên kết trong popup "Bản mềm" —
   * mở lại phải nhận ra ngay giữa cây dài, không lẫn vào tint mờ dùng chung).
   * Không set → giữ nguyên `rowSelected` mặc định, các `<Tree>` khác không đổi.
   */
  selectedRowClassName?: string;

  // ─── Trạng thái expand ─────────────────────────────────────────────────────
  /** Mở toàn bộ node khi mount. */
  openByDefault?: boolean;
  /**
   * Mở mặc định một / nhiều node cụ thể theo id khi mount.
   * Chỉ áp dụng lần đầu — sau đó user click thì state do react-arborist quản lý.
   * Để re-apply, đổi `key` của Tree để remount.
   */
  defaultOpenIds?: string[];
  /** Bật/tắt expand-all dạng declarative (toggle để force open/close). */
  expandAll?: boolean;
  /**
   * Khi true: click vào row cha cũng toggle expand (kèm select) — dùng cho cây
   * điều hướng kiểu "click thư mục = mở". Mặc định false: expand/collapse do
   * **chevron + icon folder** đảm nhiệm, click row CHỈ select.
   */
  expandOnRowClick?: boolean;
  /**
   * Cho phép MỞ/ĐÓNG node `disabled` (vẫn chặn chọn). Mặc định false — giữ
   * nguyên hành vi cũ: `disabled` khoá cả select lẫn expand.
   *
   * Bật khi cây có node cha "chỉ làm đường dẫn": người dùng không được chọn nó
   * nhưng PHẢI đi xuyên qua nó để tới node con chọn được. Không bật thì cả nhánh
   * bị khoá cứng, con hợp lệ biến mất khỏi cây (2025VCIPMS-1027).
   */
  expandDisabled?: boolean;

  // ─── Tìm kiếm / filter ─────────────────────────────────────────────────────
  /** Từ khoá filter — chỉ hiện node match + tổ tiên của chúng. */
  searchTerm?: string;
  /** Matcher tuỳ chỉnh. Mặc định: contain `name` không phân biệt hoa thường. */
  searchMatch?: (node: TreeNodeData, term: string) => boolean;

  // ─── Render hooks ──────────────────────────────────────────────────────────
  /** Icon mặc định cho leaf khi `node.icon` không được set. */
  defaultLeafIcon?: SystemIconName;
  /** Icon mặc định cho node cha lúc đóng. */
  defaultCollapsedIcon?: SystemIconName;
  /** Icon mặc định cho node cha lúc mở. */
  defaultExpandedIcon?: SystemIconName;
  /**
   * Render toàn bộ body của row. Nếu truyền hàm này thì render mặc định
   * (chevron + icon + name + trailing) sẽ bị bỏ qua phần icon/label.
   */
  renderNode?: (node: NodeApi<TreeNodeData>) => React.ReactNode;
  /** Nội dung phía bên phải mỗi row (badge / count / action). */
  renderTrailing?: (node: NodeApi<TreeNodeData>) => React.ReactNode;

  // ─── Trạng thái dữ liệu ──────────────────────────────────────────────────
  /** Hiển thị spinner căn giữa thay cho cây (đang tải dữ liệu). */
  loading?: boolean;
  /** Text dưới spinner khi loading. Mặc định "Đang tải nội dung". */
  loadingMessage?: string;
  /** Text khi `data` rỗng (không loading). Mặc định "Không tìm thấy thư mục". */
  emptyMessage?: string;
  /** Text khi `searchTerm` không khớp node nào. Mặc định "Không tìm thấy kết quả". */
  searchEmptyMessage?: string;

  // ─── Container ─────────────────────────────────────────────────────────────
  /** className của wrapper ngoài. */
  className?: string;
  /** Khoá toàn bộ tương tác (read-only display). */
  disabled?: boolean;
}

/**
 * Tìm icon hiển thị cho 1 node theo thứ tự ưu tiên:
 *   1) Icon riêng của node (`node.data.icon`)
 *   2) Leaf → `defaults.leaf`
 *   3) Parent đang mở → `defaults.expanded`
 *   4) Parent đang đóng → `defaults.collapsed`
 *
 * Trả về `undefined` nếu không có ứng viên nào → caller bỏ qua slot icon.
 */
function resolveNodeIcon(
  node: NodeApi<TreeNodeData>,
  defaults: {
    leaf?: SystemIconName;
    collapsed?: SystemIconName;
    expanded?: SystemIconName;
  },
): SystemIconName | undefined {
  const ownIcon = node.data.icon as SystemIconName | undefined;
  if (ownIcon) return ownIcon;
  if (node.isLeaf) return defaults.leaf;
  return node.isOpen ? defaults.expanded : defaults.collapsed;
}

const styles = tv(
  {
    slots: {
      container: [
        'text-body-14 text-fg-1',
        // Ẩn outline mặc định của arborist; row tự vẽ focus ring riêng.
        '[&_*]:outline-none',
        // ⛔ Cắt phần tràn: với `height="100%"`, chiều cao px cấp cho arborist đến
        // từ ResizeObserver nên LUÔN trễ 1 nhịp render. Khung cha co lại (vd chèn
        // thêm 1 dòng phía trên cây) thì danh sách bên trong còn giữ chiều cao cũ
        // → tràn ra ngoài → tổ tiên `overflow-auto` nháy thanh cuộn rồi tắt = giật.
        // Cuộn thật do scroller ảo hoá của arborist bên trong lo, không mất gì.
        'overflow-hidden',
      ],
      row: [
        'group flex items-center gap-1 h-full w-full pr-2 cursor-pointer select-none',
        'transition-colors',
        'hover:bg-nav-hover-bg',
      ],
      rowSelected: 'bg-nav-active-bg text-fg-on-popup',
      rowFocused: 'ring-1 ring-popup-border ring-inset',
      rowDisabled: 'opacity-50 cursor-not-allowed hover:bg-transparent',
      chevron: [
        'inline-flex items-center justify-center shrink-0 size-4 text-fg-4',
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
      ],
      chevronPlaceholder: 'inline-flex shrink-0 size-4',
      icon: 'inline-flex items-center justify-center shrink-0 size-4 text-fg-3',
      iconActive: 'text-primary-5',
      // Label theo design (Figma 4227-25231): Body 13px Medium, trắng.
      label: 'flex-1 truncate text-body-13-medium text-neutral-0',
      // Count/trailing: Caption 12px Medium, neutral-5.
      trailing: 'shrink-0 ml-auto text-caption-12-medium text-fg-4',
      // Trạng thái loading / empty — căn giữa cả 2 trục trong vùng cây.
      state: 'flex h-full w-full flex-col items-center justify-center gap-4 px-4',
    },
  },
  { twMergeConfig: twMergeFontExtend },
);

/**
 * Cấu hình render 1 row — truyền qua context để `TreeNodeRow` (module-scope)
 * giữ identity ổn định mà vẫn nhận giá trị động mới nhất.
 */
interface TreeRowRenderConfig {
  slots: ReturnType<typeof styles>;
  disabled?: boolean;
  iconDefaults: {
    leaf?: SystemIconName;
    collapsed?: SystemIconName;
    expanded?: SystemIconName;
  };
  renderNode?: (node: NodeApi<TreeNodeData>) => React.ReactNode;
  renderTrailing?: (node: NodeApi<TreeNodeData>) => React.ReactNode;
  expandOnRowClick?: boolean;
  expandDisabled?: boolean;
  selectedRowClassName?: string;
}

const TreeRowConfigContext = createContext<TreeRowRenderConfig | null>(null);

/**
 * Row renderer ổn định identity (module-scope). react-arborist render row bằng
 * `<Node>` với `Node = tree.renderNode`; nếu `Node` đổi identity thì arborist
 * **unmount + mount lại** row. Remount xảy ra giữa `pointerdown`↔`pointerup`
 * (Radix Dialog focus-trap/scroll-lock kích hoạt re-render xen giữa gesture) sẽ
 * **nuốt mất `click`**. Giữ component này cố định + đọc cấu hình động qua context
 * → arborist chỉ **reconcile** (không remount) → `click` sống sót, vẫn cập nhật khi
 * caller đổi `renderNode`/selection (context thay đổi → consumer re-render).
 */
function TreeNodeRow({ node, style }: NodeRendererProps<TreeNodeData>) {
  const cfg = useContext(TreeRowConfigContext);
  if (!cfg) return null;
  const {
    slots,
    disabled,
    iconDefaults,
    renderNode,
    renderTrailing,
    expandOnRowClick,
    expandDisabled,
    selectedRowClassName,
  } = cfg;

  const isParent = !node.isLeaf;
  const isOpen = node.isOpen;
  const isSelected = node.isSelected;
  const isFocused = node.isFocused;
  const isDisabled = node.data.disabled || disabled;

  // Node bị disabled vẫn được mở/đóng khi caller bật `expandDisabled` — dùng cho
  // node cha "chỉ làm đường dẫn" (chặn chọn nhưng phải đi xuyên qua được).
  const canExpand = !isDisabled || !!expandDisabled;

  // Click vào row: leaf → select; parent → select (và toggle expand nếu bật
  // expandOnRowClick). Mặc định expand do chevron + icon folder đảm nhiệm.
  const onRowClick = (event: React.MouseEvent) => {
    // ⛔ Click phát sinh từ phần tử được PORTAL ra ngoài (Menu / ContextMenu /
    // Modal / Popover render bên trong `renderNode`): React vẫn cho event nổi
    // theo CÂY REACT dù DOM nằm ở `document.body`. Không chặn thì bấm 1 mục menu
    // ("Thêm thư mục", "Tải lên tệp"…) sẽ toggle + select luôn dòng cây phía sau.
    // Lọc theo DOM: chỉ nhận click thực sự nằm trong row. Đặt TRƯỚC nhánh
    // disabled để không nuốt oan event của lớp nổi.
    if (!event.currentTarget.contains(event.target as Node)) return;
    // Disabled: chặn bubble lên onClick của DefaultRow (react-arborist) — nếu để
    // bubble, node.handleClick vẫn chạy → node disabled vẫn bị select.
    if (isDisabled) {
      // Vẫn cho row-click mở/đóng node đường-dẫn khi `expandDisabled` bật —
      // nhưng TUYỆT ĐỐI không select.
      if (isParent && expandOnRowClick && canExpand) node.toggle();
      event.stopPropagation();
      return;
    }
    if (isParent && expandOnRowClick) node.toggle();
    node.handleClick(event);
    // DefaultRow của react-arborist cũng gắn onClick={node.handleClick} ở div
    // bao ngoài → nếu để event bubble sẽ select 2 lần (onSelect bắn 2 phát).
    // Đã tự gọi handleClick ở trên nên chặn bubble để tránh double-fire.
    event.stopPropagation();
  };

  // Chevron + icon folder (parent) sở hữu expand — chặn bubble để KHÔNG select.
  const onExpandClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (canExpand) node.toggle();
  };

  // Icon parent toggle expand khi KHÔNG ở chế độ row-click (tránh double toggle:
  // row-click mode để icon rơi vào onRowClick lo cả select + expand).
  const iconTogglesExpand = isParent && !expandOnRowClick && canExpand;

  const resolvedIcon = resolveNodeIcon(node, iconDefaults);
  const isIconActive = isOpen || isSelected;

  return (
    <div
      className={cn(
        slots.row(),
        isSelected && (selectedRowClassName || slots.rowSelected()),
        isFocused && !isSelected && slots.rowFocused(),
        isDisabled && slots.rowDisabled(),
      )}
      style={style}
      onClick={onRowClick}
    >
      {/* Chevron — leaf dùng placeholder để row thẳng hàng. Chevron luôn sở hữu
          expand (chặn bubble để không select). */}
      {isParent ? (
        <span
          className={cn(slots.chevron(), 'cursor-pointer', isOpen && 'rotate-90')}
          onClick={onExpandClick}
        >
          {/* Xoay 90° thay vì đổi icon: đổi `name` là thay DOM tức thì nên
              `transition-transform` ở slot chevron không bao giờ chạy được. */}
          <SystemIcon name="angle-right-outline" size={12} />
        </span>
      ) : (
        <span aria-hidden className={slots.chevronPlaceholder()} />
      )}

      {/* Body — renderNode override toàn bộ; ngược lại vẽ icon + name + trailing. */}
      {renderNode ? (
        renderNode(node)
      ) : (
        <>
          {/* Folder mặc định (parent, không custom icon) → icon vàng 2 tông
              (Image asset). Dùng chung cho đóng/mở. Còn lại → SystemIcon. */}
          {!node.isLeaf && !node.data.icon ? (
            <span
              className={cn(
                'mr-1 inline-flex size-4 shrink-0 items-center justify-center',
                iconTogglesExpand && 'cursor-pointer',
              )}
              onClick={iconTogglesExpand ? onExpandClick : undefined}
            >
              <Image alt="" height={16} name="folder-fill" width={16} />
            </span>
          ) : (
            resolvedIcon && (
              // mr-1 + row gap-1 = 8px giữa icon và label (theo Figma);
              // chevron → icon vẫn 4px (row gap). Icon 16px theo design.
              <span
                className={cn(
                  slots.icon(),
                  'mr-1',
                  isIconActive && slots.iconActive(),
                  iconTogglesExpand && 'cursor-pointer',
                )}
                onClick={iconTogglesExpand ? onExpandClick : undefined}
              >
                <SystemIcon name={resolvedIcon} size={16} />
              </span>
            )
          )}
          <span className={slots.label()}>{node.data.name}</span>
          {renderTrailing && <span className={slots.trailing()}>{renderTrailing(node)}</span>}
        </>
      )}
    </div>
  );
}

const Tree = forwardRef<TreeHandle, TreeProps>(function Tree(
  {
    data,
    height = 400,
    width = '100%',
    // ⛔ KHÔNG đặt mặc định ở đây — xem `resolvedRowHeight` bên dưới: mặc định
    //    phụ thuộc thiết bị (con trỏ 30px · ngón tay 40px) nên phải chọn sau khi
    //    hook chạy, không chọn được ở destructuring.
    rowHeight,
    // 28px = (cập con thẳng cột với label cha): leaf icon canh dưới label folder.
    indent = 28,
    selectionMode = 'single',
    selectedIds,
    revealSelected = false,
    onSelect,
    onToggle,
    selectedRowClassName,
    openByDefault = false,
    defaultOpenIds,
    expandAll = false,
    expandOnRowClick = false,
    searchTerm,
    searchMatch,
    defaultLeafIcon,
    defaultCollapsedIcon = 'folder-outline',
    defaultExpandedIcon = 'folder-outline',
    renderNode,
    renderTrailing,
    expandDisabled = false,
    loading = false,
    loadingMessage = 'Đang tải nội dung',
    emptyMessage = 'Không tìm thấy thư mục',
    searchEmptyMessage = 'Không tìm thấy kết quả',
    className,
    disabled,
  },
  ref,
) {
  const treeRef = useRef<TreeApi<TreeNodeData> | null>(null);
  /**
   * ⛔ 2025VCIPMS-1133 (regression) — chặn ECHO LỖI của `onSelect` phát sinh
   * NGOÀI Ý MUỐN consumer trong lượt effect ĐẦU TIÊN sau mount, xem JSDoc đầy
   * đủ tại chỗ khai `handleSelect`.
   *
   * Khởi tạo `true` (KHÔNG phải `false`) vì react-arborist's `TreeProvider`
   * (component CON của `<ArboristTree>`) tự có 1 effect nội bộ chạy NGAY khi
   * mount: `if (props.selection) select(...) else deselectAll()`. Effect của
   * CON luôn chạy TRƯỚC effect của CHA (thứ tự commit React) — nghĩa là trước
   * khi bất kỳ effect nào của `Tree.tsx` kịp seed đúng selection, react-arborist
   * đã tự bắn `onSelect` (rỗng, do `deselectAll()`) ra ngoài rồi. Cờ bắt đầu
   * `true` để nuốt đúng lượt bắn ngoài ý muốn đó; effect "mở khoá" cuối cùng
   * bên dưới đưa cờ về `false` sau khi effect đồng bộ multi-select (nếu có)
   * đã chạy xong, để onSelect do USER click thật sau đó không bị chặn nhầm.
   */
  const isSyncingSelectionRef = useRef(true);
  // `slots` ổn định identity (recipe không có biến runtime).
  const slots = useMemo(() => styles(), []);

  // Height fill: react-arborist cần px number cho virtualization. Khi `height`
  // là chuỗi (vd "100%"), đo container qua ResizeObserver rồi cấp px cho arborist.
  const containerRef = useRef<HTMLDivElement>(null);
  const isFixedHeight = typeof height === 'number';
  const [measuredHeight, setMeasuredHeight] = useState(0);

  useEffect(() => {
    if (isFixedHeight) return;
    const el = containerRef.current;
    if (!el) return;
    // Đọc `clientHeight` (KHÔNG dùng `contentRect`) để cùng một phép đo với
    // effect tự-chữa bên dưới → hai nguồn không bao giờ đá nhau.
    const observer = new ResizeObserver(() => {
      const node = containerRef.current;
      if (node) setMeasuredHeight(node.clientHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFixedHeight]);

  /**
   * ⛔ Tự chữa phép đo — KHÔNG bỏ.
   *
   * Chiều cao px này được cấp thẳng cho `FixedSizeList` của react-window, và danh
   * sách ảo hoá CHỈ dựng đủ số dòng lấp kín ngần đó (+ `overscanCount` = 1). Nếu
   * `ResizeObserver` bắn hụt một nhịp (panel thu/mở, kéo splitter, đổi kích thước
   * cửa sổ, node bị ẩn rồi hiện lại) thì `measuredHeight` KẸT ở giá trị cũ nhỏ
   * hơn khung thật → phần dưới trống trơn và các dòng phía sau không hề được
   * render (nhìn như "mất thư mục"), kẹt tới tận lần resize kế tiếp.
   *
   * Không dep array → đối chiếu lại ở MỖI lần render, chỉ `setState` khi lệch nên
   * không sinh vòng lặp. `useLayoutEffect` để sửa xong TRƯỚC khi vẽ, không chớp.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- CỐ Ý không có dep array (xem chú thích trên). Thêm dep = tắt cơ chế tự chữa. `setState` có chốt so-bằng nên React bail-out, không lặp vô hạn.
  useLayoutEffect(() => {
    if (isFixedHeight) return;
    const el = containerRef.current;
    if (!el) return;
    const real = el.clientHeight;
    setMeasuredHeight((prev) => (prev === real ? prev : real));
  });

  const arboristHeight = isFixedHeight ? (height as number) : measuredHeight;

  // Search không khớp node nào (data còn dữ liệu nhưng filter ra rỗng) →
  // arborist render vùng trống, không có thông báo. Tự tính để hiện empty state.
  // Node "hiện" nếu chính nó khớp HOẶC có hậu duệ khớp (giống filter arborist).
  const noSearchResult = useMemo(() => {
    const term = searchTerm?.trim();
    if (!term) return false;
    const needle = normalizeSearch(term);
    const matches = (node: TreeNodeData): boolean => {
      const selfMatch = searchMatch
        ? searchMatch(node, term)
        : includesNormalized(node.name, needle);
      return selfMatch || (node.children?.some(matches) ?? false);
    };
    return !data.some(matches);
  }, [data, searchTerm, searchMatch]);

  /**
   * `<ArboristTree>` CHỈ được dựng ở nhánh cuối của chuỗi điều kiện render bên
   * dưới. Tách ra biến vì hai effect selection phải bám ĐÚNG thời điểm cây thật
   * mount, không phải thời điểm `Tree` mount (xem effect "khoá/mở khoá" dưới).
   * ⛔ Đổi điều kiện ở JSX thì PHẢI đổi ở đây.
   */
  const showArborist = !loading && data.length > 0 && !noSearchResult;

  /**
   * ⛔ 2025VCIPMS-1133 (regression #2) — KHOÁ LẠI guard ngay trước mỗi lần
   * `<ArboristTree>` mount. KHÔNG gộp vào effect "mở khoá" bên dưới.
   *
   * Vì sao cần: `Tree` mount KHÔNG đồng nghĩa `ArboristTree` mount. Cây lazy
   * thường có đúng một render mà `loading` đã tắt nhưng `data` còn RỖNG (nguồn
   * seed state ở một effect chạy sau — xem `useChecklistDocTree`): lúc đó
   * `Tree` render nhánh empty-state, `treeRef` còn `null`, nhưng effect "mở
   * khoá" (deps `[]`) VẪN chạy và hạ cờ xuống `false`. Render kế tiếp `data`
   * mới về, `ArboristTree` mount và `TreeProvider` chạy effect nội bộ
   * `if (props.selection) select(...) else deselectAll()` — ở `multi` mode ta
   * CỐ Ý không set `selection` nên nó rơi vào `deselectAll()`, bắn
   * `onSelect([])` ĐỒNG BỘ ra ngoài. Cờ đã hạ ⇒ echo lọt qua `handleSelect` ⇒
   * `selectedIds` của consumer bị GHI ĐÈ xuống rỗng ngay khi vừa mở, dù chưa
   * ai bấm gì (triệu chứng: popup "Bản mềm" bung đúng nhánh nhưng "Đang liên
   * kết" lại báo "chưa chọn node nào").
   *
   * `useLayoutEffect` là bắt buộc: layout effect của CHA vẫn chạy TRƯỚC MỌI
   * passive effect của CON, nên cờ kịp bật lại trước `deselectAll()`. Dùng
   * `useEffect` ở đây là thua cuộc đua (passive của con chạy trước passive của cha).
   */
  useLayoutEffect(() => {
    if (showArborist) isSyncingSelectionRef.current = true;
  }, [showArborist]);

  // revealSelected: chỉ chạy KHI cây đã có chiều cao (fixed px, hoặc "100%" đã đo
  // xong qua ResizeObserver) → mở cha + cuộn tới node đang chọn. 1 rAF để arborist
  // hoàn tất layout theo height mới. Không cần canh timing thủ công ở consumer.
  //
  // ⛔ 2025VCIPMS-1133 — TRƯỚC ĐÂY chỉ mở cha của `selectedIds[0]`: picker
  // multi-select (vd "Vị trí bản mềm" của checklist) tick sẵn NHIỀU node, nhưng
  // mở lại chỉ node đầu tiên được lộ ra, các node còn lại vẫn nằm trong nhánh
  // thu gọn — trông như "chưa chọn đủ". Giờ mở cha của TẤT CẢ node đang chọn;
  // vẫn chỉ cuộn tới node đầu tiên (giữ hành vi cũ, tránh giật cuộn qua lại).
  //
  // `revealKey` (chuỗi nối id) thay cho so sánh `selectedIds` theo tham chiếu —
  // mảng có thể đổi identity mỗi render dù nội dung id không đổi, sẽ chạy lại
  // effect vô ích (và với cây lazy, gọi `openParents` thừa không hại gì nhưng
  // tốn 1 rAF mỗi render cha).
  const revealIds = useMemo(() => selectedIds ?? [], [selectedIds]);
  const revealKey = revealIds.join(',');
  useEffect(() => {
    if (!revealSelected || revealIds.length === 0 || arboristHeight <= 0) return;
    const raf = requestAnimationFrame(() => {
      revealIds.forEach((id) => treeRef.current?.openParents(id));
      treeRef.current?.scrollTo(revealIds[0]);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revealKey` đại diện nội dung `revealIds`; liệt kê thêm `revealIds` sẽ chạy lại mỗi render do đổi reference mảng.
  }, [revealSelected, revealKey, arboristHeight, data]);

  /**
   * Seed ĐỦ selection nhiều id cho `selectionMode="multi"` — bù lại việc
   * `treeProps.selection` giờ CỐ Ý bỏ trống ở multi mode (xem giải thích tại
   * chỗ khai `treeProps` bên dưới, 2025VCIPMS-1133). `api.setSelection()`
   * nhận thẳng MẢNG id, không bị giới hạn 1 phần tử như `api.select()`.
   *
   * `api.setSelection` tự bắn `onSelect` sau khi set → nếu không chặn, effect
   * này sẽ tự gọi lại chính nó vô hạn (cha nhận `onSelect` → set state mới →
   * `selectedIds` đổi reference → effect chạy lại...). So sánh GIÁ TRỊ (Set)
   * với selection nội bộ hiện tại của arborist trước khi gọi lại để chặn vòng
   * lặp — chỉ thực sự `setSelection` khi nội dung id đổi thật.
   */
  useEffect(() => {
    if (selectionMode !== 'multi') return;
    const api = treeRef.current;
    if (!api) return;
    const next = selectedIds ?? [];
    const current = api.selectedIds;
    const same = next.length === current.size && next.every((id) => current.has(id));
    if (same) return;
    const last = next[next.length - 1] ?? null;
    // Bọc bằng cờ để `handleSelect` bỏ qua ECHO ngay sau `setSelection` — xem
    // JSDoc đầy đủ tại chỗ khai `handleSelect` (2025VCIPMS-1133 regression).
    isSyncingSelectionRef.current = true;
    api.setSelection({ ids: next, anchor: last, mostRecent: last });
    isSyncingSelectionRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so sánh giá trị bên trong effect (không phải deps) mới là chốt chặn vòng lặp; `data` thêm vào để re-check sau khi cây lazy tải thêm node.
  }, [selectionMode, revealKey, data]);

  /**
   * Mở khoá `isSyncingSelectionRef` — chạy SAU effect nội bộ
   * `select()/deselectAll()` của react-arborist (con, chạy trước) VÀ sau effect
   * đồng bộ multi-select ngay phía trên (cha, cùng component nên chạy theo thứ
   * tự khai báo — effect này đứng SAU nên luôn chạy sau). Từ đây, `onSelect` do
   * USER thao tác thật (click/Ctrl+click/phím) đi qua bình thường, không bị
   * `handleSelect` nuốt nhầm nữa (2025VCIPMS-1133).
   *
   * ⛔ Deps là `[showArborist]`, KHÔNG phải `[]`: cây lazy có thể dựng
   * `<ArboristTree>` MUỘN hơn `Tree` vài render (data về sau), và mỗi lần nó
   * mount lại là một lượt `deselectAll()` mới cần được nuốt. Cặp khoá/mở khoá
   * phải bám cùng một nhịp — xem JSDoc của layout effect "khoá lại" phía trên.
   */
  useEffect(() => {
    isSyncingSelectionRef.current = false;
  }, [showArborist]);

  // Cuộn chuột trong Radix Dialog (Modal): react-remove-scroll lắng nghe `wheel`
  // ở document (bubble) và preventDefault → cây nằm trong Popover portal không
  // cuộn được. Dùng native listener `{ passive: false }` NGAY trên container Tree
  // (chạy trước document) để tự lái scroller ảo hoá của arborist. Chỉ can thiệp
  // khi đang có Dialog mở (react-remove-scroll đang khoá); ngoài Dialog để native
  // cuộn bình thường → không đổi hành vi nơi khác.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      if (!document.querySelector('[role="dialog"][data-state="open"]')) return;
      let node = event.target as HTMLElement | null;
      while (node && node !== container.parentElement) {
        if (node.scrollHeight > node.clientHeight) {
          const overflowY = getComputedStyle(node).overflowY;
          if (overflowY === 'auto' || overflowY === 'scroll') {
            event.preventDefault();
            node.scrollTop += event.deltaY;
            return;
          }
        }
        node = node.parentElement;
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Áp lại expandAll/collapseAll mỗi khi prop thay đổi.
  useEffect(() => {
    if (!treeRef.current) return;
    if (expandAll) treeRef.current.openAll();
    else treeRef.current.closeAll();
  }, [expandAll]);

  useImperativeHandle(
    ref,
    () => ({
      expandAll: () => treeRef.current?.openAll(),
      collapseAll: () => treeRef.current?.closeAll(),
      select: (id: string) => treeRef.current?.select(id),
      deselect: (id: string) => treeRef.current?.get(id)?.deselect(),
      scrollTo: (id: string) => treeRef.current?.scrollTo(id),
      open: (id: string) => treeRef.current?.open(id),
      close: (id: string) => treeRef.current?.close(id),
      openParents: (id: string) => treeRef.current?.openParents(id),
    }),
    [],
  );

  // Matcher mặc định: substring KHÔNG phân biệt hoa/thường VÀ không phân biệt
  // dấu trên `name` — gõ "ham kin" phải ra "Hầm kín" (`search-matching.md`).
  const matcher = useCallback(
    (node: NodeApi<TreeNodeData>) => {
      if (!searchTerm) return true;
      if (searchMatch) return searchMatch(node.data, searchTerm);
      return includesSearch(node.data.name, searchTerm);
    },
    [searchTerm, searchMatch],
  );

  /**
   * ⛔ 2025VCIPMS-1133 (regression) — `api.setSelection()` (effect multi-select
   * sync bên dưới) LUÔN tự bắn `onSelect(this.selectedNodes)` ngay sau khi set.
   * `selectedNodes` của react-arborist chỉ lấy node ĐANG CÓ trong `data` hiện
   * tại (`this.get(id)`) — node liên kết nằm trong nhánh cây lazy CHƯA tải
   * xong (`revealPath` còn đang chạy ngầm) sẽ bị lọc mất khỏi `selectedNodes`,
   * dù `state.nodes.selection.ids` (Set nội bộ) vẫn có ĐỦ id. Echo đó vọng
   * ngược ra `onSelect` NGOÀI (`handleSelect`) với mảng ĐÃ CẮT BỚT, ghi đè
   * state `selectedIds` thật của cha xuống rỗng/thiếu — dòng chỉ có 1 liên
   * kết nằm trong nhánh chưa tải bị xoá sạch khỏi "Đang liên kết" ngay khi mở
   * popup, dù chưa ai bấm gì.
   *
   * `isSyncingSelectionRef` (khai ở đầu component) chặn đúng ECHO LỖI đó: bật
   * NGAY TRƯỚC khi effect gọi `setSelection`, tắt NGAY SAU (đồng bộ — dispatch
   * của arborist chạy ngay trong cùng lượt gọi, không qua microtask) →
   * `handleSelect` bỏ qua đúng lượt gọi đó. Click chọn THẬT của user (qua
   * `renderNode` → `NodeApi.select/.selectMulti/.deselect`) chạy ở stack
   * riêng, không trùng lúc cờ đang bật → không bị ảnh hưởng.
   */
  const handleSelect = useCallback(
    (nodes: NodeApi<TreeNodeData>[]) => {
      if (isSyncingSelectionRef.current) return;
      onSelect?.(nodes.map((node) => node.id));
    },
    [onSelect],
  );

  // `defaultOpenIds: string[]` → arborist `initialOpenState: { id: true }`.
  // Chỉ áp dụng lần render đầu (arborist không re-apply khi đổi prop này).
  const initialOpenState = useMemo(() => {
    if (!defaultOpenIds?.length) return undefined;
    return Object.fromEntries(defaultOpenIds.map((id) => [id, true]));
  }, [defaultOpenIds]);

  // disableEdit/disableDrag/disableDrop: chưa implement các tính năng này —
  // tắt đi để giữ hành vi read-only thân thiện với keyboard.
  /**
   * Chiều cao dòng — 30px trên MỌI thiết bị, kể cả máy tính bảng.
   *
   * ⛔ ĐÃ BỎ NHÁNH `isCoarsePointer ? 40 : 30`. ĐỪNG DỰNG LẠI.
   *
   *    Đây là chỗ phóng to LỚN NHẤT còn sót của đợt máy tính bảng, và là chỗ khó
   *    thấy nhất: nó KHÔNG phải class `touch:` nên mọi lượt rà theo CSS đều bỏ
   *    qua. Hệ quả thực tế: cây thư mục Tài liệu / BIM / danh mục / cơ cấu tổ
   *    chức có dòng cao 40px trên iPad so với 30px trên laptop — dày hơn 33%,
   *    và vì cây thường có vài chục dòng nên cả panel đọc ra như bị phóng to.
   *
   *    Người dùng đã chốt: iPad hiển thị Y HỆT laptop, phần dễ chạm lo bằng lớp
   *    phủ trong suốt chứ không bằng cách thổi phồng hình.
   *
   * Caller vẫn truyền `rowHeight` tường minh được nếu màn đó cần khác.
   */
  const resolvedRowHeight = rowHeight ?? 30;

  const treeProps = useMemo(
    () => ({
      data,
      openByDefault: expandAll || openByDefault,
      initialOpenState,
      height: arboristHeight,
      width,
      rowHeight: resolvedRowHeight,
      indent,
      searchTerm,
      searchMatch: searchTerm ? matcher : undefined,
      disableEdit: true,
      disableDrag: true,
      disableDrop: true,
      disableMultiSelection: selectionMode === 'single',
      // ⛔ 2025VCIPMS-1133 — react-arborist coi `selection` là 1 id DUY NHẤT:
      // mỗi khi prop này set (kể cả lần mount đầu), nó tự dispatch
      // `SELECTION_ONLY` (xem `provider.js` của react-arborist) — GHI ĐÈ toàn
      // bộ selection nội bộ xuống còn ĐÚNG id đó rồi bắn `onSelect` với mảng 1
      // phần tử. Ở `selectionMode="multi"` (vd picker "Vị trí bản mềm" tick
      // sẵn ≥ 2 node), điều này lặng lẽ CẮT `selectedIds` của component cha
      // xuống còn 1 ngay sau mount — dù truyền vào 2+ id.
      //
      // CHỈ set prop này khi `single` (đúng ý định: 1 selection == 1 id).
      // `multi` seed đủ selection qua `api.setSelection()` ở effect riêng bên
      // dưới (giữ ĐỦ mọi id, không đi qua đường "1 id thay toàn bộ" này).
      selection: selectionMode === 'single' ? selectedIds?.[0] : undefined,
      onSelect: handleSelect,
      // react-arborist gọi onToggle(id) mỗi lần node mở/đóng → consumer lazy-load.
      onToggle,
    }),
    [
      data,
      expandAll,
      openByDefault,
      initialOpenState,
      arboristHeight,
      width,
      resolvedRowHeight,
      indent,
      searchTerm,
      matcher,
      selectionMode,
      selectedIds,
      handleSelect,
      onToggle,
    ],
  );

  // Cấu hình render row truyền qua context. `TreeNodeRow` (module-scope) giữ
  // identity cố định → arborist không remount row; context đổi thì consumer chỉ
  // reconcile (giữ `click` sống sót giữa gesture, vẫn cập nhật nội dung).
  const renderCtx = useMemo<TreeRowRenderConfig>(
    () => ({
      slots,
      disabled,
      iconDefaults: {
        leaf: defaultLeafIcon,
        collapsed: defaultCollapsedIcon,
        expanded: defaultExpandedIcon,
      },
      renderNode,
      renderTrailing,
      expandOnRowClick,
      expandDisabled,
      selectedRowClassName,
    }),
    [
      slots,
      disabled,
      defaultLeafIcon,
      defaultCollapsedIcon,
      defaultExpandedIcon,
      renderNode,
      renderTrailing,
      expandOnRowClick,
      expandDisabled,
      selectedRowClassName,
    ],
  );

  // Vô hiệu TYPE-AHEAD của react-arborist: khi CÂY giữ focus, gõ 1 ký tự chữ →
  // react-arborist nhảy focus tới node bắt đầu bằng ký tự đó (vd 'c') → cướp focus
  // khỏi ô tìm ngoài + nuốt ký tự. Cây trong app luôn đi kèm ô tìm riêng nên
  // type-ahead thừa + gây lỗi. Chặn ở CAPTURE: ký tự đơn in được (trừ Space) không
  // tới được handler của arborist. GIỮ phím điều hướng (arrow/enter/tab/home/end/
  // page…) + Space (toggle). KHÔNG chặn khi target là input/textarea (vd đổi tên
  // inline trong row) để không phá việc gõ trong đó.
  const handleKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.stopPropagation();
    }
  }, []);

  // Bọc arborist trong surface kit2. `height` (số/“100%”) áp lên container;
  // arborist nhận px đã đo (arboristHeight) để virtualization hoạt động.
  return (
    <div
      ref={containerRef}
      className={cn(slots.container(), className)}
      style={{ width, height }}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {loading ? (
        // Loading — spinner fade 48px (Image asset) tự quay, căn giữa.
        <div className={slots.state()}>
          <span className="inline-flex size-12 animate-spin">
            <Image alt="" height={48} name="loading-spinner" width={48} />
          </span>
          <Text className="text-center" size="medium" skin="muted">
            {loadingMessage}
          </Text>
        </div>
      ) : data.length === 0 ? (
        // Empty — folder xám 96px căn giữa.
        <div className={slots.state()}>
          <Image alt="" height={96} name="folder-empty" width={96} />
          <Text className="text-center" size="medium" skin="muted">
            {emptyMessage}
          </Text>
        </div>
      ) : noSearchResult ? (
        // Search không khớp — folder xám 96px + thông báo không có kết quả.
        <div className={slots.state()}>
          <Image alt="" height={96} name="folder-empty" width={96} />
          <Text className="text-center" size="medium" skin="muted">
            {searchEmptyMessage}
          </Text>
        </div>
      ) : (
        <TreeRowConfigContext.Provider value={renderCtx}>
          <ArboristTree<TreeNodeData> ref={treeRef} {...treeProps}>
            {TreeNodeRow}
          </ArboristTree>
        </TreeRowConfigContext.Provider>
      )}
    </div>
  );
});

export default Tree;
