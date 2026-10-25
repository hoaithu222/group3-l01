import type { AccountNotifyMode, WorkspaceNotifyMode } from '@/core/notifications';

/**
 * Lựa chọn chế độ thông báo trung tính — MỘT bộ chữ cho mọi nơi (tài khoản, nhóm làm việc, kênh, hội thoại). BE dùng
 * tên enum khác nhau theo từng nơi (p1-07 `be.md` §15.1): tài khoản/nhóm `ALL|MENTIONS_AND_THREADS|MUTED` (+`INHERIT`),
 * kênh `ALL_MESSAGES|MENTIONS_AND_THREADS|MUTED|INHERIT`, hội thoại `ALL|MENTIONS|MUTED|INHERIT`. Hàm ở đây là nơi
 * DUY NHẤT đổi qua lại — UI không biết tên enum của BE.
 */
export type NotifyChoice = 'ALL' | 'INHERIT' | 'MENTIONS' | 'MUTED';

export type ChannelNotifyMode = 'ALL_MESSAGES' | 'INHERIT' | 'MENTIONS_AND_THREADS' | 'MUTED';

export const NOTIFY_CHOICE_LABEL: Record<NotifyChoice, string> = {
  ALL: 'Mọi tin',
  INHERIT: 'Theo mặc định',
  MENTIONS: 'Chỉ nhắc tên & luồng',
  MUTED: 'Tắt tiếng',
};

/** Thời lượng tắt tiếng (chỉ hội thoại có `mutedUntil`). `hours: null` = tới khi bật lại. */
export const MUTE_DURATIONS = [
  { hours: 1, label: '1 giờ' },
  { hours: 8, label: '8 giờ' },
  { hours: 24, label: '24 giờ' },
  { hours: null, label: 'Cho tới khi bật lại' },
] as const;

/** ISO của thời điểm hết tắt tiếng, hoặc `null` (không hết hạn). */
export function mutedUntilFromHours(hours: number | null, now: Date = new Date()): string | null {
  return hours === null ? null : new Date(now.getTime() + hours * 3_600_000).toISOString();
}

/** Nhãn "Theo mặc định (Mọi tin)" — giá trị THỰC TẾ mà `INHERIT` sẽ kế thừa; chưa biết thì chỉ "Theo mặc định". */
export function inheritLabel(inherited: Exclude<NotifyChoice, 'INHERIT'> | undefined): string {
  return inherited
    ? `${NOTIFY_CHOICE_LABEL.INHERIT} (${NOTIFY_CHOICE_LABEL[inherited]})`
    : NOTIFY_CHOICE_LABEL.INHERIT;
}

// ── tài khoản / nhóm làm việc ──────────────────────────────────────────────

export function choiceFromAccountMode(mode: AccountNotifyMode | WorkspaceNotifyMode): NotifyChoice {
  return mode === 'MENTIONS_AND_THREADS' ? 'MENTIONS' : mode;
}

export function accountModeFromChoice(choice: NotifyChoice): WorkspaceNotifyMode {
  return choice === 'MENTIONS' ? 'MENTIONS_AND_THREADS' : choice;
}

// ── kênh ───────────────────────────────────────────────────────────────────

export function choiceFromChannelMode(mode: ChannelNotifyMode): NotifyChoice {
  if (mode === 'ALL_MESSAGES') return 'ALL';
  if (mode === 'MENTIONS_AND_THREADS') return 'MENTIONS';
  return mode;
}

export function channelModeFromChoice(choice: NotifyChoice): ChannelNotifyMode {
  if (choice === 'ALL') return 'ALL_MESSAGES';
  if (choice === 'MENTIONS') return 'MENTIONS_AND_THREADS';
  return choice;
}

/** Giá trị hiệu lực (đã kế thừa) là gì thì `INHERIT` hiện "Theo mặc định (…)" — không bao giờ là `INHERIT`. */
export function effectiveChoice(mode: AccountNotifyMode): Exclude<NotifyChoice, 'INHERIT'> {
  return choiceFromAccountMode(mode) as Exclude<NotifyChoice, 'INHERIT'>;
}
