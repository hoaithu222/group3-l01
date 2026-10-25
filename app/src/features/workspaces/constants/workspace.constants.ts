import type { SelectOption } from '@/shared/ui/select';

import type { NotifyMode } from '../api';

/** `NotifyMode` 4 lựa chọn (app.md p1-01 §3) — `INHERIT` hiện là "Theo tài khoản". */
export const NOTIFY_OPTIONS: (SelectOption & { value: NotifyMode })[] = [
  { label: 'Theo tài khoản', value: 'INHERIT' },
  { label: 'Mọi tin nhắn', value: 'ALL_MESSAGES' },
  { label: 'Chỉ nhắc tên và luồng theo dõi', value: 'MENTIONS_AND_THREADS' },
  { label: 'Tắt thông báo', value: 'MUTED' },
];

/**
 * "Nhóm mới" của `OnboardingChecklist` (app.md p1-01 §3: "nhóm mới, OWNER/ADMIN")
 * — đặc tả không chốt con số, BE cũng không trả cờ `isNew`. Chọn 14 ngày kể từ
 * `createdAt`: đủ để quản trị viên vừa tạo nhóm làm xong ba việc đầu, đủ ngắn để
 * nhóm cũ được người khác quản trị hộ không bị nhắc "bắt đầu" mãi.
 */
export const NEW_WORKSPACE_DAYS = 14;
