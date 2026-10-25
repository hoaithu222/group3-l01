/**
 * Bộ dựng test tích hợp `career` (Mongo in-memory replset thật): seed người/nhóm/thẻ/lượt chấm, dựng app Express với container THẬT (Prisma + tx + outbox +
 * notify) — chỉ thay audit/socket/cổng limiter bằng bản giả. KHÔNG phải test (không khớp `*.test.ts`).
 */
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { createCareerAdminRouter } from "../../career.admin.routes";
import { createCareerContainer, type CareerContainer } from "../../career.container";
import { createCareerRouter } from "../../career.routes";
import { registerCareerNotificationTypes } from "../../notifications/career.notification-types";
import { FakeAudit, FakeConfig, FakeEmitter, FakeGate } from "../support/fakes";

export interface Rig {
  c: CareerContainer;
  audit: FakeAudit;
  gate: FakeGate;
  app: express.Express;
}

export function buildRig(): Rig {
  registerCareerNotificationTypes();
  const audit = new FakeAudit();
  const gate = new FakeGate();
  const c = createCareerContainer({ audit, gate, emitter: new FakeEmitter(), config: new FakeConfig() });
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createCareerRouter(c));
  app.use("/api/v1", createCareerAdminRouter(c));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { c, audit, gate, app };
}

export const tokenFor = (userId: string, role = "user"): string => JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });

export type Api = (method: "get" | "post" | "put" | "patch" | "delete", path: string, token: string, body?: unknown) => request.Test;

export function makeApi(app: express.Express): Api {
  return (method, path, token, body) => {
    const req = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
}

export async function seedUser(name: string): Promise<string> {
  const id = newObjectId();
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: normalizeSearch(name) } });
  return id;
}

export async function seedWorkspace(name: string, members: Record<string, "OWNER" | "MEMBER" | "GUEST">): Promise<string> {
  const workspaceId = newObjectId();
  const ownerId = Object.keys(members)[0];
  await prisma.workspace.create({ data: { id: workspaceId, name, normalizedName: normalizeSearch(name), ownerId, status: "ACTIVE" } });
  for (const [userId, role] of Object.entries(members)) await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status: "ACTIVE" } });
  return workspaceId;
}

/** Thẻ ở DONE lần `n` (tối thiểu như `PrismaTaskRepository.create` — null TƯỜNG MINH cho trường lọc bằng null). */
export async function seedDoneTask(workspaceId: string, title: string, assignees: string[], n = 1): Promise<string> {
  const id = newObjectId();
  await prisma.task.create({
    data: {
      id,
      boardId: newObjectId(),
      workspaceId,
      columnId: "c_done0001",
      columnKind: "DONE",
      position: `a${id.slice(-4)}`,
      title,
      normalizedTitle: normalizeSearch(title),
      assigneeIds: assignees,
      labelIds: [],
      startDate: null,
      dueDate: null,
      storyPoints: 5,
      dueVersion: 0,
      completedAt: new Date(),
      completionCount: n,
      createdBy: assignees[0],
      clientTaskId: null,
      description: null,
      deletedFromColumnId: null,
      deletedAt: null,
      deletedBy: null,
    },
  });
  return id;
}

export function completedPayload(taskId: string, workspaceId: string, assignees: string[], over: Record<string, unknown> = {}) {
  return {
    event: "task.completed",
    taskId,
    boardId: newObjectId(),
    workspaceId,
    actorId: assignees[0],
    assigneeIds: assignees,
    storyPoints: 5,
    dueDate: null,
    completedAt: new Date().toISOString(),
    onTime: false,
    completionCount: 1,
    taskCreatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    labelNames: ["React JS"],
    review: { enabled: false, approved: false },
    ...over,
  };
}

/** Unique index theo `schema.prisma` (Mongo in-memory không chạy `db push`) — để kiểm đường P2002 khi đua ghi. */
export async function ensureCareerIndexes(): Promise<void> {
  const unique = (collection: string, keys: Record<string, 1>, name: string) =>
    prisma.$runCommandRaw({ createIndexes: collection, indexes: [{ key: keys, name, unique: true }] });
  await unique("SkillDefinition", { code: 1 }, "SkillDefinition_code_key");
  await unique("UserSkillProgress", { userId: 1, skillId: 1 }, "UserSkillProgress_userId_skillId_key");
  await unique("UserSkillTaskCredit", { userId: 1, skillId: 1, taskId: 1 }, "UserSkillTaskCredit_userId_skillId_taskId_key");
  await unique("UserSkillBadge", { userId: 1, skillId: 1 }, "UserSkillBadge_userId_skillId_key");
  await unique("UserCareer", { userId: 1 }, "UserCareer_userId_key");
}

export async function cleanup(userIds: string[], workspaceIds: string[], skillIds: string[]): Promise<void> {
  await Promise.all([
    prisma.userSkillTaskCredit.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { skillId: { in: skillIds } }] } }),
    prisma.userSkillProgress.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { skillId: { in: skillIds } }] } }),
    prisma.userSkillBadge.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { skillId: { in: skillIds } }] } }),
    prisma.userCareer.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.notificationRecipient.deleteMany({ where: { recipientId: { in: userIds } } }),
    prisma.notification.deleteMany({ where: { type: { startsWith: "career." } } }),
    prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: { in: [...userIds, ...skillIds] } }, { aggregateType: "SkillDefinition" }] } }),
    prisma.task.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.taskReview.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.label.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
  ]);
  await prisma.skillDefinition.deleteMany({ where: { id: { in: skillIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
