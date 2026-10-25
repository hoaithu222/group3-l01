/**
 * Dòng xem trước của tin `CALL_SUMMARY` (danh sách hội thoại) THEO GÓC NHÌN người xem — ai gọi, kết quả ra sao.
 * Tự đủ (không import `features/calls`, cùng lý do các slot ở `@/shared/calls`); nhãn khớp `outcomeLabel` của thẻ trong chat.
 */
function durationText(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return minutes > 0 ? `${String(hours)} giờ ${String(minutes)} phút` : `${String(hours)} giờ`;
  if (minutes > 0) return rest > 0 ? `${String(minutes)} phút ${String(rest)} giây` : `${String(minutes)} phút`;
  return `${String(rest)} giây`;
}

export function callSummaryPreview(payload: Record<string, unknown> | null | undefined, currentUserId: string | undefined): string {
  const p = payload ?? {};
  const kind = p.mediaKind === 'VIDEO' ? 'video' : 'thoại';
  const outgoing = typeof p.initiatorId === 'string' && p.initiatorId === currentUserId;
  const status = typeof p.status === 'string' ? p.status.toUpperCase() : '';
  switch (status) {
    case 'COMPLETED': {
      const duration = typeof p.durationSec === 'number' ? ` · ${durationText(p.durationSec)}` : '';
      return `${outgoing ? 'Cuộc gọi đi' : 'Cuộc gọi đến'} ${kind}${duration}`;
    }
    case 'NO_ANSWER':
      return outgoing ? `Cuộc gọi ${kind} đi · Không trả lời` : `Cuộc gọi ${kind} nhỡ`;
    case 'CANCELLED':
      return outgoing ? `Cuộc gọi ${kind} đi · Đã huỷ` : `Cuộc gọi ${kind} nhỡ`;
    case 'DECLINED':
      return outgoing ? `Cuộc gọi ${kind} đi · Bị từ chối` : `Cuộc gọi ${kind} · Bạn đã từ chối`;
    case 'BUSY':
      return outgoing ? `Cuộc gọi ${kind} đi · Người nhận đang bận` : `Cuộc gọi ${kind} nhỡ`;
    case 'MISSED':
      return outgoing ? `Cuộc gọi ${kind} đi · Không kết nối được` : `Cuộc gọi ${kind} nhỡ`;
    default:
      return `Cuộc gọi ${kind}`;
  }
}
