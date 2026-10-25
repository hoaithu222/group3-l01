import { newObjectId } from "../../../core/utils/object-id";
import type {
  CursorPage,
  MentorApplication,
  MentorApplicationCreateInput,
  MentorApplicationStatus,
} from "../entities/mentor.interface";
import {
  DuplicateApplicationError,
  type ApplicationTransition,
  type IMentorApplicationRepository,
} from "./mentor-application.repository.interface";
import type { TxHandle } from "./tx";

/** Repo in-memory cho unit test (có kiểm unique `(postId, applicantId)` như index thật). */
export class InMemoryMentorApplicationRepository implements IMentorApplicationRepository {
  readonly rows = new Map<string, MentorApplication>();

  seed(input: Partial<MentorApplication> & Pick<MentorApplication, "postId" | "workspaceId" | "applicantId">): MentorApplication {
    const now = new Date();
    const row: MentorApplication = {
      id: newObjectId(),
      message: "Tôi có kinh nghiệm cố vấn đồ án nhiều năm.",
      portfolioUrl: null,
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      rejectReason: null,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<MentorApplication | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findByPostAndApplicant(postId: string, applicantId: string): Promise<MentorApplication | null> {
    return [...this.rows.values()].find((a) => a.postId === postId && a.applicantId === applicantId) ?? null;
  }

  async create(_tx: TxHandle, input: MentorApplicationCreateInput): Promise<MentorApplication> {
    if (await this.findByPostAndApplicant(input.postId, input.applicantId)) throw new DuplicateApplicationError();
    return this.seed(input);
  }

  async countPendingByApplicant(applicantId: string): Promise<number> {
    return [...this.rows.values()].filter((a) => a.applicantId === applicantId && a.status === "PENDING").length;
  }

  async countPendingByPosts(postIds: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const a of this.rows.values()) if (postIds.includes(a.postId) && a.status === "PENDING") out[a.postId] = (out[a.postId] ?? 0) + 1;
    return out;
  }

  async listByPost(postId: string, status: MentorApplicationStatus | undefined, _cursor: string | undefined, limit: number): Promise<CursorPage<MentorApplication>> {
    const data = [...this.rows.values()].filter((a) => a.postId === postId && (!status || a.status === status)).slice(0, limit);
    return { data, nextCursor: null };
  }

  async listByApplicant(applicantId: string, _cursor: string | undefined, limit: number): Promise<CursorPage<MentorApplication>> {
    return { data: [...this.rows.values()].filter((a) => a.applicantId === applicantId).slice(0, limit), nextCursor: null };
  }

  async findMineForPosts(applicantId: string, postIds: string[]): Promise<MentorApplication[]> {
    return [...this.rows.values()].filter((a) => a.applicantId === applicantId && postIds.includes(a.postId));
  }

  async transition(_tx: TxHandle, id: string, from: MentorApplicationStatus[], to: ApplicationTransition): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !from.includes(row.status)) return false;
    this.rows.set(id, { ...row, ...to, updatedAt: new Date() } as MentorApplication);
    return true;
  }

  async expirePendingByPost(_tx: TxHandle, postId: string, now: Date): Promise<number> {
    let n = 0;
    for (const a of this.rows.values()) {
      if (a.postId === postId && a.status === "PENDING") {
        this.rows.set(a.id, { ...a, status: "EXPIRED", reviewedAt: now });
        n += 1;
      }
    }
    return n;
  }
}
