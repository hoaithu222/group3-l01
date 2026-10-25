/** Đếm ngược tới giờ bắt đầu bằng CHỮ (phòng chờ chủ trì) — hàm thuần, nơi gọi truyền `ms` còn lại theo giờ server. */
export function formatCountdown(remainingMs: number): string {
  const total = Number.isFinite(remainingMs) ? Math.ceil(remainingMs / 1000) : 0;
  if (total <= 0) return 'Sắp bắt đầu';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `Còn ${hours} giờ ${minutes} phút`;
  return minutes > 0 ? `Còn ${minutes} phút ${total % 60} giây` : `Còn ${total} giây`;
}
