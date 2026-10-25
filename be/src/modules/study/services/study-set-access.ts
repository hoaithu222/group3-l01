import { permissionService } from "../../../core/permission";
import { ForbiddenError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { StudySet } from "../entities/study-set.interface";
import { studyErrors } from "../study.errors";

export type StudyWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

/**
 * Vai trò THÀNH VIÊN (không GUEST) của người dùng trong một nhóm — MỘT chỗ gọi `permissionService.resolve` (p0-02). `null` =
 * không là thành viên, là GUEST hoặc nhóm không thấy được. Bộ WORKSPACE dành cho OWNER/ADMIN/MEMBER; GUEST luôn 404.
 */
export interface IStudyWorkspaceRoles {
  roleOf(user: AuthUser, workspaceId: string): Promise<StudyWorkspaceRole | null>;
}

export class PermissionStudyWorkspaceRoles implements IStudyWorkspaceRoles {
  async roleOf(user: AuthUser, workspaceId: string): Promise<StudyWorkspaceRole | null> {
    const access = await permissionService.resolve(user, { type: "WORKSPACE", id: workspaceId });
    if (!access.visible) return null;
    return access.role === "OWNER" || access.role === "ADMIN" || access.role === "MEMBER" ? access.role : null;
  }
}

/** Server tính sẵn — client không tự suy từ vai trò (02-conventions §2 "Hành động UI"). */
export interface StudySetPermissions {
  /** Thấy THÔNG TIN bộ (tiêu đề, số mục…). */
  meta: boolean;
  /** Đọc NỘI DUNG (mục, ảnh, âm thanh) và học — đây là `canView` mà p4-02/p5-01 dùng lại. */
  content: boolean;
  edit: boolean;
  delete: boolean;
  duplicate: boolean;
  report: boolean;
  /** OWNER/ADMIN nhóm ẩn bộ WORKSPACE vi phạm (admin nền tảng ẩn bộ PUBLIC qua route `/admin`). */
  hide: boolean;
  unhide: boolean;
}

const NONE: StudySetPermissions = { meta: false, content: false, edit: false, delete: false, duplicate: false, report: false, hide: false, unhide: false };

/**
 * Ma trận quyền README p4-01 §6 — MỘT nguồn cho controller, resolver quyền đọc asset và (sau này) p4-02/p5-01.
 * DELETED → 404 · HIDDEN → tác giả (xem, không nhân bản/báo cáo… và không sửa) + OWNER/ADMIN nhóm (chỉ metadata, khôi phục) ·
 * PRIVATE → tác giả · WORKSPACE → OWNER/ADMIN/MEMBER (GUEST → 404) · PUBLIC → mọi người dùng đăng nhập.
 */
export class StudySetAccess {
  constructor(private readonly roles: IStudyWorkspaceRoles) {}

  async resolve(user: AuthUser, set: StudySet): Promise<StudySetPermissions> {
    return this.resolveWith(user, set, (ws) => this.roles.roleOf(user, ws));
  }

  /** Quyền ĐỌC nội dung — hợp đồng `canView(user, set)` của be.md §5. */
  async canView(user: AuthUser, set: StudySet): Promise<boolean> {
    return (await this.resolve(user, set)).content;
  }

  /** Lọc các bộ người dùng đọc được (tra vai trò nhóm MỘT lần cho mỗi nhóm) — cho `GET /sr/due` của p4-02. */
  async filterViewable(user: AuthUser, sets: readonly StudySet[]): Promise<StudySet[]> {
    const cache = new Map<string, Promise<StudyWorkspaceRole | null>>();
    const roleOf = (ws: string): Promise<StudyWorkspaceRole | null> => {
      if (!cache.has(ws)) cache.set(ws, this.roles.roleOf(user, ws));
      return cache.get(ws) as Promise<StudyWorkspaceRole | null>;
    };
    const flags = await Promise.all(sets.map(async (s) => (await this.resolveWith(user, s, roleOf)).content));
    return sets.filter((_, i) => flags[i]);
  }

  /** 404 trung tính khi không thấy được thông tin bộ. */
  async assertMeta(user: AuthUser, set: StudySet): Promise<StudySetPermissions> {
    const perms = await this.resolve(user, set);
    if (!perms.meta) throw studyErrors.notFound();
    return perms;
  }

  async assertContent(user: AuthUser, set: StudySet): Promise<StudySetPermissions> {
    const perms = await this.resolve(user, set);
    if (!perms.content) throw studyErrors.notFound();
    return perms;
  }

  /** Chỉ tác giả sửa được: không thấy → 404, thấy nhưng không phải tác giả → 403, bộ đã ẩn → `STUDY_004`. */
  async assertEdit(user: AuthUser, set: StudySet): Promise<void> {
    await this.assertMeta(user, set);
    if (set.ownerId !== user.id) throw new ForbiddenError("Chỉ tác giả được chỉnh sửa bộ học");
    if (set.status === "HIDDEN") throw studyErrors.hidden();
  }

  private async resolveWith(
    user: AuthUser,
    set: StudySet,
    roleOf: (workspaceId: string) => Promise<StudyWorkspaceRole | null>
  ): Promise<StudySetPermissions> {
    if (set.status === "DELETED" || set.deletedAt !== null) return NONE;

    if (set.ownerId === user.id) {
      const active = set.status === "ACTIVE";
      return { ...NONE, meta: true, content: true, edit: active, delete: true, duplicate: active };
    }

    const role = set.visibility === "WORKSPACE" && set.workspaceId ? await roleOf(set.workspaceId) : null;
    const moderator = role === "OWNER" || role === "ADMIN";

    if (set.status === "HIDDEN") return moderator ? { ...NONE, meta: true, unhide: true } : NONE;
    if (set.visibility === "PUBLIC") return { ...NONE, meta: true, content: true, duplicate: true, report: true };
    if (set.visibility === "WORKSPACE" && role !== null) {
      return { ...NONE, meta: true, content: true, duplicate: true, report: true, hide: moderator };
    }
    return NONE;
  }
}
