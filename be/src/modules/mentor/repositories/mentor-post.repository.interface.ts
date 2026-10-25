import type {
  CursorPage,
  MentorPost,
  MentorPostCreateInput,
  MentorPostFeedFilter,
  MentorPostPatch,
  MentorPostStatus,
} from "../entities/mentor.interface";
import type { TxHandle } from "./tx";

export interface HiddenState {
  at: Date;
  by: string;
  reason: string;
}

export interface IMentorPostRepository {
  findById(id: string, tx?: TxHandle): Promise<MentorPost | null>;
  findByIds(ids: string[]): Promise<MentorPost[]>;
  create(input: MentorPostCreateInput): Promise<MentorPost>;
  /** Bảng tin: loại bài ẩn; `OPEN` còn loại bài quá `expiresAt`. Sắp `createdAt` giảm dần, cursor `(createdAt, id)`. */
  listFeed(filter: MentorPostFeedFilter, cursor: string | undefined, limit: number): Promise<CursorPage<MentorPost>>;
  /** Mọi bài của nhóm (kể cả ẩn/đóng), mới nhất trước. */
  listByWorkspace(workspaceId: string, limit: number): Promise<MentorPost[]>;
  countOpenByWorkspace(workspaceId: string, now: Date): Promise<number>;
  /** CAS theo `version` (bài chưa CLOSED) — ghi `patch`, `version+1`. `false` khi lệch. */
  updateWithVersion(id: string, expectedVersion: number, patch: MentorPostPatch): Promise<boolean>;
  /**
   * Giữ một chỗ cố vấn (accept, IR-22): CAS `{ id, version: expected, status: OPEN }` → `activeEngagements+1`, `version+1`,
   * `status = nextStatus`. `false` khi đã có người giữ trước/đổi bài.
   */
  claimSlot(tx: TxHandle, id: string, expectedVersion: number, nextStatus: MentorPostStatus): Promise<boolean>;
  /** Trả một chỗ (kết thúc đợt): `activeEngagements-1` (≥ 0), `version+1`; FULFILLED → OPEN nếu chưa hết hạn. */
  releaseSlot(tx: TxHandle, id: string, now: Date): Promise<void>;
  incrementApplicants(tx: TxHandle, id: string): Promise<void>;
  /** OPEN/FULFILLED → CLOSED (`closedAt`, `version+1`). `false` khi đã CLOSED. */
  close(tx: TxHandle, id: string, now: Date): Promise<boolean>;
  /** Bài OPEN/FULFILLED đã quá `expiresAt` (cron `mentor.post-expire`). */
  listExpired(now: Date, limit: number): Promise<MentorPost[]>;
  setHidden(id: string, hidden: HiddenState | null): Promise<boolean>;
  setReportedCount(id: string, count: number): Promise<void>;
}
