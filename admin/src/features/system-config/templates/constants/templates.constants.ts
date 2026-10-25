import type {
  TemplateChannel,
  TemplateChannelType,
  TemplateChannelVisibility,
  TemplatePostingPolicy,
} from '../types/templates.types';

/** Giới hạn khớp BE (`workspace-templates.validators.ts`, `LIMITS.channel`, `LIMITS.workspaceTemplate`). */
export const TEMPLATE_NAME_MIN = 2;
export const TEMPLATE_NAME_MAX = 60;
export const TEMPLATE_DESCRIPTION_MAX = 300;
export const CHANNELS_MIN = 1;
export const CHANNELS_MAX = 15;
export const CHANNEL_KEY_MAX = 40;
export const CHANNEL_NAME_MIN = 2;
export const CHANNEL_NAME_MAX = 60;
export const CHANNEL_DESCRIPTION_MAX = 500;
/** `order` BE nhận 0–1000; thứ tự hiển thị = vị trí trong bảng, đánh số từ 1. */
export const ORDER_BASE = 1;

/** Khoá kênh: a-z, 0-9, gạch ngang. */
export const CHANNEL_KEY_PATTERN = /^[a-z0-9-]{1,40}$/;

/** Kênh mặc định luôn tự tạo cùng nhóm — mẫu không được khai lại (so khớp sau `normalizeSearch`). */
export const RESERVED_CHANNEL_NAME = 'chung';

export const TEMPLATE_CONFIG_TAB = 'templates';

/** Cờ `capabilities.features` quyết định loại kênh nào được chọn mới. */
export const CHANNEL_TYPE_FLAG: Readonly<Record<Exclude<TemplateChannelType, 'TEXT'>, string>> = {
  VOICE: 'voice',
  POMODORO: 'pomodoro',
};

export const CHANNEL_TYPE_LABELS: Readonly<Record<TemplateChannelType, string>> = {
  TEXT: 'Văn bản',
  VOICE: 'Thoại',
  POMODORO: 'Pomodoro',
};

export const CHANNEL_VISIBILITY_LABELS: Readonly<Record<TemplateChannelVisibility, string>> = {
  PUBLIC: 'Công khai',
  PRIVATE: 'Riêng tư',
};

export const POSTING_POLICY_LABELS: Readonly<Record<TemplatePostingPolicy, string>> = {
  MEMBERS: 'Mọi thành viên',
  ADMINS_ONLY: 'Chỉ quản trị',
};

export const VISIBILITY_OPTIONS = (
  Object.keys(CHANNEL_VISIBILITY_LABELS) as TemplateChannelVisibility[]
).map((value) => ({ value, label: CHANNEL_VISIBILITY_LABELS[value] }));

export const POSTING_POLICY_OPTIONS = (
  Object.keys(POSTING_POLICY_LABELS) as TemplatePostingPolicy[]
).map((value) => ({ value, label: POSTING_POLICY_LABELS[value] }));

/** Hàng kênh mới khi bấm "Thêm kênh" — key/tên để trống cho người dùng nhập. */
export const NEW_CHANNEL: TemplateChannel = {
  key: '',
  name: '',
  description: '',
  type: 'TEXT',
  visibility: 'PUBLIC',
  postingPolicy: 'MEMBERS',
  defaultSelected: true,
};
