import { useMemo } from 'react';
import { formatNumber } from '@/shared/utils/format/format.utils';
import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { PAGE_SIZE_OPTIONS } from '@/shared/constants/consts';
import Button from '@/shared/ui/actions/Button';
import Menu from '@/shared/ui/actions/Menu';

/**
 * Pagination — footer matching Figma 643:6996.
 *
 *   [ Kết quả: N ]                 [‹ 1 2 3 4 5 ›]                [10 /trang ▾]
 *
 * Controlled bằng props thuần (không phụ thuộc thư viện table). `Table` truyền
 * state phân trang xuống; có thể dùng độc lập cho mọi nguồn dữ liệu.
 *
 * ⛔ Dải này LUÔN `shrink-0`. Nó gần như luôn là con CUỐI của một flex column
 *    (`<Table>` đặt nó ngay dưới vùng cuộn; các trang tự ghép thì đặt dưới một
 *    `flex-1`). Flex item mặc định `flex-shrink: 1`, nên khi khung chứa thấp hơn
 *    tổng nội dung thì trình duyệt bóp ĐÚNG dải này — nút `size-8` bị xén, chữ
 *    "Kết quả:" chồng lên viền. Phần dôi phải trừ vào VÙNG CUỘN (đã `min-h-0
 *    flex-1`), không trừ vào hàng phân trang.
 */

// Reused classes — keep them named for readability + DRY across buttons.
const NEUTRAL_OUTLINE =
  'border-border-2 text-fg-3 hover:bg-bg-2/70 hover:text-fg-1 hover:border-border-2';

const SQUARE_BUTTON = 'size-8 p-0';
/**
 * `tabular-nums` khai TƯỜNG MINH (visual-hierarchy §3.3) để dãy nút trang không
 * nhảy bề rộng khi số chữ số đổi (9 → 10).
 *
 * ℹ️ `globals.css` đã đặt `font-variant-numeric: tabular-nums` trên `body` nên
 *    thuộc tính này vốn thừa kế xuống — khai lại ở đây là chốt chặn, đúng lối
 *    các component số khác của kit2 (`Progress`, `NumberInput`, `SummaryPill`)
 *    đang làm: dải phân trang không phụ thuộc vào một dòng CSS toàn cục có thể
 *    bị đổi ở nơi khác.
 */
const PAGE_BUTTON = 'min-w-8 px-0 text-body-13 tabular-nums';

export interface PaginationProps {
  /** Trang hiện tại (0-based). */
  pageIndex: number;
  /** Tổng số trang. */
  pageCount: number;
  /** Số dòng mỗi trang hiện tại. */
  pageSize: number;
  /** Tổng số dòng (cho nhãn "Kết quả"). */
  total: number;
  /** Đổi trang. */
  onPageChange: (pageIndex: number) => void;
  /** Đổi số dòng/trang. */
  onPageSizeChange: (pageSize: number) => void;
  /** Tuỳ chọn số dòng/trang trong menu. */
  pageSizeOptions?: number[];
  /** Nhãn trước số kết quả ("Kết quả:"). */
  countLabel?: string;
  /** Hậu tố sau số dòng/trang ("/trang"). */
  pageSizeSuffix?: string;
  /** Số nút trang tối đa ở cụm giữa. */
  maxPageButtons?: number;
  /** Hiển thị divider header */
  showDivider?: boolean;
  className?: string;
}

const ELLIPSIS = '…' as const;
type PageItem = number | typeof ELLIPSIS;

/**
 * Danh sách phần tử để render: các page-index (0-based) + `…` cho khoảng trống.
 * Luôn hiển thị trang đầu, trang cuối và các trang kề `current`.
 */
function getPageItems(pageCount: number, current: number, maxButtons: number): PageItem[] {
  if (pageCount <= maxButtons) {
    return Array.from({ length: pageCount }, (_, idx) => idx);
  }

  // Tập trang cần hiển thị: đầu, cuối, current và 1 trang kề mỗi bên.
  const pages = new Set([0, pageCount - 1, current]);
  pages.add(Math.max(0, current - 1));
  pages.add(Math.min(pageCount - 1, current + 1));

  // Chèn `…` vào mỗi khoảng trống giữa các trang liên tiếp.
  const items: PageItem[] = [];
  let prev = -1;
  for (const page of [...pages].sort((a, b) => a - b)) {
    if (page - prev > 1) items.push(ELLIPSIS);
    items.push(page);
    prev = page;
  }
  return items;
}

