import { withTransaction } from "../../../infrastructure/database";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { notify } from "../../notifications/public";
import { registerRoadmapNotificationTypes } from "../notifications/roadmap.notification-types";
import { PrismaRoadmapEnrollmentRepository } from "../repositories/enrollment.repository";
import { PrismaRoadmapLessonRepository } from "../repositories/lesson.repository";
import { PrismaRoadmapProgressRepository } from "../repositories/progress.repository";
import { PrismaRoadmapSubjectRepository } from "../repositories/subject.repository";
import { RoadmapReminderService } from "../services/roadmap-reminder.service";

registerRoadmapNotificationTypes();

const service = new RoadmapReminderService(
  {
    subjects: new PrismaRoadmapSubjectRepository(),
    lessons: new PrismaRoadmapLessonRepository(),
    enrollments: new PrismaRoadmapEnrollmentRepository(),
    progress: new PrismaRoadmapProgressRepository(),
  },
  async (input) => {
    await withTransaction((tx) => notify(tx, input));
  }
);

/**
 * `roadmap.remind-today` (queue `cron`, be.md p4-07 §7, RM-15 P1) — nhắc buổi bắt buộc đến hạn/trễ chưa xong, 07:30 hằng
 * ngày theo `CRON_TZ`. Lịch TĨNH (một tick/ngày, KHÔNG scheduler theo từng đăng ký — `syncCronSchedulers` xoá scheduler
 * không có trong `defineCron`). Nghiệp vụ ở `RoadmapReminderService` (idempotent theo ngày qua `notify()`).
 */
registerJob("cron", "roadmap.remind-today", async () => {
  const result = await service.run();
  if (result.usersReminded > 0) logger.info("[roadmap.remind-today] Đã nhắc học", { ...result });
});

defineCron({ schedulerId: "roadmap.remind-today", queue: "cron", jobName: "roadmap.remind-today", pattern: "30 7 * * *", opts: { attempts: 3 } });
