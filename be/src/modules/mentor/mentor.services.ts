import type { MentorDeps } from "./services/mentor.deps";
import { MentorPostsService } from "./services/mentor-posts.service";
import { MentorApplicationsService } from "./services/mentor-applications.service";
import { MentorAcceptService } from "./services/mentor-accept.service";
import { MentorEngagementsService } from "./services/mentor-engagements.service";
import { MentorEffectsService } from "./services/mentor-effects.service";
import { MentorCronService } from "./services/mentor-cron.service";
import { MentorReportService } from "./services/mentor-report.service";
import { MentorAdminService } from "./services/mentor-admin.service";

/** Dựng dịch vụ từ một bộ phụ thuộc — dùng chung bởi bản Prisma (routes + job) và unit test (repo in-memory). */
export function buildMentorServices(deps: MentorDeps) {
  const engagements = new MentorEngagementsService(deps);
  return {
    deps,
    posts: new MentorPostsService(deps),
    applications: new MentorApplicationsService(deps),
    accept: new MentorAcceptService(deps),
    engagements,
    effects: new MentorEffectsService(deps),
    cron: new MentorCronService(deps, engagements),
    report: new MentorReportService(deps.reports),
    admin: new MentorAdminService(deps, engagements),
  };
}

export type MentorContainer = ReturnType<typeof buildMentorServices>;
