/**
 * Bộ dựng dùng chung cho test tích hợp `contribution` (Mongo in-memory replset thật): seed nhóm/bảng/thẻ/hoạt động, dựng app Express với container thật (chỉ
 * thay cổng hàng đợi/socket/audit bằng bản giả), gọi API, dọn dữ liệu. KHÔNG phải test (không khớp `*.test.ts`).
 */
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { registerAssetTargetReadResolver } from "../../../../shared/ports/asset-target-access.port";
import { registerProjectsModule } from "../../../projects";
import { createContributionContainer, type ContributionContainer, type ContributionOverrides } from "../../contribution.container";
import { createContributionAdminRouter } from "../../contribution.admin.routes";
import { createContributionRouter } from "../../contribution.routes";
import { registerContributionNotificationTypes } from "../../notifications/contribution.notification-types";
import { FakeAudit, FakeEmitter, FakeQueue } from "../support/fakes";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export interface Group {
  workspaceId: string;
  boardId: string;
  ids: Record<string, string>;
}

export interface TestRig {
  container: ContributionContainer;
  queue: FakeQueue;
  audit: FakeAudit;
  emitter: FakeEmitter;
  app: express.Express;
}

/** Container thật (Prisma) + cổng hàng đợi/audit/socket giả; `overrides` để ghi đè thêm (đồng hồ, PDF…). */
export function buildRig(overrides: ContributionOverrides = {}): TestRig {
  registerProjectsModule();
  registerContributionNotificationTypes();
  const queue = new FakeQueue();
  const audit = new FakeAudit();
  const emitter = new FakeEmitter();
  const container = createContributionContainer({ queue, audit, emitter, ...overrides });
  registerAssetTargetReadResolver("CONTRIBUTION_EXPORT", container.assetReadResolver);
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createContributionRouter(container));
  app.use("/api/v1", createContributionAdminRouter(container));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { container, queue, audit, emitter, app };
}

export function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

const COLUMNS = [
  { id: "c_todo0001", title: "Cần làm", kind: "TODO" as const, order: 0, wipLimit: null },
  { id: "c_done0001", title: "Xong", kind: "DONE" as const, order: 1, wipLimit: null },
];

