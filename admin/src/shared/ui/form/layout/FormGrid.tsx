import { cn } from '@/shared/utils/style/cn';

type GridCols = 1 | 2 | 3 | 4;

/**
 * Bề ngang TỐI ĐA của một cột field.
 *
 * `readable` (mặc định) — cột không bao giờ vượt 28rem/448px.
 * `fill`                — cột chia đều hết bề ngang khung chứa (hành vi cũ).
 */
type FieldWidth = 'readable' | 'fill';

export interface FormGridProps {
  children: React.ReactNode;
  cols?: GridCols;
  /**
   * Trần bề ngang mỗi cột. Để mặc định trừ khi bạn CỐ Ý cần field trải hết
   * khung — ví dụ một ô soạn thảo dài, hay bảng nhúng trong form.
   */
  fieldWidth?: FieldWidth;
  className?: string;
}

/**
 * ⛔ `1fr` KHÔNG có trần, và đó là lỗi đã đo được.
 *
 * `1fr` nghĩa là "chia đều bề ngang khung chứa". Trong modal ~700px thì
 * `cols={2}` ra 2 cột 340px — hợp lý, nên lỗi này ẩn suốt. Nhưng cùng form đó
 * đặt trong trang full-width trên màn ngoài (khung ~1670px) thì mỗi cột phình
 * lên **802px**: nhãn nằm tận mép trái còn con trỏ nhập ở mép phải, mắt phải
 * quét cả gang tay mới nối được nhãn với ô của nó.
 *
 * `minmax(0,28rem)` giữ nguyên SỐ CỘT (đúng ý người gọi) nhưng chặn trần bề
 * ngang. Cận dưới `0` là BẮT BUỘC: thiếu nó cột lấy `min-content` làm sàn và
 * field có chữ dài sẽ đẩy lưới tràn ra ngoài khung.
 *
 * 28rem/448px là TRẦN chứ không phải cỡ cố định — khung hẹp hơn thì cột tự co,
 * nên bố cục trong modal không đổi một pixel nào.
 *
 * ⛔ Các chuỗi dưới đây phải viết LITERAL, KHÔNG ghép bằng biến. Tailwind v4
 *    quét mã nguồn như VĂN BẢN THUẦN: `repeat(2,${COL})` nội suy lúc chạy thì
 *    scanner không thấy tên class nào để sinh, và lưới im lặng mất hết cột.
 */
const COL_MAP: Record<FieldWidth, Record<GridCols, string>> = {
  readable: {
    1: '[grid-template-columns:minmax(0,28rem)]',
    2: 'grid-cols-1 md:[grid-template-columns:repeat(2,minmax(0,28rem))]',
    3: 'grid-cols-1 md:[grid-template-columns:repeat(2,minmax(0,28rem))] lg:[grid-template-columns:repeat(3,minmax(0,28rem))]',
    4: 'grid-cols-1 md:[grid-template-columns:repeat(2,minmax(0,28rem))] lg:[grid-template-columns:repeat(4,minmax(0,28rem))]',
  },
  fill: {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  },
};

/** Responsive grid wrapper for form fields. */
function FormGrid({ children, cols = 2, fieldWidth = 'readable', className }: FormGridProps) {
  return <div className={cn('grid gap-4', COL_MAP[fieldWidth][cols], className)}>{children}</div>;
}

export default FormGrid;
