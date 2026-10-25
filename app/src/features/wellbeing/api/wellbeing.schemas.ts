import { z } from 'zod';

import {
  RULE_AGGREGATES,
  RULE_METRICS,
  WELLBEING_LEVELS,
  WELLBEING_SUGGESTIONS,
  ACK_ACTIONS,
  type WellbeingAlertPayload,
  type WellbeingHistory,
  type WellbeingSetting,
} from './wellbeing.types';

/**
 * Đọc phản hồi BE bằng schema — vì HAI lý do, đều về quyền riêng tư/độ đúng chứ không phải cho đẹp:
 *  · Zod mặc định CẮT trường lạ ⇒ `riskScore` và `points` của nhân tố (BE vẫn trả) KHÔNG lọt vào cache/UI (xem `wellbeing.types.ts`);
 *  · dữ liệu lệch hợp đồng (mức lạ, thiếu trường) thì bỏ phần hỏng thay vì hiện một mức sai — hiện "Thấp" khi thật ra không biết là kết luận
 *    trấn an giả, tệ hơn không hiện gì.
 * ⛔ KHÔNG log nội dung phản hồi (kể cả `issues`): đây là dữ liệu sức khoẻ của người dùng.
 */
const level = z.enum(WELLBEING_LEVELS);
const suggestion = z.enum(WELLBEING_SUGGESTIONS);

/** Mảng chịu lỗi từng phần tử: phần tử hỏng bị bỏ, không làm hỏng cả danh sách. */
function lenientList<T extends z.ZodType>(item: T) {
  return z.array(z.unknown()).transform((items) =>
    items.flatMap((raw) => {
      const parsed = item.safeParse(raw);
      return parsed.success ? [parsed.data as z.output<T>] : [];
    }),
  );
}

const factorSchema = z.object({
  aggregate: z.enum(RULE_AGGREGATES),
  days: z.number(),
  label: z.string(),
  metric: z.enum(RULE_METRICS),
  ruleId: z.string(),
  value: z.number(),
});

const assessmentSchema = z.object({
  ackAction: z.enum(ACK_ACTIONS).nullable().catch(null),
  alerted: z.boolean().catch(false),
  date: z.string().min(1),
  factors: lenientList(factorSchema),
  id: z.string().min(1),
  level,
  suggestion: suggestion.nullable().catch(null),
});

const dailySchema = z.object({
  activeMinutes: z.number(),
  date: z.string().min(1),
  eventsCount: z.number(),
  lateNightEvents: z.number(),
  lateNightMinutes: z.number(),
  longestContinuousMinutes: z.number(),
});

const settingSchema = z.object({
  alertsEnabled: z.boolean(),
  enabled: z.boolean(),
  latest: assessmentSchema.nullable().catch(null),
  optedInAt: z.string().nullable().catch(null),
  pendingAlert: z
    .object({ id: z.string().min(1), level, suggestion: suggestion.nullable().catch(null) })
    .nullable()
    .catch(null),
  preferredBreak: z
    .object({ breakMinutes: z.number(), workMinutes: z.number() })
    .nullable()
    .catch(null),
});

const historySchema = z.object({
  assessments: lenientList(assessmentSchema),
  dailies: lenientList(dailySchema),
  days: z.number(),
});

/** `v` phải là 1: bản mới của hợp đồng có thể đổi hình dạng — bỏ sự kiện lạ còn hơn hiện sai (`GET /me/wellbeing` vẫn là nguồn sự thật). */
const alertPayloadSchema = z.object({
  assessmentId: z.string().min(1),
  level: z.enum(['MEDIUM', 'HIGH']),
  suggestion: suggestion.nullable().catch(null),
  v: z.literal(1),
});

/** Lỗi hợp đồng: câu tiếng Việt, KHÔNG kèm dữ liệu nhận được. */
export class WellbeingContractError extends Error {
  constructor() {
    super('Dữ liệu nhận về không đúng định dạng. Vui lòng cập nhật ứng dụng hoặc thử lại.');
    this.name = 'WellbeingContractError';
  }
}

export function parseSetting(data: unknown): WellbeingSetting {
  const result = settingSchema.safeParse(data);
  if (!result.success) throw new WellbeingContractError();
  return result.data;
}

export function parseHistory(data: unknown): WellbeingHistory {
  const result = historySchema.safeParse(data);
  if (!result.success) throw new WellbeingContractError();
  return result.data;
}

/** Sự kiện socket → payload sạch, hoặc `null` (lạ/hỏng ⇒ bỏ qua, không ném). */
export function parseAlertPayload(data: unknown): WellbeingAlertPayload | null {
  const result = alertPayloadSchema.safeParse(data);
  if (!result.success) return null;
  const { assessmentId, level: alertLevel, suggestion: alertSuggestion } = result.data;
  return { assessmentId, level: alertLevel, suggestion: alertSuggestion };
}

/** P1 — `GET /me/wellbeing/shares` / `PUT .../shares/:workspaceId` trả `ShareDto`. */
const shareSchema = z.object({ workspaceId: z.string().min(1), name: z.string() });

/** Mảng chịu lỗi từng phần tử — một nhóm bị đổi tên/xoá giữa chừng không làm hỏng cả danh sách chia sẻ. */
export function parseShares(data: unknown): { workspaceId: string; name: string }[] {
  const result = lenientList(shareSchema).safeParse(data);
  return result.success ? result.data : [];
}

export function parseShare(data: unknown): { workspaceId: string; name: string } {
  const result = shareSchema.safeParse(data);
  if (!result.success) throw new WellbeingContractError();
  return result.data;
}

/** P1 — `GET /workspaces?status=ACTIVE` (khai lại độc lập, xem `MyWorkspace`) chỉ cần `id` + `name`; phần tử lạ/hỏng bị bỏ. */
const myWorkspaceSchema = z.object({ id: z.string().min(1), name: z.string() });

export function parseMyWorkspaces(data: unknown): { id: string; name: string }[] {
  const result = lenientList(myWorkspaceSchema).safeParse(data);
  return result.success ? result.data : [];
}
