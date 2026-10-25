/**
 * "3 phút 20 giây" / "45 giây" / "1 giờ 40 phút" — thời lượng ước tính của phiên ở màn tạo phòng. Chỉ giữ hai đơn vị lớn nhất
 * (hiện "1 giờ 40 phút 5 giây" là thừa). Không dùng `Intl`: Hermes cắt ICU, hai máy hiện hai kiểu (xem `currency.utils.ts`).
 */
export function formatQuizDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [
    hours > 0 ? `${String(hours)} giờ` : '',
    minutes > 0 ? `${String(minutes)} phút` : '',
    seconds > 0 ? `${String(seconds)} giây` : '',
  ].filter((part) => part !== '');
  return parts.slice(0, 2).join(' ') || '0 giây';
}
