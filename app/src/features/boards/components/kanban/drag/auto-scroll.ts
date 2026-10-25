/**
 * Bước tự cuộn khi thẻ kéo tới sát mép (`app.md` §2 `useAutoScroll`): âm = cuộn
 * về đầu, dương = cuộn về cuối, 0 = ở giữa. Càng sát mép càng nhanh, tối đa
 * `maxStep`; vượt hẳn ra ngoài mép thì giữ ở tốc độ tối đa chứ không tăng mãi.
 *
 * Hàm thuần — dùng cho cả hai chiều (dọc: cuộn list; ngang: lật cột).
 */
export function edgeScrollStep(
  pointer: number,
  min: number,
  max: number,
  edge: number,
  maxStep: number,
): number {
  if (edge <= 0 || max <= min) return 0;
  if (pointer < min + edge) {
    return -Math.round(maxStep * Math.min(1, (min + edge - pointer) / edge));
  }
  if (pointer > max - edge) {
    return Math.round(maxStep * Math.min(1, (pointer - (max - edge)) / edge));
  }
  return 0;
}

/**
 * Chỉ cho mép tự cuộn khi ngón tay đã dịch VỀ PHÍA mép đó ít nhất `arm` dp kể từ lúc nhấc thẻ — `travelled` = vị trí hiện tại − vị trí
 * lúc nhấc, cùng trục với `step` (kết quả của `edgeScrollStep`).
 *
 * ⛔ Thiếu bước này thì nhấc một thẻ nằm SẴN trong vùng mép là cuộn ngay dù ngón tay đứng yên: điện thoại có mép trái thẻ ở x = 24 dp
 * trong khi vùng mép rộng 56 dp, nên giữ phần đầu tiêu đề (chỗ tự nhiên nhất để cầm thẻ) là pager trôi sang cột trước; thẻ cuối
 * màn thì cột tự cuộn xuống dưới ngón tay — thả vào sai cột/sai khe. Kéo về phía mép vẫn cuộn như cũ.
 */
export function armedStep(step: number, travelled: number, arm: number): number {
  if (step < 0) return travelled <= -arm ? step : 0;
  if (step > 0) return travelled >= arm ? step : 0;
  return 0;
}
