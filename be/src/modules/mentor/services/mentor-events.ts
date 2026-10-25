import type { OutboxEventInput } from "../../../infrastructure/queue";

/**
 * Outbox → job (queue `notifications`) cho việc SAU commit của Mentor Connect (be.md §7). Mỗi cặp queue/jobName chỉ MỘT processor
 * (`jobs/mentor.jobs.ts`). `dedupeKey` 3 đoạn `<job>:engagement:<id>` — relay dùng nguyên làm jobId BullMQ.
 */
export const MENTOR_QUEUE = "notifications" as const;
export const MENTOR_ACCEPTED_JOB = "mentor.accepted-effects";
export const MENTOR_ENDED_JOB = "mentor.ended-effects";

export interface MentorAcceptedPayload {
  engagementId: string;
  createConversation: boolean;
  includeMemberIds: string[];
}

export interface MentorEndedPayload {
  engagementId: string;
}

export function acceptedEvent(engagementId: string, p: Omit<MentorAcceptedPayload, "engagementId">): OutboxEventInput {
  return {
    type: "mentor.accepted",
    aggregateType: "MentorEngagement",
    aggregateId: engagementId,
    queue: MENTOR_QUEUE,
    jobName: MENTOR_ACCEPTED_JOB,
    dedupeKey: `mentor.accepted:engagement:${engagementId}`,
    payload: { engagementId, createConversation: p.createConversation, includeMemberIds: p.includeMemberIds },
  };
}

export function endedEvent(engagementId: string): OutboxEventInput {
  return {
    type: "mentor.ended",
    aggregateType: "MentorEngagement",
    aggregateId: engagementId,
    queue: MENTOR_QUEUE,
    jobName: MENTOR_ENDED_JOB,
    dedupeKey: `mentor.ended:engagement:${engagementId}`,
    payload: { engagementId },
  };
}
