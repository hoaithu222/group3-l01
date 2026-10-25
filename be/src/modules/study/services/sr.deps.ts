import type { ISrEnrollmentRepository } from "../repositories/sr-enrollment.repository.interface";
import type { ISrProgressRepository } from "../repositories/sr-progress.repository.interface";
import type { ISrReviewLogRepository } from "../repositories/sr-review-log.repository.interface";
import type { IStudyItemRepository } from "../repositories/study-item.repository.interface";
import type { IStudySetRepository } from "../repositories/study-set.repository.interface";
import type { IStudyNotifier, IStudyOutbox } from "../repositories/ports";
import type { ITxRunner } from "../repositories/tx";
import type { IStudyUserDirectory } from "../repositories/user-directory";
import type { StudySetAccess } from "./study-set-access";

/** Phụ thuộc chung của ôn tập ngắt quãng (`sr.service`, `sr-review.service`, `sr-reminder.service`) — nối ở `study.container.ts`. */
export interface SrDeps {
  sets: IStudySetRepository;
  items: IStudyItemRepository;
  access: StudySetAccess;
  progress: ISrProgressRepository;
  enrollments: ISrEnrollmentRepository;
  logs: ISrReviewLogRepository;
  tx: ITxRunner;
  users: IStudyUserDirectory;
  outbox: IStudyOutbox;
  notifier: IStudyNotifier;
  /** Đồng hồ — test truyền hàm riêng. */
  now?: () => Date;
}

export type ResolvedSrDeps = SrDeps & { now: () => Date };

export function withSrClock(deps: SrDeps): ResolvedSrDeps {
  return { ...deps, now: deps.now ?? (() => new Date()) };
}
