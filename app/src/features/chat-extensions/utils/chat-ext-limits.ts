/**
 * Giới hạn hiệu lực của khảo sát/tin hẹn giờ/nhắc lại — đọc từ `capabilities.limits.{poll,scheduledMessage,reminder}` (BE trộn `LIMITS` với `SystemConfig`, admin chỉ HẠ được).
 * `CapabilityLimits` là `Record<string, unknown>` (chủ ý, xem `capabilities.types.ts`) nên ép kiểu Ở ĐÂY, từng số một, có giá trị mặc định: BE cũ (trước p7-04) chưa trả các nhóm
 * này thì app vẫn có giới hạn hợp lý thay vì `undefined`. Mặc định CHÉP theo `be/src/core/constants/limits.ts` — chỉ là đường lui, nguồn thật vẫn là capabilities.
 */
export interface ChatExtLimits {
  poll: {
    optionsMin: number;
    optionsMax: number;
    questionMax: number;
    optionMax: number;
    closesInMaxDays: number;
    closeMinLeadSeconds: number;
    votersPageMax: number;
  };
  scheduled: { pendingPerUserMax: number; sendAtMaxDays: number; minLeadSeconds: number };
  reminder: { pendingPerUserMax: number; remindAtMaxDays: number; minLeadSeconds: number };
  /** `limits.task.titleMax` — tiêu đề thẻ khi chuyển tin thành công việc. */
  task: { titleMax: number };
}

export const DEFAULT_CHAT_EXT_LIMITS: ChatExtLimits = {
  poll: {
    optionsMin: 2,
    optionsMax: 10,
    questionMax: 300,
    optionMax: 100,
    closesInMaxDays: 30,
    closeMinLeadSeconds: 60,
    votersPageMax: 100,
  },
  scheduled: { pendingPerUserMax: 50, sendAtMaxDays: 30, minLeadSeconds: 60 },
  reminder: { pendingPerUserMax: 100, remindAtMaxDays: 365, minLeadSeconds: 60 },
  task: { titleMax: 200 },
};

/** Chỉ nhận số hữu hạn dương — giá trị hỏng trong cấu hình không được làm sai giới hạn. */
function pick<T extends object>(defaults: T, source: unknown): T {
  if (typeof source !== 'object' || source === null) return defaults;
  const record = source as Record<string, unknown>;
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = record[key as string];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[key] = value as T[keyof T];
  }
  return out;
}

export function readChatExtLimits(limits: Record<string, unknown> | undefined): ChatExtLimits {
  return {
    poll: pick(DEFAULT_CHAT_EXT_LIMITS.poll, limits?.poll),
    scheduled: pick(DEFAULT_CHAT_EXT_LIMITS.scheduled, limits?.scheduledMessage),
    reminder: pick(DEFAULT_CHAT_EXT_LIMITS.reminder, limits?.reminder),
    task: pick(DEFAULT_CHAT_EXT_LIMITS.task, limits?.task),
  };
}
