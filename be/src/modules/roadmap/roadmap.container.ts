import { createStudyContentReader } from "../study/public";
import { PrismaRoadmapDirectory } from "./repositories/directory";
import { PrismaRoadmapEnrollmentRepository } from "./repositories/enrollment.repository";
import { PrismaRoadmapLessonRepository } from "./repositories/lesson.repository";
import { PrismaRoadmapMediaRepository } from "./repositories/media.repository";
import { PrismaRoadmapPhaseRepository } from "./repositories/phase.repository";
import { PrismaRoadmapProgressRepository } from "./repositories/progress.repository";
import { PrismaRoadmapSubjectRepository } from "./repositories/subject.repository";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { AdminLessonService } from "./services/admin-lesson.service";
import { AdminSubjectService } from "./services/admin-subject.service";
import { EnrollmentService } from "./services/enrollment.service";
import { LessonService } from "./services/lesson.service";
import { PublicRoadmapAssetPort } from "./services/roadmap-asset.port.public";
import { registerRoadmapIntegrations } from "./services/roadmap-integrations";
import type { RoadmapDeps } from "./services/roadmap.deps";
import { SubjectQueryService } from "./services/subject-query.service";

export interface RoadmapContainer {
  subjects: SubjectQueryService;
  lessons: LessonService;
  enrollments: EnrollmentService;
  adminSubjects: AdminSubjectService;
  adminLessons: AdminLessonService;
}

let instance: RoadmapContainer | null = null;
let deps: RoadmapDeps | null = null;

function getDeps(): RoadmapDeps {
  if (deps) return deps;
  deps = {
    subjects: new PrismaRoadmapSubjectRepository(),
    phases: new PrismaRoadmapPhaseRepository(),
    lessons: new PrismaRoadmapLessonRepository(),
    media: new PrismaRoadmapMediaRepository(),
    enrollments: new PrismaRoadmapEnrollmentRepository(),
    progress: new PrismaRoadmapProgressRepository(),
    assets: new PublicRoadmapAssetPort(),
    tx: new PrismaTxRunner(),
    outbox: new PrismaOutboxPort(),
  };
  return deps;
}

/** Nối DI cho module `roadmap` (Prisma thật) — mẫu `study/study.container.ts`. */
export function getRoadmapContainer(): RoadmapContainer {
  if (instance) return instance;
  const d = getDeps();
  instance = {
    subjects: new SubjectQueryService(d),
    lessons: new LessonService(d, createStudyContentReader()),
    enrollments: new EnrollmentService(d),
    adminSubjects: new AdminSubjectService(d),
    adminLessons: new AdminLessonService(d, createStudyContentReader()),
  };
  return instance;
}

/** Điểm cắm vào module `assets` (CHẠY ở mọi tiến trình cần — API: `roadmap.routes.ts`) — đăng ký lại vô hại. */
export function registerRoadmapAssetIntegrations(): void {
  const d = getDeps();
  registerRoadmapIntegrations({ subjects: d.subjects, lessons: d.lessons, directory: new PrismaRoadmapDirectory() });
}
