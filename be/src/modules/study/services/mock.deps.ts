import type { AuthUser } from "../../../core/types/express";
import type { IMockAnswerRepository } from "../repositories/mock-answer.repository.interface";
import type { IMockAttemptRepository } from "../repositories/mock-attempt.repository.interface";
import type { IEventDedupe, IStudyNotifier, IStudyOutbox } from "../repositories/ports";
import type { ISrProgressRepository } from "../repositories/sr-progress.repository.interface";
import type { IStudyItemRepository } from "../repositories/study-item.repository.interface";
import type { IStudySetRepository } from "../repositories/study-set.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import type { IStudyUserDirectory } from "../repositories/user-directory";
import type { RandomInt } from "./mock-question-picker";
import type { StudySetAccess } from "./study-set-access";

/** Phụ thuộc chung của thi thử (`mock-attempt.service`, `mock-grading.service`) — nối ở `study.container.ts`. */
export interface MockDeps {
  sets: IStudySetRepository;
  items: IStudyItemRepository;
  attempts: IMockAttemptRepository;
  answers: IMockAnswerRepository;
  progress: ISrProgressRepository;
  tx: ITxRunner;
  access: StudySetAccess;
  users: IStudyUserDirectory;
  outbox: IStudyOutbox;
  notifier: IStudyNotifier;
  events: IEventDedupe;
  /** Đồng hồ — test truyền hàm riêng. */
  now?: () => Date;
  /** Nguồn ngẫu nhiên xáo đề — test truyền số giả để tất định. */
  random?: RandomInt;
}

export type ResolvedMockDeps = MockDeps & { now: () => Date };

export function withMockClock(deps: MockDeps): ResolvedMockDeps {
  return { ...deps, now: deps.now ?? (() => new Date()) };
}

/** `AuthUser` tối thiểu cho việc kiểm quyền từ job/tiến trình nền (không có request) — chỉ `id` được `permissionService` dùng. */
export function actingUser(userId: string): AuthUser {
  return { id: userId, email: "" };
}
