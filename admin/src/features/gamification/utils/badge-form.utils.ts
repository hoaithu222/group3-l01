/** Chuyển đổi giữa `criteria` BE và giá trị form huy hiệu (`BadgeFormModal`), và tóm tắt điều kiện cho bảng/ngăn kéo. */
import { formatNumber } from '@/shared/utils/format';

import { BADGE_ICON_CURRENT_NAME } from '../constants/badge-icon.constants';
import { COUNTER_LABELS } from '../constants/gamification.labels';
import type { BadgeFormValues } from '../schemas/badge.schema';
import type { AdminBadge, CreateBadgePayload, PatchBadgePayload } from '../types/gamification.types';

/** Một mệnh đề điều kiện trong form (`op` gửi BE luôn `gte`). */
type Clause = BadgeFormValues['clauses'][number];

/** Đọc `criteria.all`/`criteria.any` của BE (`{ counter, op: 'gte', value }`) — dạng lạ thì trả rỗng. */
export function clausesOf(criteria: unknown, group: 'all' | 'any'): Clause[] {
  const list = (criteria as Partial<Record<'all' | 'any', unknown>> | null)?.[group];
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => c as { counter?: unknown; value?: unknown })
    .filter((c) => typeof c.counter === 'string' && typeof c.value === 'number')
    .map((c) => ({ counter: c.counter as string, value: c.value as number }));
}

export const initValues = (b: AdminBadge | null): BadgeFormValues =>
  b
    ? {
        code: b.code,
        name: b.name,
        description: b.description,
        emoji: b.emoji ?? '',
        // `url` = id asset (xem `badge.schema.ts`); `size: 0` vì BE không trả kích thước/tên tệp gốc.
        icon: b.iconAssetId
          ? { id: b.iconAssetId, name: BADGE_ICON_CURRENT_NAME, url: b.iconAssetId, size: 0 }
          : null,
        rarity: b.rarity,
        order: b.order,
        clauses: clausesOf(b.criteria, 'all'),
        anyClauses: clausesOf(b.criteria, 'any'),
        reason: '',
      }
    : {
        code: '',
        name: '',
        description: '',
        emoji: '',
        icon: null,
        rarity: 'COMMON',
        order: 0,
        clauses: [{ counter: 'tasksDone', value: 1 }],
        anyClauses: [],
        reason: '',
      };

const toBe = (list: Clause[]) =>
  list.map((c) => ({ counter: c.counter, op: 'gte' as const, value: c.value }));

/** `criteria` gửi BE: `all` bắt buộc, `any` chỉ khi có mệnh đề. */
export const toCriteria = (all: Clause[], any: Clause[]) => ({
  all: toBe(all),
  ...(any.length > 0 && { any: toBe(any) }),
});

/** `POST /admin/badges` — `emoji`/`iconAssetId` chỉ gửi khi có (BE: thiếu = không có). */
export const toCreatePayload = (data: BadgeFormValues): CreateBadgePayload => ({
  code: data.code,
  name: data.name,
  description: data.description,
  ...(data.emoji && { emoji: data.emoji }),
  ...(data.icon && { iconAssetId: data.icon.url }),
  rarity: data.rarity,
  order: data.order,
  criteria: toCriteria(data.clauses, data.anyClauses),
  reason: data.reason,
});

/**
 * `PATCH /admin/badges/:id` — `iconAssetId: null` GỠ ảnh; gửi lại đúng ảnh đang dùng = BE coi không đổi (không kiểm lại),
 * ảnh mới phải READY, scope BADGE, do CHÍNH người đang lưu tải lên và chưa gắn nơi khác (`ASSET_001…005`).
 */
export const toPatchPayload = (badge: AdminBadge, data: BadgeFormValues): PatchBadgePayload => ({
  id: badge.id,
  expectedVersion: badge.version,
  reason: data.reason,
  name: data.name,
  description: data.description,
  emoji: data.emoji || null,
  iconAssetId: data.icon?.url ?? null,
  rarity: data.rarity,
  order: data.order,
  criteria: toCriteria(data.clauses, data.anyClauses),
});

const clauseText = (c: Clause): string => `${COUNTER_LABELS[c.counter] ?? c.counter} ≥ ${formatNumber(c.value)}`;

/**
 * Tóm tắt điều kiện cho người đọc: "Task hoàn thành ≥ 50"; nhiều mệnh đề nối "và"; nhóm "Một trong" thêm
 * "; một trong: A ≥ 1 hoặc B ≥ 2". Dạng lạ/rỗng → "—" (không ném lỗi — `criteria` do BE trả, kiểu `unknown`).
 */
export function summarizeCriteria(criteria: unknown): string {
  const all = clausesOf(criteria, 'all').map(clauseText);
  const any = clausesOf(criteria, 'any').map(clauseText);
  const parts = [all.join(' và '), any.length > 0 ? `một trong: ${any.join(' hoặc ')}` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : '—';
}
