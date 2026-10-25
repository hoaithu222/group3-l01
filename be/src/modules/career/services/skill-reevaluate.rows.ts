import type { OutboxEventInput } from "../../../infrastructure/queue";
import { eventKeys } from "../../../shared/events/domain-events";
import type { SkillDefinition } from "../entities/skill.interface";

/**
 * Hàng outbox xếp job đánh giá lại (queue `gamification`) — ghi CÙNG transaction với thao tác admin (bật kỹ năng / đổi tiêu chí / "Đánh giá lại toàn bộ"),
 * KHÔNG `enqueue` thẳng trên đường phản hồi request. `dedupeKey` theo `version` sau khi ghi ⇒ cùng phiên bản chỉ chạy một lần.
 */
export const REEVALUATE_QUEUE = "gamification" as const;
export const REEVALUATE_SKILL_JOB = "skill.reevaluate-skill" as const;
export const REEVALUATE_ALL_JOB = "skill.reevaluate-all" as const;

export function reevaluateSkillRow(skill: Pick<SkillDefinition, "id" | "version">): OutboxEventInput {
  return {
    type: REEVALUATE_SKILL_JOB,
    aggregateType: "SkillDefinition",
    aggregateId: skill.id,
    queue: REEVALUATE_QUEUE,
    jobName: REEVALUATE_SKILL_JOB,
    dedupeKey: eventKeys.skillReevaluate(skill.id, skill.version),
    payload: { skillId: skill.id, version: skill.version },
  };
}

export function reevaluateAllRow(bucket: number, actorId: string): OutboxEventInput {
  return {
    type: REEVALUATE_ALL_JOB,
    aggregateType: "SkillDefinition",
    aggregateId: actorId,
    queue: REEVALUATE_QUEUE,
    jobName: REEVALUATE_ALL_JOB,
    dedupeKey: eventKeys.skillReevaluateAll(bucket),
    payload: { requestedBy: actorId },
  };
}
