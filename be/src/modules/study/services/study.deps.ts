import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { IStudyItemRepository } from "../repositories/study-item.repository.interface";
import type { IStudySetRepository } from "../repositories/study-set.repository.interface";
import type { ISrEnrollmentRepository } from "../repositories/sr-enrollment.repository.interface";
import type { IStudyOutbox } from "../repositories/ports";
import type { ITxRunner } from "../repositories/tx";
import type { IStudyUserDirectory } from "../repositories/user-directory";
import type { StudySet } from "../entities/study-set.interface";
import type { PresentContext } from "./study-set.presenter";
import type { IStudyAssetPort } from "./study-asset.port";
import type { IStudyWorkspaceRoles, StudySetAccess } from "./study-set-access";
import type { StudyLimitsReader } from "./study-limits";
import { studyErrors } from "../study.errors";
import type { AuthUser } from "../../../core/types/express";

/** Phụ thuộc chung của các service bộ học (không có DI container — architecture.md: nối ở `study.container.ts`). */
export interface StudyDeps {
  sets: IStudySetRepository;
  items: IStudyItemRepository;
  tx: ITxRunner;
  assets: IStudyAssetPort;
  access: StudySetAccess;
  roles: IStudyWorkspaceRoles;
  users: IStudyUserDirectory;
  /** Ghi outbox trong transaction lưu mục (p4-02: `sr.item-deleted`) — bản in-memory ghi lại cho test. */
  outbox: IStudyOutbox;
  /** Đăng ký ôn theo lịch (p4-02) — chỉ để trả `srEnrolled` trong chi tiết bộ; vắng (test cũ) ⇒ luôn `false`. */
  enrollments?: ISrEnrollmentRepository;
  /** Trần bộ học hiệu lực (`SystemConfig limits.study`) — mặc định đọc `runtimeConfig` (`study-limits.ts`); test truyền bản cố định. */
  limits?: StudyLimitsReader;
  /** Đồng hồ — test truyền hàm riêng. */
  now?: () => Date;
}

export type ResolvedStudyDeps = StudyDeps & { now: () => Date };

export function withClock(deps: StudyDeps): ResolvedStudyDeps {
  return { ...deps, now: deps.now ?? (() => new Date()) };
}

/** `AppError` `STUDY_006` — ảnh/âm thanh không dùng được (chưa READY, không phải của bạn, đã gắn nơi khác…). */
export function assetNotReady(): AppError {
  return new AppError(ErrorMessages[ErrorCode.STUDY_006], 400, ErrorCode.STUDY_006);
}

/** Đọc bộ theo id — 404 trung tính nếu không có (đã xoá mềm vẫn trả về; quyền quyết định ở `StudySetAccess`). */
export async function loadSet(deps: Pick<StudyDeps, "sets">, id: string): Promise<StudySet> {
  const set = await deps.sets.findById(id);
  if (!set) throw studyErrors.notFound();
  return set;
}

/** `true` khi người dùng ĐANG đăng ký ôn theo lịch bộ này (`SrEnrollment.active` — đã "Ngừng ôn" thì hàng còn nhưng `active=false`). */
export async function isSrEnrolled(deps: Pick<StudyDeps, "enrollments">, userId: string, setId: string): Promise<boolean> {
  const row = await deps.enrollments?.find(userId, setId);
  return row?.active === true;
}

/** Bộ WORKSPACE chỉ tạo/nhân bản vào nhóm mà người dùng là thành viên (không GUEST) — nếu không → 404 trung tính. */
export async function assertWorkspaceMember(deps: Pick<StudyDeps, "roles">, user: AuthUser, workspaceId: string): Promise<void> {
  if ((await deps.roles.roleOf(user, workspaceId)) === null) throw studyErrors.notFound();
}

/** Người tạo + thumbnail ảnh bìa cho MỘT trang danh sách (2 truy vấn batch, không N+1). */
export async function buildPresentContext(deps: Pick<StudyDeps, "users" | "assets">, sets: readonly StudySet[]): Promise<PresentContext> {
  const covers = sets.flatMap((s) => (s.coverAssetId ? [s.coverAssetId] : []));
  const [owners, thumbs] = await Promise.all([
    deps.users.findMany(sets.map((s) => s.ownerId)),
    covers.length > 0 ? deps.assets.signThumbnails(covers) : Promise.resolve(new Map<string, string>()),
  ]);
  return { owners, thumbs };
}
