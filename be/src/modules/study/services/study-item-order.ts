/**
 * Thứ tự mục học (`StudyItem.order`, số thực) — hàm THUẦN. Chèn "giữa hai hàng xóm" bằng trung điểm nên KHÔNG phải ghi
 * lại các mục khác; chỉ khi khoảng cách quá nhỏ (< `MIN_GAP`, sau rất nhiều lần chèn liên tiếp) mới nén lại cả danh sách
 * (`renumbered`). Danh sách ≤ `LIMITS.study.itemsPerSetMax` nên nén là thao tác rẻ.
 */
export const ORDER_STEP = 1024;
const MIN_GAP = 1e-6;

export interface OrderedRef {
  ref: string;
  order: number;
}

export interface OrderOp {
  /** Định danh mục trong lượt lưu: `id` mục đã có, hoặc `new:<clientItemKey>` cho mục mới. */
  ref: string;
  /** Mục đã có (giữ nguyên chỗ nếu `after === undefined`). */
  existing: boolean;
  /**
   * `undefined` = không yêu cầu (mục mới → cuối danh sách; mục cũ → giữ chỗ) · `null` = đầu danh sách ·
   * chuỗi = ngay SAU mục có `ref` đó (đã đổi từ `afterClientItemKey`).
   */
  after: string | null | undefined;
}

export interface OrderResult {
  /** Chỉ chứa mục MỚI hoặc mục đổi `order` (mục giữ chỗ không có mặt). */
  orders: Map<string, number>;
  /** `true` khi phải nén lại — `orders` gồm mọi mục có `order` thay đổi, không chỉ các mục trong `ops`. */
  renumbered: boolean;
}

function midpoint(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return ORDER_STEP;
  if (prev === undefined) return (next as number) - ORDER_STEP;
  if (next === undefined) return prev + ORDER_STEP;
  return (prev + next) / 2;
}

/**
 * @param current mục còn lại SAU khi đã xoá (mọi mục hiện có của bộ, không gồm mục bị xoá).
 * @param ops thao tác theo THỨ TỰ trong `upsert[]` — mỗi mục được đặt lần lượt nên mục sau có thể tham chiếu mục trước.
 */
export function computeOrders(current: readonly OrderedRef[], ops: readonly OrderOp[]): OrderResult {
  const list: OrderedRef[] = current.map((r) => ({ ...r })).sort((a, b) => a.order - b.order);
  const before = new Map(list.map((r) => [r.ref, r.order]));
  const touched = new Set<string>();
  let tooTight = false;

  for (const op of ops) {
    if (op.existing && op.after === undefined) continue;
    const at = list.findIndex((r) => r.ref === op.ref);
    if (at >= 0) list.splice(at, 1); // đang dời chỗ

    let index = list.length; // mặc định: cuối danh sách
    if (op.after === null) index = 0;
    else if (op.after !== undefined) {
      const anchor = list.findIndex((r) => r.ref === op.after);
      index = anchor >= 0 ? anchor + 1 : list.length;
    }

    const prev = list[index - 1]?.order;
    const next = list[index]?.order;
    if (prev !== undefined && next !== undefined && next - prev < MIN_GAP) tooTight = true;
    list.splice(index, 0, { ref: op.ref, order: midpoint(prev, next) });
    touched.add(op.ref);
  }

  if (tooTight) list.forEach((r, i) => (r.order = (i + 1) * ORDER_STEP));

  const orders = new Map<string, number>();
  for (const r of list) {
    if (touched.has(r.ref) || (tooTight && before.get(r.ref) !== r.order)) orders.set(r.ref, r.order);
  }
  return { orders, renumbered: tooTight };
}
