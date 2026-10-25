import type { LockScreenLevel, PushPermissionState } from '@/core/notifications';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/**
 * Chuỗi hiển thị của màn "Thông báo" và "Thiết bị nhận thông báo" (p0-06 `app.md` §3).
 * Gom một chỗ để đổi câu chữ không phải lục qua JSX.
 */

export const PERMISSION_STATUS_LABEL: Record<PushPermissionState, string> = {
  denied: 'Đang tắt',
  granted: 'Đang bật',
  undetermined: 'Chưa bật',
};

/** Mô tả dưới trạng thái quyền. `denied` nói RÕ nguyên nhân và lối thoát — không hộp thoại lặp (PUSH-11). */
export const PERMISSION_DESCRIPTION: Record<PushPermissionState, string> = {
  denied:
    'Đang tắt trong Cài đặt hệ thống. Bạn vẫn nhận tin khi đang mở ứng dụng; bật lại trong Cài đặt để nhận cả khi không mở.',
  granted: 'Bạn sẽ nhận thông báo cả khi không mở ứng dụng.',
  undetermined: 'Bật để nhận thông báo khi có người nhắc tên bạn, kể cả khi không mở ứng dụng.',
};

/**
 * Trình bày thẻ trạng thái quyền (đầu màn Thông báo): icon + tông theo trạng thái. Tông là NGHĨA chứ không phải màu
 * trang trí — bật = `success`, bị chặn ở hệ điều hành = `danger`, chưa hỏi = `warning` (cần người dùng làm gì đó).
 * Icon khác nhau theo trạng thái để màu KHÔNG là dấu hiệu duy nhất (`noti-off` chuông gạch chéo · `noti-new` chuông có
 * chấm "còn việc" · `notification` chuông thường).
 */
export const PERMISSION_APPEARANCE: Record<
  PushPermissionState,
  { badge: 'error' | 'success' | 'warning'; icon: IconName; tone: IconTileTone }
> = {
  denied: { badge: 'error', icon: 'noti-off', tone: 'danger' },
  granted: { badge: 'success', icon: 'notification', tone: 'success' },
  undetermined: { badge: 'warning', icon: 'noti-new', tone: 'warning' },
};

export const IOS_PUSH_PENDING_NOTICE =
  'Thông báo đẩy trên iPhone đang được hoàn thiện — bạn vẫn nhận tin khi đang mở ứng dụng.';

/** Ba mức xem trước trên màn hình khoá — mỗi mức có icon + một câu nói RÕ người khác nhìn thấy gì (thẻ chọn, không phải Radio trơn). */
export const LOCK_SCREEN_OPTIONS: {
  description: string;
  icon: IconName;
  label: string;
  value: LockScreenLevel;
}[] = [
  {
    description: 'Chỉ báo có tin mới, không lộ người gửi hay nội dung.',
    icon: 'hide',
    label: 'Ẩn nội dung',
    value: 'HIDDEN',
  },
  {
    description: 'Hiện tên người gửi, ẩn nội dung tin nhắn.',
    icon: 'user',
    label: 'Chỉ hiện tên người gửi',
    value: 'SENDER',
  },
  {
    description: 'Hiện cả tên người gửi và đoạn đầu tin nhắn.',
    icon: 'view',
    label: 'Xem trước nội dung',
    value: 'FULL',
  },
];

export const LOCK_SCREEN_RISK_NOTE =
  'Nếu chọn "Xem trước nội dung", người khác nhìn thấy đoạn đầu tin nhắn khi máy đang khoá. Với kênh riêng tư, ứng dụng vẫn chỉ hiện tên người gửi.';

export const DND_IDLE_HINT = 'Tạm dừng thông báo đẩy trong một khoảng thời gian. Tin vẫn vào Hoạt động.';

export const DND_ACTIVE_HINT = 'Trong thời gian này bạn không nhận thông báo đẩy. Tin vẫn vào Hoạt động.';

export const DND_OPTIONS = [
  { duration: 'one-hour', label: 'Trong 1 giờ' },
  { duration: 'eight-hours', label: 'Trong 8 giờ' },
  { duration: 'until-morning', label: 'Đến sáng mai' },
] as const;

export const DEVICES_EMPTY_TITLE = 'Chưa có thiết bị nào nhận thông báo';
export const DEVICES_REMOVE_DIALOG_TITLE = 'Gỡ thiết bị này?';
export const DEVICES_REMOVE_DIALOG_DESCRIPTION =
  'Thiết bị sẽ ngừng nhận thông báo đẩy của tài khoản này. Bạn có thể bật lại bằng cách mở ứng dụng trên thiết bị đó.';

export function devicePlatformLabel(platform: 'ANDROID' | 'IOS' | 'WEB'): string {
  if (platform === 'ANDROID') return 'Android';
  if (platform === 'IOS') return 'iPhone / iPad';
  return 'Trình duyệt web';
}

// ── p1-07: chế độ thông báo theo loại cuộc trò chuyện (cấp tài khoản) ─────────────────────────────

/** Ba loại cuộc trò chuyện có chế độ riêng ở cấp tài khoản (`directMode`/`groupMode`/`channelMode`). */
export type ConversationModeField = 'channelMode' | 'directMode' | 'groupMode';

const ALL = { label: 'Mọi tin', value: 'ALL' } as const;
const MUTED = { label: 'Tắt', value: 'MUTED' } as const;

/** Tin 1-1 chỉ có Mọi tin / Tắt (không có "nhắc tên" — mọi tin 1-1 đều là tin gửi riêng cho mình). */
export const CONVERSATION_MODE_GROUPS: {
  field: ConversationModeField;
  icon: IconName;
  options: readonly { label: string; value: 'ALL' | 'MENTIONS_AND_THREADS' | 'MUTED' }[];
  title: string;
  tone: IconTileTone;
}[] = [
  { field: 'directMode', icon: 'direct', options: [ALL, MUTED], title: 'Tin nhắn 1-1', tone: 'info' },
  {
    field: 'groupMode',
    icon: 'add-team',
    options: [ALL, { label: 'Chỉ nhắc tên', value: 'MENTIONS_AND_THREADS' }, MUTED],
    title: 'Nhóm chat',
    tone: 'success',
  },
  {
    field: 'channelMode',
    icon: 'chat-bubble',
    options: [ALL, { label: 'Chỉ nhắc tên & luồng', value: 'MENTIONS_AND_THREADS' }, MUTED],
    title: 'Kênh',
    tone: 'accent',
  },
];

export const MODES_INTRO =
  'Đặt mặc định cho từng loại cuộc trò chuyện. Mỗi nhóm làm việc, kênh hay cuộc trò chuyện vẫn có thể đặt riêng.';
export const MODES_MUTED_NOTE =
  'Tắt tiếng chỉ dừng thông báo đẩy — mục nhắc đến bạn vẫn nằm trong Hoạt động.';
export const DEFAULT_TAG = 'Mặc định';
