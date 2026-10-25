import type { IRoadmapEnrollmentRepository } from "../repositories/enrollment.repository";
import type { IRoadmapLessonRepository } from "../repositories/lesson.repository";
import type { IRoadmapMediaRepository } from "../repositories/media.repository";
import type { IRoadmapPhaseRepository } from "../repositories/phase.repository";
import type { IRoadmapProgressRepository } from "../repositories/progress.repository";
import type { IRoadmapSubjectRepository } from "../repositories/subject.repository";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import type { IRoadmapAssetPort } from "./roadmap-asset.port";

/** Gói phụ thuộc dùng chung mọi service của module — mẫu `study/services/study.deps.ts` (repo Prisma thật, tx transaction). */
export interface RoadmapDeps {
  subjects: IRoadmapSubjectRepository;
  phases: IRoadmapPhaseRepository;
  lessons: IRoadmapLessonRepository;
  media: IRoadmapMediaRepository;
  enrollments: IRoadmapEnrollmentRepository;
  progress: IRoadmapProgressRepository;
  assets: IRoadmapAssetPort;
  tx: ITxRunner;
  /** p4-07 (RM-14) — outbox `gamification/xp.consume` khi buổi COMPLETED lần đầu. */
  outbox: IOutboxPort;
}
