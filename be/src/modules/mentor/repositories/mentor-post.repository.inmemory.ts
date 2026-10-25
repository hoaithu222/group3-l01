import { newObjectId } from "../../../core/utils/object-id";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type {
  CursorPage,
  MentorPost,
  MentorPostCreateInput,
  MentorPostFeedFilter,
  MentorPostPatch,
  MentorPostStatus,
} from "../entities/mentor.interface";
import type { HiddenState, IMentorPostRepository } from "./mentor-post.repository.interface";
import type { TxHandle } from "./tx";

/** Repo in-memory cho unit test service (không dùng ngoài test). */
export class InMemoryMentorPostRepository implements IMentorPostRepository {
  readonly rows = new Map<string, MentorPost>();

  seed(post: Partial<MentorPost> & Pick<MentorPost, "workspaceId" | "createdBy">): MentorPost {
    const now = new Date();
    const row: MentorPost = {
      id: newObjectId(),
      title: "Cần cố vấn kiến trúc",
      normalizedTitle: "can co van kien truc",
      description: "Mô tả đủ dài cho bài tìm cố vấn thử nghiệm.",
      skills: ["react"],
      skillLabels: ["React"],
      commitmentHoursPerWeek: 2,
      mentorsNeeded: 1,
      activeEngagements: 0,
      status: "OPEN",
      applicantsCount: 0,
      expiresAt: new Date(now.getTime() + 7 * 86_400_000),
      reportedCount: 0,
      hiddenAt: null,
      hiddenBy: null,
      hiddenReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      ...post,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string, _tx?: TxHandle): Promise<MentorPost | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findByIds(ids: string[]): Promise<MentorPost[]> {
    return ids.map((id) => this.rows.get(id)).filter((r): r is MentorPost => !!r);
  }

  async create(input: MentorPostCreateInput): Promise<MentorPost> {
    return this.seed(input);
  }

  async listFeed(filter: MentorPostFeedFilter, cursor: string | undefined, limit: number): Promise<CursorPage<MentorPost>> {
    const at = cursor ? decodeCursor(cursor) : null;
    const all = [...this.rows.values()]
      .filter((p) => !p.hiddenAt && p.status === filter.status)
      .filter((p) => filter.status !== "OPEN" || p.expiresAt > filter.now)
      .filter((p) => !filter.workspaceId || p.workspaceId === filter.workspaceId)
      .filter((p) => !filter.skills || filter.skills.every((s) => p.skills.includes(s)))
      .filter((p) => !filter.q || p.normalizedTitle.includes(filter.q))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .filter((p) => !at || p.createdAt < at.at || (p.createdAt.getTime() === at.at.getTime() && p.id < at.id));
    const data = all.slice(0, limit);
    const last = data[data.length - 1];
    return { data, nextCursor: all.length > limit && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  async listByWorkspace(workspaceId: string, limit: number): Promise<MentorPost[]> {
    return [...this.rows.values()].filter((p) => p.workspaceId === workspaceId).slice(0, limit);
  }

  async countOpenByWorkspace(workspaceId: string, now: Date): Promise<number> {
    return [...this.rows.values()].filter((p) => p.workspaceId === workspaceId && p.status === "OPEN" && p.expiresAt > now).length;
  }

  async updateWithVersion(id: string, expectedVersion: number, patch: MentorPostPatch): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion || row.status === "CLOSED") return false;
    this.rows.set(id, { ...row, ...patch, version: row.version + 1 });
    return true;
  }

  async claimSlot(_tx: TxHandle, id: string, expectedVersion: number, nextStatus: MentorPostStatus): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.version !== expectedVersion || row.status !== "OPEN") return false;
    this.rows.set(id, { ...row, activeEngagements: row.activeEngagements + 1, version: row.version + 1, status: nextStatus });
    return true;
  }

  async releaseSlot(_tx: TxHandle, id: string, now: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    const active = Math.max(0, row.activeEngagements - 1);
    const reopen = row.status === "FULFILLED" && row.expiresAt > now && active < row.mentorsNeeded;
    this.rows.set(id, { ...row, activeEngagements: active, version: row.version + 1, status: reopen ? "OPEN" : row.status });
  }

  async incrementApplicants(_tx: TxHandle, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, applicantsCount: row.applicantsCount + 1 });
  }

  async close(_tx: TxHandle, id: string, now: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.status === "CLOSED") return false;
    this.rows.set(id, { ...row, status: "CLOSED", closedAt: now, version: row.version + 1 });
    return true;
  }

  async listExpired(now: Date, limit: number): Promise<MentorPost[]> {
    return [...this.rows.values()].filter((p) => p.status !== "CLOSED" && p.expiresAt <= now).slice(0, limit);
  }

  async setHidden(id: string, hidden: HiddenState | null): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row) return false;
    this.rows.set(id, { ...row, hiddenAt: hidden?.at ?? null, hiddenBy: hidden?.by ?? null, hiddenReason: hidden?.reason ?? null, version: row.version + 1 });
    return true;
  }

  async setReportedCount(id: string, count: number): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, reportedCount: count });
  }
}
