import { formatDate } from '@/shared/utils/format/date.utils';

/**
 * Câu của thẻ tin hệ thống cố vấn trong nhóm chat (p6-03 be.md §5). Payload do SERVER ghi:
 *  · `MENTOR_JOINED` — `{ mentorId, endsAt }` (ISO, hạn đợt cố vấn);
 *  · `MENTOR_LEFT`   — `{ mentorId, reason: 'EXPIRED' | 'LEFT' | 'REMOVED' }`.
 * Không mang nội dung đơn ứng tuyển — thẻ chỉ nói "ai" và "tới khi nào/vì sao kết thúc".
 *
 * `name` là tên cố vấn do bộ tra của màn cha đưa vào (`messages` chỉ có userId). Không tra được (cố vấn đã rời nhóm chat ở
 * `MENTOR_LEFT`, danh bạ chưa tải) ⇒ câu KHÔNG tên chứ không bịa ra "Thành viên": vẫn đọc được và đúng.
 * `null` ⇒ không phải loại của mentor (nơi gọi không vẽ gì).
 *
 * Payload lạ/hỏng: `endsAt` không đọc được ⇒ bỏ mệnh đề "đến …"; `reason` lạ (BE thêm loại mới) ⇒ dùng câu chung "đã kết thúc".
 */
export function mentorSystemText(
  systemType: string | null,
  payload: Record<string, unknown> | null,
  name?: string,
): string | null {
  const p = payload ?? {};
  const who = name?.trim() ?? '';

  if (systemType === 'MENTOR_JOINED') {
    const subject = who ? `Cố vấn ${who}` : 'Cố vấn';
    const until = typeof p.endsAt === 'string' ? formatDate(p.endsAt) : '';
    return until ? `${subject} tham gia đến ${until}` : `${subject} đã tham gia`;
  }

  if (systemType === 'MENTOR_LEFT') {
    const engagement = who ? `Đợt cố vấn của ${who}` : 'Đợt cố vấn';
    switch (p.reason) {
      case 'EXPIRED':
        return `${engagement} đã hết hạn`;
      case 'LEFT':
        return who ? `Cố vấn ${who} đã rời nhóm` : 'Cố vấn đã rời nhóm';
      default:
        return `${engagement} đã kết thúc`;
    }
  }

  return null;
}
