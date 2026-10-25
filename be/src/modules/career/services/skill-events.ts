import type { OutboxEventInput } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { DOMAIN_EVENTS, eventKeys, type SkillBadgeEventPayload } from "../../../shared/events/domain-events";
import type { SkillDefinition } from "../entities/skill.interface";

/**
 * Sự kiện RA của huy hiệu kỹ năng (`skill.unlocked|revoked|restored`) — MỘT processor `gamification/skill.events` (mỗi cặp queue/jobName chỉ
 * một processor) phát socket `skill:unlocked` rồi chuyển cho các SINK đã đăng ký: p6-07 (snapshot portfolio), p6-08 (index nhà tuyển dụng)
 * gọi `registerSkillEventSink` (qua `career/public.ts`) thay vì đòi thêm hàng outbox. Sink PHẢI idempotent theo `(userId, skillId, event, at)`.
 */
export const SKILL_EVENTS_QUEUE = "gamification" as const;
export const SKILL_EVENTS_JOB = "skill.events" as const;

type SkillEventName = SkillBadgeEventPayload["event"];

export function skillEventRow(event: SkillEventName, userId: string, skill: Pick<SkillDefinition, "id" | "code" | "name" | "icon">, at: Date): OutboxEventInput {
  const payload: SkillBadgeEventPayload = { event, userId, skillId: skill.id, code: skill.code, name: skill.name, icon: skill.icon, at: at.toISOString() };
  const dedupeKey =
    event === DOMAIN_EVENTS.SKILL_UNLOCKED
      ? eventKeys.skillUnlocked(userId, skill.id)
      : event === DOMAIN_EVENTS.SKILL_REVOKED
        ? eventKeys.skillRevoked(userId, skill.id, at.getTime())
        : eventKeys.skillRestored(userId, skill.id, at.getTime());
  return {
    type: event,
    aggregateType: "UserSkillBadge",
    aggregateId: userId,
    queue: SKILL_EVENTS_QUEUE,
    jobName: SKILL_EVENTS_JOB,
    dedupeKey,
    payload: payload as unknown as Record<string, unknown>,
  };
}

export type SkillEventSink = (payload: SkillBadgeEventPayload) => Promise<void>;

const sinks = new Map<string, SkillEventSink>();

export function registerSkillEventSink(name: string, sink: SkillEventSink): void {
  sinks.set(name, sink);
}

/** Chỉ dùng trong test. */
export function clearSkillEventSinks(): void {
  sinks.clear();
}

/** Chạy MỌI sink (không dừng ở lỗi đầu) rồi ném lỗi gộp để BullMQ retry — sink đã thành công chạy lại vô hại. */
export async function dispatchSkillEvent(payload: SkillBadgeEventPayload): Promise<void> {
  const entries = [...sinks.entries()];
  if (entries.length === 0) return;
  const results = await Promise.allSettled(entries.map(([, sink]) => sink(payload)));
  const failed = entries.flatMap(([name], i) => (results[i].status === "rejected" ? [name] : []));
  if (failed.length > 0) {
    logger.warn("[skill.events] sink lỗi", { failed, event: payload.event, userId: payload.userId, skillId: payload.skillId });
    throw new Error(`skill.events: sink lỗi: ${failed.join(", ")}`);
  }
}
