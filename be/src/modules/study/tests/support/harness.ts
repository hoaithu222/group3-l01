import type { AuthUser } from "../../../../core/types/express";
import type { ReportPort, SubmitReportInput } from "../../../../shared/ports/report.port";
import type { StudyItemInput } from "../../dtos";
import { InMemoryStudyItemRepository } from "../../repositories/study-item.repository.inmemory";
import { InMemoryStudySetRepository } from "../../repositories/study-set.repository.inmemory";
import { InMemoryStudyOutbox } from "../../repositories/ports";
import { InMemorySrEnrollmentRepository } from "../../repositories/sr-enrollment.repository.inmemory";
import { InMemoryTxRunner } from "../../repositories/tx";
import { InMemoryStudyUserDirectory } from "../../repositories/user-directory";
import { InMemoryStudyAssetPort } from "../../services/study-asset.port";
import { StudyItemBulkService } from "../../services/study-item-bulk.service";
import { StudyItemQueryService } from "../../services/study-item-query.service";
import { StudyContentReader } from "../../services/study-content.reader";
import { StudySetAccess, type IStudyWorkspaceRoles, type StudyWorkspaceRole } from "../../services/study-set-access";
import { StudySetDuplicateService } from "../../services/study-set-duplicate.service";
import { StudySetListService } from "../../services/study-set-list.service";
import { StudySetModerationService } from "../../services/study-set-moderation.service";
import { StudySetReportService, StudySetReportTarget } from "../../services/study-report.service";
import { StudySetService } from "../../services/study-set.service";
import { InMemoryStudyTagCache } from "../../services/study-tag-cache";

export const WS = "aaaaaaaaaaaaaaaaaaaaaaaa";
export const WS2 = "aaaaaaaaaaaaaaaaaaaaaaab";
export const user = (id: string, role?: string): AuthUser => ({ id, email: `${id}@e.com`, role });
export const AUTHOR = user("0000000000000000000000a1");
export const OWNER = user("0000000000000000000000a2");
export const ADMIN = user("0000000000000000000000a3");
export const MEMBER = user("0000000000000000000000a4");
export const GUEST = user("0000000000000000000000a5");
export const STRANGER = user("0000000000000000000000a6");
export const PLATFORM_ADMIN = user("0000000000000000000000a7", "admin");

/** Vai trò nhóm giả — cùng ngữ nghĩa `IStudyWorkspaceRoles` (GUEST/người ngoài → null). */
export class FakeRoles implements IStudyWorkspaceRoles {
  readonly roles = new Map<string, StudyWorkspaceRole>();
  calls = 0;

  constructor() {
    for (const [u, role] of [[AUTHOR, "MEMBER"], [OWNER, "OWNER"], [ADMIN, "ADMIN"], [MEMBER, "MEMBER"]] as const) {
      this.roles.set(`${WS}:${u.id}`, role);
    }
  }

  roleOf(u: AuthUser, workspaceId: string): Promise<StudyWorkspaceRole | null> {
    this.calls += 1;
    return Promise.resolve(this.roles.get(`${workspaceId}:${u.id}`) ?? null);
  }
}

export class FakeReports implements ReportPort {
  readonly submitted: Array<SubmitReportInput & { reporterId: string }> = [];
  readonly closed: Array<{ targetId: string; resolution: string; level: string }> = [];

  submit(reporter: AuthUser, input: SubmitReportInput) {
    const dup = this.submitted.some((s) => s.reporterId === reporter.id && s.targetId === input.targetId);
    if (!dup) this.submitted.push({ ...input, reporterId: reporter.id });
    return Promise.resolve({ id: `r${this.submitted.length}`, status: "OPEN", createdAt: new Date(), alreadyReported: dup });
  }

  closeOpenByTarget(input: { targetId: string; resolution: string; level: string }) {
    this.closed.push({ targetId: input.targetId, resolution: input.resolution, level: input.level });
    return Promise.resolve({ closedCount: 1 });
  }
}

export function makeHarness() {
  const clock = { now: new Date("2026-09-21T03:00:00.000Z") };
  const now = () => new Date(clock.now);
  const sets = new InMemoryStudySetRepository();
  const items = new InMemoryStudyItemRepository();
  const roles = new FakeRoles();
  const access = new StudySetAccess(roles);
  const users = new InMemoryStudyUserDirectory();
  const assets = new InMemoryStudyAssetPort();
  const tagCache = new InMemoryStudyTagCache();
  const reports = new FakeReports();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox = new InMemoryStudyOutbox();
  // Kho đăng ký ôn dùng CHUNG với harness học tập (`makeLearningHarness`) — chi tiết bộ trả `srEnrolled` theo kho này.
  const enrollments = new InMemorySrEnrollmentRepository();
  const deps = { sets, items, tx: new InMemoryTxRunner(), assets, access, roles, users, outbox, enrollments, now };

  for (const u of [AUTHOR, OWNER, ADMIN, MEMBER]) users.users.set(u.id, { id: u.id, name: `Người ${u.id.slice(-2)}` });

  let seq = 0;
  /** Asset STUDY READY (mặc định ảnh) của `owner`, chưa gắn. */
  const readyAsset = (owner: AuthUser, kind: "IMAGE" | "AUDIO" = "IMAGE"): string => {
    seq += 1;
    const id = seq.toString(16).padStart(24, "0");
    assets.addReady(id, owner.id, kind);
    return id;
  };

  return {
    clock,
    sets,
    items,
    roles,
    access,
    users,
    assets,
    tagCache,
    reports,
    audit,
    outbox,
    enrollments,
    readyAsset,
    setService: new StudySetService(deps),
    listService: new StudySetListService(deps, tagCache),
    duplicateService: new StudySetDuplicateService(deps),
    itemQuery: new StudyItemQueryService(deps),
    bulk: new StudyItemBulkService(deps),
    reportService: new StudySetReportService(deps, reports),
    reportTarget: new StudySetReportTarget(deps),
    moderation: new StudySetModerationService(deps, audit, reports),
    content: new StudyContentReader(deps),
  };
}

export type Harness = ReturnType<typeof makeHarness>;

// ── Mẫu mục học (đầu vào PUT — dùng `unknown` để test cả dữ liệu sai) ───────────────────────────────────────────

export const flash = (key: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "FLASHCARD",
  clientItemKey: key,
  prompt: `Mặt trước ${key}`,
  answerText: `Mặt sau ${key}`,
  ...extra,
});

export const mc = (key: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "MULTIPLE_CHOICE",
  clientItemKey: key,
  prompt: `Câu hỏi ${key}`,
  options: [{ text: "A" }, { text: "B" }, { text: "C" }],
  correctOptionIndex: 1,
  ...extra,
});

export type ItemInputLike = StudyItemInput | Record<string, unknown>;

/** Tạo bộ PRIVATE của `AUTHOR` và trả `{ id, version }`. */
export async function seedSet(h: Harness, overrides: Partial<{ visibility: "PRIVATE" | "WORKSPACE" | "PUBLIC"; workspaceId: string; title: string }> = {}) {
  const visibility = overrides.visibility ?? "PRIVATE";
  const dto = await h.setService.create(AUTHOR, {
    title: overrides.title ?? "Từ vựng tiếng Anh",
    tags: [],
    visibility,
    workspaceId: overrides.workspaceId ?? (visibility === "WORKSPACE" ? WS : undefined),
    confirmPublic: visibility === "PUBLIC" ? true : undefined,
  });
  return { id: dto.id, version: dto.version };
}
