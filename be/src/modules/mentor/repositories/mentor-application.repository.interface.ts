import type {
  CursorPage,
  MentorApplication,
  MentorApplicationCreateInput,
  MentorApplicationStatus,
} from "../entities/mentor.interface";
import type { TxHandle } from "./tx";

export interface ApplicationTransition {
  status: MentorApplicationStatus;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  rejectReason?: string | null;
}

/** Lỗi trùng `(postId, applicantId)` (unique index) — service đổi thành `MENTOR_003`. */
export class DuplicateApplicationError extends Error {
  constructor() {
    super("duplicate mentor application");
    this.name = "DuplicateApplicationError";
  }
}

export interface IMentorApplicationRepository {
  findById(id: string): Promise<MentorApplication | null>;
  findByPostAndApplicant(postId: string, applicantId: string): Promise<MentorApplication | null>;
  /** Ném `DuplicateApplicationError` khi đua trùng unique. */
  create(tx: TxHandle, input: MentorApplicationCreateInput): Promise<MentorApplication>;
  countPendingByApplicant(applicantId: string): Promise<number>;
  /** Số đơn PENDING theo từng bài (màn quản lý). */
  countPendingByPosts(postIds: string[]): Promise<Record<string, number>>;
  listByPost(postId: string, status: MentorApplicationStatus | undefined, cursor: string | undefined, limit: number): Promise<CursorPage<MentorApplication>>;
  listByApplicant(applicantId: string, cursor: string | undefined, limit: number): Promise<CursorPage<MentorApplication>>;
  /** Đơn của một người trên nhiều bài (đánh dấu "Đã ứng tuyển" trên bảng tin). */
  findMineForPosts(applicantId: string, postIds: string[]): Promise<MentorApplication[]>;
  /** CAS `status ∈ from` → `to`. `false` khi đơn đã đổi trạng thái. */
  transition(tx: TxHandle, id: string, from: MentorApplicationStatus[], to: ApplicationTransition): Promise<boolean>;
  /** Mọi đơn PENDING của bài → EXPIRED (bài đóng/hết hạn/bị ẩn). Trả số đơn đổi. */
  expirePendingByPost(tx: TxHandle, postId: string, now: Date): Promise<number>;
}
