import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import type { PresenceDotState } from '@/shared/ui/presence-dot';
import { formatDateTime, formatTime } from '@/shared/utils/format/date.utils';

import type { FileHit, SearchScopeInfo } from '../api';

/** Tên nơi chứa tin/tệp: kênh → `#tên`; nhóm chat/1-1 → tên (1-1: tên đối phương; `null` khi không tra được). */
export function scopeLabel(scope: SearchScopeInfo): string {
  if (scope.type === 'CHANNEL') return scope.name ? `#${scope.name}` : 'Kênh';
  return scope.name ?? 'Tin nhắn riêng';
}

/** Dung lượng dễ đọc (dấu phẩy thập phân) — bản DUY NHẤT ở `shared/utils/format`; giữ export cũ để nơi gọi/test không đổi. */
export { formatFileSize } from '@/shared/utils/format/file-size.utils';

/** Loại tệp → icon · nhãn · TÔNG ô icon (mỗi loại một màu để mắt tách ảnh/video/âm thanh/tài liệu trước khi đọc tên). */
interface FileKindView {
  icon: IconName;
  label: string;
  tone: IconTileTone;
}

const FILE_KIND: Record<string, FileKindView> = {
  IMAGE: { icon: 'image', label: 'Ảnh', tone: 'accent' },
  VIDEO: { icon: 'play', label: 'Video', tone: 'warning' },
  AUDIO: { icon: 'audio', label: 'Âm thanh', tone: 'success' },
  VOICE: { icon: 'mic-01', label: 'Tin nhắn thoại', tone: 'success' },
};

/** Icon + nhãn + tông loại tệp: `kind` của tệp tin (`IMAGE`…) hoặc MIME khi là tệp kho tài liệu (`PDF`, `DOC`…). */
export function describeFileKind(hit: Pick<FileHit, 'kind' | 'mime'>): FileKindView {
  const byKind = FILE_KIND[hit.kind.toUpperCase()];
  if (byKind) return byKind;
  const family = hit.mime.split('/')[0]?.toUpperCase() ?? '';
  const byMime = FILE_KIND[family];
  if (byMime) return byMime;
  const kind = hit.kind.toUpperCase();
  return { icon: 'file-2', label: kind && kind !== 'FILE' ? kind : 'Tệp', tone: 'info' };
}

/**
 * Icon + tông ô icon theo LOẠI kênh — CÙNG bảng với danh sách kênh (chat `info`, thoại `success`, pomodoro `warning`) để một
 * kênh trông như nhau ở danh sách lẫn kết quả tìm. Khai lại ở đây vì ⛔ không import chéo feature `channels`.
 */
const CHANNEL_TYPE_ART: Record<string, { icon: IconName; tone: IconTileTone }> = {
  POMODORO: { icon: 'timer', tone: 'warning' },
  TEXT: { icon: 'chat-bubble', tone: 'info' },
  VOICE: { icon: 'mic-01', tone: 'success' },
};

/** Loại lạ (BE thêm loại mới trước khi app cập nhật) ⇒ vẽ như kênh chữ thay vì một ô trống. */
export function channelTypeArt(type: string): { icon: IconName; tone: IconTileTone } {
  return CHANNEL_TYPE_ART[type] ?? { icon: 'chat-bubble', tone: 'info' };
}

export const PERSON_ROLE_LABEL: Record<string, string> = {
  OWNER: 'Chủ nhóm',
  ADMIN: 'Quản trị viên',
  MEMBER: 'Thành viên',
  GUEST: 'Khách',
};

/** `presence` của BE là chuỗi tự do: `AWAY` (nếu có) đọc như `IDLE`, giá trị lạ như `OFFLINE`. */
export function toPresenceState(value: string): PresenceDotState {
  switch (value) {
    case 'ONLINE':
    case 'DND':
    case 'HIDDEN':
    case 'OFFLINE':
    case 'IDLE':
      return value;
    case 'AWAY':
      return 'IDLE';
    default:
      return 'OFFLINE';
  }
}

export const MEETING_STATUS_LABEL: Record<string, string> = {
  CANCELLED: 'Đã huỷ',
  ENDED: 'Đã kết thúc',
  LIVE: 'Đang diễn ra',
  SCHEDULED: 'Sắp tới',
};

/** `25/09/2026 09:00 – 10:00` theo GIỜ MÁY (BE trả ISO UTC). */
export function formatMeetingRange(startAt: string, endAt: string): string {
  const start = formatDateTime(startAt);
  const end = formatTime(endAt);
  return end ? `${start} – ${end}` : start;
}

export const CHANNEL_TYPE_LABEL: Record<string, string> = {
  POMODORO: 'Kênh Pomodoro',
  TEXT: 'Kênh chữ',
  VOICE: 'Kênh thoại',
};

/** Số kết quả đã biết của một tab: `12` khi hết, `30+` khi còn trang sau (BE không đếm chính xác). */
export function formatCount(count: number, hasMore: boolean): string {
  return hasMore ? `${count}+` : String(count);
}