function Pagination({
  pageIndex,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  showDivider = true,
  pageSizeOptions = [...PAGE_SIZE_OPTIONS],
  countLabel = 'Kết quả:',
  pageSizeSuffix = '/trang',
  maxPageButtons = 7,
  className,
}: PaginationProps) {
  const canPrevious = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;

  const pageItems = useMemo(
    () => getPageItems(pageCount, pageIndex, maxPageButtons),
    [pageCount, pageIndex, maxPageButtons],
  );

  const sizeOptions = useMemo(
    () =>
      pageSizeOptions.map((size) => ({
        key: String(size),
        label: `${size} ${pageSizeSuffix}`.trim(),
      })),
    [pageSizeOptions, pageSizeSuffix],
  );

  const pageButtons = pageItems.map((item, position) => {
    if (item === ELLIPSIS) {
      return (
        <span
          key={`gap-${position}`}
          className="inline-flex h-8 min-w-8 items-center justify-center text-body-13 text-fg-4 select-none"
        >
          {ELLIPSIS}
        </span>
      );
    }
    const isActive = item === pageIndex;
    return (
      <Button
        key={item}
        aria-current={isActive ? 'page' : undefined}
        aria-label={`Trang ${item + 1}`}
        className={cn(PAGE_BUTTON, !isActive && NEUTRAL_OUTLINE)}
        size="sm"
        variant={isActive ? 'primary' : 'stroke'}
        onClick={() => onPageChange(item)}
      >
        {item + 1}
      </Button>
    );
  });

  return (
    // `nav` + tên: người dùng trình đọc màn hình nhảy thẳng tới vùng phân trang bằng phím tắt landmark.
    <nav
      aria-label="Phân trang"
      className={cn(
        'flex shrink-0 items-center justify-between gap-4 px-4 py-2.5',
        className,
        showDivider && 'border-t border-border-1',
      )}
    >
      {/* Trái: [N /trang ▾] + [Kết quả: N] */}
      <div className="flex items-center gap-4">
        <div className="text-body-13 whitespace-nowrap">
          <span className="text-fg-4">{countLabel} </span>
          {/* `formatNumber`: tổng lớn phải đọc được ("1.234"), không phải "1234". */}
          {/* Hai bậc: `accent-5` (#FFB700) chỉ đọc được trên nền navy — trên nền sáng còn ~1.8:1. */}
          <span className="text-accent-7 dark:text-accent-5 text-body-13-medium tabular-nums">
            {formatNumber(total)}
          </span>
        </div>
        <Menu
          align="start"
          options={sizeOptions}
          trigger={
            <Button
              className={cn(NEUTRAL_OUTLINE, 'text-body-13')}
              endIcon={<SystemIcon name="angle-down-outline" size={12} />}
              size="sm"
              variant="stroke"
            >
              <span className="text-fg-1 text-body-13-medium tabular-nums">{pageSize}</span>
              {pageSizeSuffix}
            </Button>
          }
          onSelect={(option) => onPageSizeChange(Number(option.key))}
        />
      </div>

      {/* Phải: cụm nút phân trang */}
      <div className="flex items-center gap-2">
        <Button
          aria-label="Trang trước"
          className={SQUARE_BUTTON}
          disabled={!canPrevious}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(pageIndex - 1)}
        >
          <SystemIcon className="size-4" name="angle-left-outline" size={12} />
        </Button>

        {pageButtons}

        <Button
          aria-label="Trang sau"
          className={SQUARE_BUTTON}
          disabled={!canNext}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(pageIndex + 1)}
        >
          <SystemIcon className="size-4" name="angle-right-outline" size={12} />
        </Button>
      </div>
    </nav>
  );
}

export default Pagination;
