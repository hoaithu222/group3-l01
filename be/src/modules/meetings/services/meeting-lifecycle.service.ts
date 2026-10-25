import type { MeetingDeps } from "./meeting.deps";
import type { MeetingService } from "./meeting.service";
import type { MeetingAttendeeService } from "./meeting-attendee.service";

export interface MeetingRevocationInput {
  scopeType: string;
  scopeId: string;
  userIds: string[];
  reason: string;
}

const REMOVAL_REASONS = new Set(["REMOVED", "BANNED", "LEFT", "EXPIRED", "ANONYMIZED"]);

/**
 * Vòng đời workspace → cuộc họp (README §2 "Workspace archive", "Thành viên bị loại/rời workspace"): nguồn là `revokeScope()`
 * (listener → job `meeting.lifecycle`).
 * - workspace ARCHIVED: mọi cuộc họp SCHEDULED → CANCELLED (`WORKSPACE_ARCHIVED`) + ICS CANCEL; LIVE để p2-05 kết thúc.
 * - thành viên bị loại/rời: bị bỏ khỏi mọi cuộc họp SCHEDULED/LIVE của workspace; nếu là HOST → chuyển cho CO_HOST lâu nhất,
 *   không có → SCHEDULED huỷ (`HOST_REMOVED`) (LIVE để p2-05).
 */
export class MeetingLifecycleService {
  constructor(
    private readonly d: MeetingDeps,
    private readonly meetings: MeetingService,
    private readonly attendees: MeetingAttendeeService
  ) {}

  async handle(input: MeetingRevocationInput): Promise<{ cancelled: number; removed: number; transferred: number }> {
    const out = { cancelled: 0, removed: 0, transferred: 0 };
    if (input.scopeType !== "WORKSPACE") return out;

    if (input.reason === "ARCHIVED") {
      for (const m of await this.d.repo.findOpenByWorkspace(input.scopeId)) {
        if (m.status === "SCHEDULED" && (await this.meetings.cancelBySystem(m.id, "WORKSPACE_ARCHIVED"))) out.cancelled += 1;
      }
      return out;
    }
    if (!REMOVAL_REASONS.has(input.reason)) return out;

    for (const userId of input.userIds) {
      for (const m of await this.d.repo.findOpenOfUserInWorkspace(input.scopeId, userId)) {
        const me = await this.d.repo.findAttendee(m.id, userId);
        if (!me || me.removedAt) continue;
        if (me.role === "HOST") {
          const successor = (await this.d.repo.findActiveAttendees(m.id)).filter((a) => a.role === "CO_HOST" && a.userId !== userId)[0];
          if (successor) {
            await this.meetings.transferHostBySystem(m.id, userId, successor.userId);
            out.transferred += 1;
          } else if (m.status === "SCHEDULED") {
            if (await this.meetings.cancelBySystem(m.id, "HOST_REMOVED")) out.cancelled += 1;
            continue;
          } else {
            continue; // LIVE không còn ai chủ trì: p2-05 kết thúc phòng theo quyền
          }
        }
        if (await this.attendees.commitRemoval(m, userId, null)) out.removed += 1;
      }
    }
    return out;
  }
}
