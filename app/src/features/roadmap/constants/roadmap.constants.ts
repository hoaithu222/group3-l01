import { Platform } from 'react-native';

import type { BadgeVariant } from '@/shared/ui/badge';
import { ICON_NAMES, type IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { RoadmapProgressStatus, RoadmapResourceKind } from '../api/roadmap.types';

/** Gom tick checklist/tự đánh giá/ghi chú trước khi bắn `PUT progress` (README §4 luồng 4, app.md §2). */
export const PROGRESS_DEBOUNCE_MS = 800;

/**
 * Họ font đơn cách cho code (khối ``` và `code` trong dòng) — đặt qua `style` vì prop font của RN nhận TÊN họ font,
 * còn `font-mono` của Tailwind ra "ui-monospace, …" mà Android không có (xem `Spans.tsx`).
 */
export const MONO_FONT = Platform.select({ android: 'monospace', default: 'Menlo' });

/** Thứ học trong tuần — `1` Thứ 2 … `7` Chủ nhật (be.md §2 `RoadmapSubject.defaultStudyDays`). */
export const ROADMAP_WEEKDAYS: readonly { value: number; short: string; label: string }[] = [
  { value: 1, short: 'T2', label: 'Thứ 2' },
  { value: 2, short: 'T3', label: 'Thứ 3' },
  { value: 3, short: 'T4', label: 'Thứ 4' },
  { value: 4, short: 'T5', label: 'Thứ 5' },
  { value: 5, short: 'T6', label: 'Thứ 6' },
  { value: 6, short: 'T7', label: 'Thứ 7' },
  { value: 7, short: 'CN', label: 'Chủ nhật' },
];

/** Loại tài liệu → icon + tông ô icon (chỉ để quét nhanh theo loại — chữ tiêu đề vẫn nói đủ nghĩa). */
export const RESOURCE_KIND_META: Record<RoadmapResourceKind, { icon: IconName; label: string; tone: IconTileTone }> = {
  LINK: { icon: 'link', label: 'Liên kết', tone: 'info' },
  // ⛔ Không `danger` dù nút phát thường đỏ: `IconTile` dành tông đó cho phá huỷ/cảnh báo.
  VIDEO: { icon: 'play', label: 'Video', tone: 'warning' },
  TOOL: { icon: 'wrench-01', label: 'Công cụ', tone: 'accent' },
  FILE: { icon: 'document', label: 'Tệp', tone: 'brand' },
  NOTE: { icon: 'edit', label: 'Ghi chú', tone: 'success' },
};

/**
 * Trạng thái MỘT buổi — `label` là chữ đọc cho trình đọc màn hình và huy hiệu ở đầu buổi học; `badge` là tông `Badge`
 * (⚠️ `Badge` gọi tông lỗi là `error`, `IconTile` gọi là `danger` — hai bảng tên khác nhau, xem ui-components.md §3).
 */
export const PROGRESS_STATUS_META: Record<
  RoadmapProgressStatus,
  { badge: BadgeVariant; icon: IconName; label: string; tone: IconTileTone }
> = {
  NOT_STARTED: { badge: 'neutral', icon: 'calendar', label: 'Chưa học', tone: 'neutral' },
  IN_PROGRESS: { badge: 'warning', icon: 'clock', label: 'Đang học', tone: 'warning' },
  COMPLETED: { badge: 'success', icon: 'checkmark-circle', label: 'Đã xong', tone: 'success' },
  SKIPPED: { badge: 'neutral', icon: 'arrow-right-2', label: 'Đã bỏ qua', tone: 'neutral' },
};

/** 😕 🤔 😊 — bảng tự đánh giá sẵn có trong giáo trình (README §2 tham chiếu Khan Academy). */
export const SELF_RATING_OPTIONS: readonly { value: 1 | 2 | 3; emoji: string; label: string }[] = [
  { value: 1, emoji: '😕', label: 'Chưa hiểu' },
  { value: 2, emoji: '🤔', label: 'Hiểu một phần' },
  { value: 3, emoji: '😊', label: 'Tự tin' },
];

/**
 * Tên màu (`phase.color` / `subject.color`) → tông token GẦN NHẤT — README §7.6 "Màu tháng lấy từ `phase.color`… ánh
 * xạ về token gần nhất, không dùng mã màu thô".
 *
 * ✅ Định dạng đã ổn định: cả hai script import (`fullstack-import.ts`, `english-content.ts`) ghi TÊN MÀU kiểu
 * Tailwind ("blue", "amber", "teal"…). Tên lạ/mã hex/rỗng ⇒ `undefined`, nơi gọi tự rơi về bảng xoay vòng.
 * ⚠️ Gần theo SẮC ĐỘ của token thật: `action-accent` #B18535 (vàng nâu, hue ~38°) mới gần "amber" (#F59E0B, ~38°);
 * `warning` #D35801 (hue ~25°) là CAM. Bản trước ánh xạ ngược hai tông này.
 */
const COLOR_NAME_TONES: Readonly<Record<string, IconTileTone>> = {
  amber: 'accent',
  blue: 'info',
  brown: 'accent',
  cyan: 'success',
  emerald: 'success',
  fuchsia: 'brand',
  gold: 'accent',
  green: 'success',
  indigo: 'info',
  lime: 'success',
  orange: 'warning',
  pink: 'brand',
  purple: 'brand',
  red: 'danger',
  rose: 'danger',
  sky: 'info',
  teal: 'success',
  violet: 'brand',
  yellow: 'accent',
};

export function toneFromColorName(color: string | null | undefined): IconTileTone | undefined {
  return color ? COLOR_NAME_TONES[color.trim().toLowerCase()] : undefined;
}

/**
 * Bảng dự phòng khi `phase.color` trống/lạ — xoay vòng theo `phase.index` (1-based, LUÔN có), đúng thứ tự của
 * `ROADMAP-DIAGRAM.html` (T1 xanh dương…T7 cam). `success` lặp ở T3/T5 vì bộ token chỉ có 7 tông ngữ nghĩa trong khi
 * bản gốc có cả "xanh ngọc" lẫn "lục" — chấp nhận theo đúng chữ "gần nhất", không phải ánh xạ 1-1.
 */
const PHASE_TONES: readonly IconTileTone[] = [
  'info', // T1 xanh dương
  'accent', // T2 hổ phách
  'success', // T3 xanh ngọc
  'brand', // T4 tím — trùng màu thương hiệu hiện tại
  'success', // T5 lục
  'danger', // T6 đỏ
  'warning', // T7 cam
];

export function phaseTone(phase: { color: string | null; index: number }): IconTileTone {
  const named = toneFromColorName(phase.color);
  if (named) return named;
  const safeIndex = Number.isFinite(phase.index) && phase.index > 0 ? phase.index - 1 : 0;
  return PHASE_TONES[safeIndex % PHASE_TONES.length] ?? 'brand';
}

/**
 * Tên icon trong `subject.icon`/`subject.category` (dữ liệu tự do của BE, vd "code", "languages") → icon CÓ THẬT trong
 * bộ BIDV. ⛔ Không đưa thẳng chuỗi BE vào `<Icon name>`: tên lạ không có trong `IconName` thì `Icon` vẽ ô trống.
 */
const SUBJECT_ICON_ALIASES: Readonly<Record<string, IconName>> = {
  code: 'lap',
  english: 'language-skill',
  language: 'language-skill',
  languages: 'language-skill',
  programming: 'lap',
};

const KNOWN_ICONS: ReadonlySet<string> = new Set<string>(ICON_NAMES);

function isIconName(value: string): value is IconName {
  return KNOWN_ICONS.has(value);
}

/** Icon đại diện cho môn: `icon` hợp lệ → bí danh của `icon`/`category` → `navigation-map` (bản đồ lộ trình). */
export function subjectIcon(subject: { category: string; icon: string | null }): IconName {
  for (const key of [subject.icon, subject.category]) {
    if (!key) continue;
    if (isIconName(key)) return key;
    const alias = SUBJECT_ICON_ALIASES[key.trim().toLowerCase()];
    if (alias) return alias;
  }
  return 'navigation-map';
}
