/**
 * Bộ dựng dùng chung cho test tích hợp `projects` (Mongo in-memory replset thật): seed user/workspace/membership,
 * dựng app Express, gọi API, dọn dữ liệu. KHÔNG phải test (không khớp `*.test.ts`).
 */
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { registerProjectsModule } from "../../index";
import projectsRoutes from "../../projects.routes";
import adminProjectsRoutes from "../../admin-projects.routes";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export interface Group {
  workspaceId: string;
  ids: Record<string, string>;
}

export function buildProjectsApp() {
  registerProjectsModule();
  const app = express();
  app.use(express.json());
  app.use("/api/v1", projectsRoutes);
  app.use("/api/v1", adminProjectsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

/** Tạo workspace + user + membership. `spec`: tên → vai trò. Workspace `ACTIVE`, chủ = OWNER đầu tiên. */
export async function seedGroup(spec: Record<string, Role>, status: "ACTIVE" | "ARCHIVED" = "ACTIVE"): Promise<Group> {
  const workspaceId = newObjectId();
  const ids: Record<string, string> = {};
  for (const [name, role] of Object.entries(spec)) {
    const id = newObjectId();
    ids[name] = id;
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${name}`, normalizedName: normalizeSearch(`Người ${name}`) } });
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: id, role, status: "ACTIVE" } });
  }
  const ownerId = ids[Object.keys(spec).find((n) => spec[n] === "OWNER") ?? Object.keys(spec)[0]];
  await prisma.workspace.create({
    data: { id: workspaceId, name: `Dự án ${workspaceId.slice(-6)}`, normalizedName: `du an ${workspaceId.slice(-6)}`, ownerId, status },
  });
  return { workspaceId, ids };
}

/** Xoá mọi dữ liệu do test tạo (theo workspace/user) — không đụng dữ liệu của test khác. */
export async function cleanupGroups(groups: Group[]): Promise<void> {
  if (groups.length === 0) return;
  const wsIds = groups.map((g) => g.workspaceId);
  const userIds = groups.flatMap((g) => Object.values(g.ids));
  const taskIds = (await prisma.task.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((t) => t.id);

  // p4-04: lô dời lịch nền (+ outbox job `task.reschedule-bulk`, aggregate = id lô) và cạnh phụ thuộc cũng phải dọn.
  const batchIds = (await prisma.rescheduleBatch.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((b) => b.id);
  // p4-05: lượt chấm/review (+ outbox có aggregate là lượt/review/bảng) và thông báo REVIEW_* nếu consumer đã chạy.
  const roundIds = (await prisma.taskReviewRound.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((r) => r.id);
  const reviewIds = (await prisma.taskReview.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((r) => r.id);
  const boardIds = (await prisma.board.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } })).map((b) => b.id);
  // Các lệnh xoá độc lập nhau (Mongo không có khoá ngoại) nên chạy SONG SONG: hook dọn của bảng 5.000 thẻ đã sát trần 5 s mặc định của
  // jest trên Mongo memory chậm — tuần tự cộng thêm vài lệnh của p4-04 là vượt.
  await Promise.all([
    prisma.outboxEvent.deleteMany({ where: { aggregateType: "Task", aggregateId: { in: taskIds } } }),
    prisma.outboxEvent.deleteMany({ where: { aggregateType: "RescheduleBatch", aggregateId: { in: batchIds } } }),
    prisma.outboxEvent.deleteMany({ where: { aggregateType: "TaskReviewRound", aggregateId: { in: roundIds } } }),
    prisma.outboxEvent.deleteMany({ where: { aggregateType: "TaskReview", aggregateId: { in: reviewIds } } }),
    prisma.outboxEvent.deleteMany({ where: { aggregateType: "Board", aggregateId: { in: boardIds } } }),
    prisma.taskReview.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.taskReviewRound.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.rescheduleBatch.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.taskDependency.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.taskActivity.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.taskComment.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.assetLink.deleteMany({ where: { scopeId: { in: wsIds } } }),
    prisma.asset.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.auditLog.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.task.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.label.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.board.deleteMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } }),
  ]);
  await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

/**
 * Mongo in-memory không chạy `prisma db push` nên KHÔNG có unique index — tạo tay đúng index mà schema khai
 * (`Label @@unique([boardId, normalizedName])`, `TaskComment @@unique([authorId, clientCommentId])`) để kiểm đường P2002
 * khi tạo nhãn/gửi bình luận trùng đồng thời.
 */
export async function ensureProjectIndexes(): Promise<void> {
  await prisma.$runCommandRaw({
    createIndexes: "Label",
    indexes: [{ key: { boardId: 1, normalizedName: 1 }, name: "Label_boardId_normalizedName_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "TaskComment",
    indexes: [{ key: { authorId: 1, clientCommentId: 1 }, name: "TaskComment_authorId_clientCommentId_key", unique: true }],
  });
  // p4-04: `TaskDependency @@unique([predecessorId, successorId])`, `RescheduleBatch.activeKey @unique`.
  await prisma.$runCommandRaw({
    createIndexes: "TaskDependency",
    indexes: [{ key: { predecessorId: 1, successorId: 1 }, name: "TaskDependency_predecessorId_successorId_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "RescheduleBatch",
    indexes: [{ key: { activeKey: 1 }, name: "RescheduleBatch_activeKey_key", unique: true }],
  });
  // p4-05: một lượt mở/thẻ (`activeKey`), `(taskId, round)`, `(roundId, reviewerId)`.
  await prisma.$runCommandRaw({
    createIndexes: "TaskReviewRound",
    indexes: [
      { key: { activeKey: 1 }, name: "TaskReviewRound_activeKey_key", unique: true },
      { key: { taskId: 1, round: 1 }, name: "TaskReviewRound_taskId_round_key", unique: true },
    ],
  });
  await prisma.$runCommandRaw({
    createIndexes: "TaskReview",
    indexes: [{ key: { roundId: 1, reviewerId: 1 }, name: "TaskReview_roundId_reviewerId_key", unique: true }],
  });
}

/** Asset READY sẵn sàng để gắn vào thẻ/bình luận (scope `TASK`/`TASK_COMMENT`) — không qua upload thật. */
export async function seedAsset(
  workspaceId: string,
  ownerId: string,
  over: { scope?: "TASK" | "TASK_COMMENT" | "MESSAGE"; status?: "READY" | "PROCESSING"; originalName?: string } = {}
): Promise<string> {
  const id = newObjectId();
  await prisma.asset.create({
    data: {
      id,
      ownerId,
      workspaceId,
      scope: over.scope ?? "TASK",
      kind: "FILE",
      status: over.status ?? "READY",
      uploadMethod: "API_PUT",
      mime: "application/pdf",
      declaredSize: 2048,
      size: 2048,
      originalName: over.originalName ?? `tai-lieu-${id.slice(-4)}.pdf`,
      storageKey: `test/${id}/original.pdf`,
      lastUnlinkedAt: null,
      deletedAt: null,
    },
  });
  return id;
}

export type Api = (
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  token: string,
  body?: unknown,
  headers?: Record<string, string>
) => request.Test;

export function makeApi(app: ReturnType<typeof buildProjectsApp>): Api {
  return (method, path, token, body, headers) => {
    let req = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(headers ?? {})) req = req.set(k, v);
    return body === undefined ? req : req.send(body as object);
  };
}

export const mutationId = (): string => `mutation-${newObjectId().slice(0, 12)}`;

/**
 * Seed nhanh một chuỗi phụ thuộc `root → T001 → T002 → … → T<n>` (bỏ qua API để tạo hàng trăm thẻ trong tích tắc): `root` hạn `rootDue`,
 * mỗi thẻ sau bắt đầu/hết hạn cùng ngày `firstDay + i` (giờ 09:00–17:00 múi +07). Trả id thẻ theo thứ tự (root đứng đầu). Ghi null tường
 * minh cho các trường sau này lọc bằng null (giống `PrismaTaskRepository.create`).
 */
export async function seedChain(
  boardId: string,
  workspaceId: string,
  columnId: string,
  createdBy: string,
  n: number,
  opts: { rootDue?: string; assigneeId?: string } = {}
): Promise<string[]> {
  const ids = Array.from({ length: n + 1 }, () => newObjectId());
  const day = (offset: number): string => new Date(Date.UTC(2026, 9, 4 + offset)).toISOString().slice(0, 10); // 2026-10-04 + offset
  await prisma.task.createMany({
    data: ids.map((id, i) => ({
      id,
      boardId,
      workspaceId,
      columnId,
      columnKind: "TODO" as const,
      position: `a${String(i).padStart(4, "0")}`,
      title: i === 0 ? "Gốc" : `T${String(i).padStart(3, "0")}`,
      normalizedTitle: i === 0 ? "goc" : `t${String(i).padStart(3, "0")}`,
      assigneeIds: i === 1 && opts.assigneeId ? [opts.assigneeId] : [],
      labelIds: [],
      startDate: i === 0 ? new Date("2026-10-01T02:00:00Z") : new Date(`${day(i - 1)}T02:00:00Z`), // 09:00 +07
      dueDate: i === 0 ? new Date(opts.rootDue ?? "2026-10-03T10:00:00Z") : new Date(`${day(i - 1)}T10:00:00Z`), // 17:00 +07
      dueVersion: 1,
      completedAt: null,
      completionCount: 0,
      createdBy,
      clientTaskId: null,
      description: null,
      storyPoints: null,
      deletedFromColumnId: null,
      deletedAt: null,
      deletedBy: null,
      blockedByCount: i === 0 ? 0 : 1,
      blockingCount: i === n ? 0 : 1,
    })),
  });
  await prisma.taskDependency.createMany({
    data: ids.slice(1).map((successorId, i) => ({
      workspaceId,
      boardId,
      predecessorId: ids[i],
      successorId,
      type: "FINISH_TO_START" as const,
      createdBy,
    })),
  });
  return ids;
}
