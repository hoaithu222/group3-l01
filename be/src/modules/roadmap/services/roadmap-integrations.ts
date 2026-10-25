import { ForbiddenError } from "../../../core/exceptions";
import { roleHasPermission } from "../../../core/constants/permissions";
import { registerAssetScopeGate } from "../../../shared/ports/asset-scope-gate.port";
import { registerAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import type { IRoadmapLessonRepository } from "../repositories/lesson.repository";
import type { IRoadmapSubjectRepository } from "../repositories/subject.repository";

export interface RoadmapDirectory {
  /** Vai trò hệ thống của người dùng (`null` = không tồn tại) — gate tải ảnh/tệp lộ trình kiểm `roadmap:update` theo vai trò. */
  getRole(userId: string): Promise<string | null>;
}

/**
 * Điểm nối của `roadmap` vào module `assets` (be.md §5.6, mẫu `gamification-integrations.ts`) — gọi 1 lần ở API
 * (`roadmap.routes.ts`), idempotent:
 * - gate scope `ROADMAP`: chỉ người có `roadmap:update` theo vai hệ thống được xin URL upload;
 * - resolver đọc `ROADMAP_SUBJECT_COVER`/`ROADMAP_LESSON`: người có `roadmap:update` (đang soạn) luôn đọc được kể cả bản
 *   nháp; người khác chỉ đọc khi môn `PUBLISHED` và (với ảnh buổi) buổi đã `published`. Chưa đăng ký (worker) → link
 *   `scopeType NONE` chỉ chủ asset đọc — fail-closed.
 */
export function registerRoadmapIntegrations(deps: { subjects: IRoadmapSubjectRepository; lessons: IRoadmapLessonRepository; directory: RoadmapDirectory }): void {
  registerAssetScopeGate("ROADMAP", {
    beforeCreate: async ({ ownerId }) => {
      const role = await deps.directory.getRole(ownerId);
      if (role === null || !roleHasPermission(role, "roadmap:update")) throw new ForbiddenError("Bạn không có quyền tải ảnh/tệp lộ trình học");
    },
  });

  registerAssetTargetReadResolver("ROADMAP_SUBJECT_COVER", {
    canRead: async (user, link) => {
      if (roleHasPermission(user.role, "roadmap:update")) return true;
      const subject = await deps.subjects.findById(link.targetId);
      return subject !== null && subject.status === "PUBLISHED";
    },
  });

  registerAssetTargetReadResolver("ROADMAP_LESSON", {
    canRead: async (user, link) => {
      if (roleHasPermission(user.role, "roadmap:update")) return true;
      const lesson = await deps.lessons.findById(link.targetId);
      if (!lesson || !lesson.published) return false;
      const subject = await deps.subjects.findById(lesson.subjectId);
      return subject !== null && subject.status === "PUBLISHED";
    },
  });
}
