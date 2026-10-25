/**
 * @file scroll-snap.utils.ts
 * @description Mốc dừng khi cuộn NGANG theo CỘT — dùng cho `<ScrollEdgeNav>`.
 * Bấm 1 nhịp đi đúng MỘT cột (mép trái cột kế tiếp về sát mép vùng cuộn) thay vì
 * nhảy gần một khung màn hình qua nhiều cột một lúc.
 */

/** Sai số khi so mép — trùng `EDGE_EPSILON` của `useScrollEdgeNav`. */
const EPSILON = 2;

/**
 * Mốc `scrollLeft` tính từ bề rộng các cột CUỘN ĐƯỢC (cộng dồn từ trái).
 *
 * Khối cột ghim nằm `sticky left-0` nên `scrollLeft` = tổng bề rộng các cột cuộn
 * ĐÃ đi qua — KHÔNG cộng bề rộng khối ghim vào mốc.
 */
export function columnScrollStops(widths: readonly number[]): number[] {
  const stops = [0];
  let acc = 0;
  for (const width of widths) {
    acc += width;
    stops.push(acc);
  }
  return stops;
}

/**
 * Đo mốc dừng theo cột của một `<table>` nằm trong vùng cuộn `root`.
 *
 * Đo bằng `getBoundingClientRect()` chứ KHÔNG `offsetLeft`: ô ghim là
 * `position: sticky` nên `offsetLeft` đã cộng cả phần trượt theo cuộn, lấy ra sẽ
 * lệch đúng bằng `scrollLeft`.
 *
 * `stickyCount` = số cột ghim LIÊN TIẾP tính từ trái. Bề rộng khối ghim phải trừ
 * đi vì cột cuộn đầu tiên nấp ngay sau nó.
 */
export function measureColumnStops(root: HTMLElement | null, stickyCount = 0): number[] {
  const head = root?.querySelector('thead > tr');
  if (!root || !head) return [];

  const cells = Array.from(head.children) as HTMLElement[];
  let stickyWidth = 0;
  for (let i = 0; i < Math.min(stickyCount, cells.length); i += 1) {
    stickyWidth += cells[i].offsetWidth;
  }

  const rootLeft = root.getBoundingClientRect().left;
  const stops = [0];
  for (let i = stickyCount; i < cells.length; i += 1) {
    const x = cells[i].getBoundingClientRect().left - rootLeft + root.scrollLeft - stickyWidth;
    if (x > EPSILON) stops.push(x);
  }
  return stops;
}

/**
 * Mốc kế tiếp theo hướng `dir` (1 = sang phải, -1 = sang trái).
 *
 * Mốc được kẹp vào `[0, max]` rồi bỏ trùng: cột nằm ngoài tầm cuộn đều rơi về
 * đúng mép nên nhịp cuối KHÔNG bị "chết" tại chỗ. Hết mốc → về hẳn mép.
 */
export function resolveScrollStop(
  stops: readonly number[],
  current: number,
  dir: -1 | 1,
  max: number,
): number {
  const sorted = Array.from(new Set(stops.map((s) => Math.min(Math.max(s, 0), max)))).sort(
    (a, b) => a - b,
  );

  if (dir === 1) return sorted.find((s) => s > current + EPSILON) ?? max;

  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i] < current - EPSILON) return sorted[i];
  }
  return 0;
}
