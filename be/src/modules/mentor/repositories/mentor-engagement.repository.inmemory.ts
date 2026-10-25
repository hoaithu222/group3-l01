import { newObjectId } from "../../../core/utils/object-id";
import type { MentorEngagement, MentorEngagementCreateInput, MentorEngagementStatus } from "../entities/mentor.interface";
import type { EngagementEnd, IMentorEngagementRepository } from "./mentor-engagement.repository.interface";
import type { TxHandle } from "./tx";

/** Repo in-memory cho unit test (không dùng ngoài test). */
export class InMemoryMentorEngagementRepository implements IMentorEngagementRepository {
  readonly rows = new Map<string, MentorEngagement>();

  seed(input: Partial<MentorEngagement> & Pick<MentorEngagement, "postId" | "workspaceId" | "mentorId">): MentorEngagement {
    const now = new Date();
    const row: MentorEngagement = {
      id: newObjectId(),
      applicationId: newObjectId(),
      acceptedBy: newObjectId(),
      channelIds: [],
      conversationId: null,
      startedAt: now,
      endsAt: new Date(now.getTime() + 30 * 86_400_000),
      totalDays: 30,
      status: "ACTIVE",
      endedAt: null,
      endedReason: null,
      endedBy: null,
      endingSoonNotifiedAt: null,
      version: 1,
      createdAt: now,
      ...input,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string, _tx?: TxHandle): Promise<MentorEngagement | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async create(_tx: TxHandle, input: MentorEngagementCreateInput): Promise<MentorEngagement> {
    return this.seed(input);
  }

  async findActiveByWorkspaceAndMentor(workspaceId: string, mentorId: string): Promise<MentorEngagement | null> {
    return [...this.rows.values()].find((e) => e.workspaceId === workspaceId && e.mentorId === mentorId && e.status === "ACTIVE") ?? null;
  }

  async listByWorkspace(workspaceId: string, status: MentorEngagementStatus | undefined, limit: number): Promise<MentorEngagement[]> {
    return [...this.rows.values()].filter((e) => e.workspaceId === workspaceId && (!status || e.status === status)).slice(0, limit);
  }

  async listByMentor(mentorId: string, status: MentorEngagementStatus | undefined, limit: number): Promise<MentorEngagement[]> {
    return [...this.rows.values()].filter((e) => e.mentorId === mentorId && (!status || e.status === status)).slice(0, limit);
  }

  async findByApplicationIds(applicationIds: string[]): Promise<MentorEngagement[]> {
    return [...this.rows.values()].filter((e) => applicationIds.includes(e.applicationId));
  }

  async end(_tx: TxHandle, id: string, expectedVersion: number | null, end: EngagementEnd): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status !== "ACTIVE" || (expectedVersion !== null && row.version !== expectedVersion)) return false;
    this.rows.set(id, { ...row, status: "ENDED", endedAt: end.at, endedReason: end.reason, endedBy: end.by, version: row.version + 1 });
    return true;
  }

  async extend(_tx: TxHandle, id: string, expectedVersion: number, next: { endsAt: Date; totalDays: number }): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status !== "ACTIVE" || row.version !== expectedVersion) return false;
    this.rows.set(id, { ...row, ...next, endingSoonNotifiedAt: null, version: row.version + 1 });
    return true;
  }

  async setConversation(id: string, conversationId: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.conversationId) return false;
    this.rows.set(id, { ...row, conversationId });
    return true;
  }

  async listDueToExpire(now: Date, limit: number): Promise<MentorEngagement[]> {
    return [...this.rows.values()].filter((e) => e.status === "ACTIVE" && e.endsAt <= now).slice(0, limit);
  }

  async listEndingSoon(now: Date, until: Date, limit: number): Promise<MentorEngagement[]> {
    return [...this.rows.values()]
      .filter((e) => e.status === "ACTIVE" && e.endsAt > now && e.endsAt <= until && !e.endingSoonNotifiedAt)
      .slice(0, limit);
  }

  async markEndingSoonNotified(_tx: TxHandle, id: string, at: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status !== "ACTIVE" || row.endingSoonNotifiedAt) return false;
    this.rows.set(id, { ...row, endingSoonNotifiedAt: at });
    return true;
  }
}