/** Workspace + user + membership + MỘT bảng. `spec`: tên → vai trò (người OWNER đầu tiên là chủ nhóm và người tạo bảng). */
export async function seedGroup(spec: Record<string, Role>, opts: { archivedBoard?: boolean } = {}): Promise<Group> {
  const workspaceId = newObjectId();
  const ids: Record<string, string> = {};
  for (const [name, role] of Object.entries(spec)) {
    const id = newObjectId();
    ids[name] = id;
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${name}`, normalizedName: normalizeSearch(`Người ${name}`) } });
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: id, role, status: "ACTIVE" } });
  }
  const ownerId = ids[Object.keys(spec).find((n) => spec[n] === "OWNER") ?? Object.keys(spec)[0]];
  await prisma.workspace.create({ data: { id: workspaceId, name: `Nhóm ${workspaceId.slice(-6)}`, normalizedName: `nhom ${workspaceId.slice(-6)}`, ownerId, status: "ACTIVE" } });
  const board = await prisma.board.create({
    data: { workspaceId, name: "Sprint 1", normalizedName: "sprint 1", description: null, columns: COLUMNS, createdBy: ownerId, archivedAt: opts.archivedBoard ? new Date() : null },
  });
  return { workspaceId, boardId: board.id, ids };
}

/** Bỏ trường `null` bắt buộc của model `Task` — tạo thẻ tối thiểu (giống `PrismaTaskRepository.create`: null tường minh cho trường lọc bằng null). */
export async function seedTask(g: Group, over: { id?: string; title?: string; assignees?: string[]; storyPoints?: number | null; dueDate?: Date | null; done?: boolean; completedAt?: Date | null; deletedAt?: Date | null } = {}): Promise<string> {
  const id = over.id ?? newObjectId();
  await prisma.task.create({
    data: {
      id,
      boardId: g.boardId,
      workspaceId: g.workspaceId,
      columnId: over.done ? "c_done0001" : "c_todo0001",
      columnKind: over.done ? "DONE" : "TODO",
      position: `a${id.slice(-4)}`,
      title: over.title ?? "Thẻ",
      normalizedTitle: normalizeSearch(over.title ?? "Thẻ"),
      assigneeIds: over.assignees ?? [],
      labelIds: [],
      startDate: null,
      dueDate: over.dueDate ?? null,
      storyPoints: over.storyPoints === undefined ? null : over.storyPoints,
      dueVersion: 0,
      completedAt: over.completedAt ?? null,
      completionCount: over.done ? 1 : 0,
      createdBy: Object.values(g.ids)[0],
      clientTaskId: null,
      description: null,
      deletedFromColumnId: null,
      deletedAt: over.deletedAt ?? null,
      deletedBy: null,
    },
  });
  return id;
}

/** Tạo các unique index mà `schema.prisma` khai (Mongo in-memory không chạy `db push`) — để kiểm đường P2002 khi ghi đè/đua. */
export async function ensureContributionIndexes(): Promise<void> {
  const unique = (collection: string, keys: Record<string, 1>, name: string) =>
    prisma.$runCommandRaw({ createIndexes: collection, indexes: [{ key: keys, name, unique: true }] });
  await unique("ContributionTaskFact", { taskId: 1 }, "ContributionTaskFact_taskId_key");
  await unique("ContributionReviewFact", { reviewId: 1 }, "ContributionReviewFact_reviewId_key");
  await unique("ContributionBoardState", { boardId: 1 }, "ContributionBoardState_boardId_key");
  await unique("ContributionSnapshot", { boardId: 1, userId: 1, periodKey: 1 }, "ContributionSnapshot_boardId_userId_periodKey_key");
  await unique("ActivityDaily", { boardId: 1, userId: 1, date: 1 }, "ActivityDaily_boardId_userId_date_key");
  await unique("ContributionExport", { dedupeKey: 1 }, "ContributionExport_dedupeKey_key");
  await unique("ContributionExport", { verifyCode: 1 }, "ContributionExport_verifyCode_key");
}

/** Xoá mọi dữ liệu do test tạo (theo workspace/user) — không đụng dữ liệu của test khác. */
export async function cleanupGroups(groups: Group[]): Promise<void> {
  if (groups.length === 0) return;
  const wsIds = groups.map((g) => g.workspaceId);
  const userIds = groups.flatMap((g) => Object.values(g.ids));
  const boardIds = groups.map((g) => g.boardId);
  const exportIds = (await prisma.contributionExport.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((e) => e.id);
  await Promise.all([
    prisma.contributionTaskFact.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.contributionReviewFact.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.contributionSnapshot.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.contributionBoardState.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.activityDaily.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.contributionExport.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.assetLink.deleteMany({ where: { OR: [{ targetId: { in: exportIds } }, { scopeId: { in: wsIds } }] } }),
    prisma.asset.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...exportIds, ...boardIds] } } }),
    prisma.taskActivity.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.taskComment.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.taskReview.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.task.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.board.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.auditLog.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } }),
  ]);
  await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export type Api = (method: "get" | "post" | "put" | "patch" | "delete", path: string, token: string, body?: unknown) => request.Test;

export function makeApi(app: express.Express): Api {
  return (method, path, token, body) => {
    const req = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
}

/** Sự kiện `task.completed` chuẩn (đúng hình dạng producer p3-02) cho `ContributionFactsService`. */
export function completedPayload(g: Group, taskId: string, n: number, over: Record<string, unknown> = {}) {
  return {
    event: "task.completed" as const,
    taskId,
    boardId: g.boardId,
    workspaceId: g.workspaceId,
    actorId: Object.values(g.ids)[0],
    assigneeIds: [] as string[],
    storyPoints: 3 as number | null,
    dueDate: null as string | null,
    completedAt: new Date().toISOString(),
    onTime: false,
    completionCount: n,
    taskCreatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    labelNames: [] as string[],
    review: { enabled: false, approved: false },
    ...over,
  };
}
