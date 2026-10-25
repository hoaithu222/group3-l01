/**
 * Bộ dựng test tích hợp `portfolio` (Mongo in-memory replset thật): seed người/nhóm/số liệu đóng góp/tệp, dựng app Express với container dùng kho Prisma THẬT + transaction + outbox +
 * notify thật; chỉ thay storage/cache/socket/audit/asset/cổng career-contribution/báo cáo bằng bản giả (biên hạ tầng). KHÔNG phải test (không khớp `*.test.ts`).
 */
import express from "express";
import helmet from "helmet";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { createAdminPortfolioRouter } from "../../admin-portfolio.routes";
import { registerPortfolioNotificationTypes } from "../../notifications/portfolio.notification-types";
import { createPortfolioContainer, type PortfolioContainer, type PortfolioOverrides } from "../../portfolio.container";
import { createPortfolioRouter } from "../../portfolio.routes";
import { createPublicPortfolioRouter } from "../../public-portfolio.routes";
import { FakeAssets, FakeAudit, FakeCache, FakeCareer, FakeConfig, FakeContribution, FakeEmitter, FakeReports, FakeStorage } from "../support/fakes";

export const BASE_URL = "https://superapp.test/p";

export interface Rig {
  c: PortfolioContainer;
  app: express.Express;
  storage: FakeStorage;
  cache: FakeCache;
  emitter: FakeEmitter;
  audit: FakeAudit;
  config: FakeConfig;
  assets: FakeAssets;
  career: FakeCareer;
  contribution: FakeContribution;
  reports: FakeReports;
}

export function buildRig(over: PortfolioOverrides = {}): Rig {
  registerPortfolioNotificationTypes();
  const storage = new FakeStorage();
  const cache = new FakeCache();
  const emitter = new FakeEmitter();
  const audit = new FakeAudit();
  const config = new FakeConfig();
  const assets = new FakeAssets();
  const career = new FakeCareer();
  const contribution = new FakeContribution();
  const reports = new FakeReports();
  const c = createPortfolioContainer({ storage, cache, emitter, audit, config, assets, career, contribution, reports, baseUrl: () => BASE_URL, storagePrefix: "portfolio/", ...over });
  const app = express();
  // Giống `app.ts`: helmet đặt CSP/Referrer-Policy mặc định TRƯỚC — route công khai phải ĐÈ được (kiểm ở public routes test).
  app.use(helmet({ referrerPolicy: { policy: "strict-origin-when-cross-origin" }, frameguard: { action: "deny" } }));
  app.use("/p", createPublicPortfolioRouter(c));
  app.use(express.json());
  app.use("/api/v1", createPortfolioRouter(c));
  app.use("/api/v1", createAdminPortfolioRouter(c));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { c, app, storage, cache, emitter, audit, config, assets, career, contribution, reports };
}

export const tokenFor = (userId: string, role = "user"): string => JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });

export type Api = (method: "get" | "post" | "put" | "patch" | "delete", path: string, token: string | null, body?: unknown, headers?: Record<string, string>) => request.Test;

export function makeApi(app: express.Express): Api {
  return (method, path, token, body, headers = {}) => {
    let req = request(app)[method](`/api/v1${path}`);
    if (token) req = req.set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
    return body === undefined ? req : req.send(body as object);
  };
}

export async function seedUser(name: string, over: { status?: "ACTIVE" | "LOCKED" | "ANONYMIZED" } = {}): Promise<string> {
  const id = newObjectId();
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: normalizeSearch(name), status: over.status ?? "ACTIVE" } });
  return id;
}

export async function seedWorkspace(name: string, ownerId: string, over: { archived?: boolean } = {}): Promise<string> {
  const id = newObjectId();
  await prisma.workspace.create({ data: { id, name, normalizedName: normalizeSearch(name), ownerId, status: over.archived ? "ARCHIVED" : "ACTIVE" } });
  await prisma.workspaceMembership.create({ data: { workspaceId: id, userId: ownerId, role: "OWNER", status: "ACTIVE" } });
  return id;
}

/** Snapshot `ALL` của p4-06 (nguồn số liệu) + fact thẻ cho từng nhóm đồng đội (nguồn "làm cùng"). 40 task, 62 điểm, đúng hạn 18/20, review 4 lượt TB 8,5. */
export async function seedContribution(workspaceId: string, userId: string, teammates: string[] = [], over: { tasksDone?: number } = {}): Promise<void> {
  const boardId = newObjectId();
  await prisma.contributionSnapshot.create({
    data: {
      workspaceId,
      boardId,
      userId,
      periodKey: "ALL",
      storyPointsDone: 62,
      tasksDone: over.tasksDone ?? 40,
      unestimatedTasks: 0,
      tasksWithDue: 20,
      tasksOnTime: 18,
      tasksLate: 2,
      reviewCount: 4,
      peerScoreAvg: 8.5,
      components: { points: 0.9, onTime: 0.9, peer: 0.85 },
      score: 91,
      share: 31,
      weightsUsed: { points: 0.4, onTime: 0.3, peer: 0.3 },
      teamTasksDone: 120,
      teamStoryPoints: 200,
      formulaVersion: 1,
      computedAt: new Date(),
    },
  });
  await prisma.contributionTaskFact.create({
    data: { taskId: newObjectId(), boardId, workspaceId, assigneeIds: [userId, ...teammates], storyPoints: 5, dueDate: null, completedAt: new Date(), completionCount: 1, active: true, reviewApproved: null },
  });
}

export async function seedResources(workspaceId: string, userId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await prisma.resource.create({
      data: { workspaceId, folderKey: "root", assetId: newObjectId(), name: `tep-${i}.pdf`, normalizedName: `tep-${i}.pdf`, type: "PDF", mime: "application/pdf", size: 1000, tags: [], uploadedBy: userId },
    });
  }
}

/** Đồng ý hiện tên trong portfolio của đồng đội (`career.visibility.appearInOthersPortfolios`). */
export async function setConsent(userId: string, on: boolean): Promise<void> {
  await prisma.userCareer.create({
    data: { userId, openToWork: false, preferredRoles: [], visibility: { showSkills: true, proofTitles: false, showContribution: false, showQuiz: false, appearInOthersPortfolios: on } },
  });
}

/** Unique index theo `schema.prisma` (Mongo in-memory không chạy `db push`) — để kiểm đường P2002 khi đua ghi. */
export async function ensurePortfolioIndexes(): Promise<void> {
  const unique = (collection: string, keys: Record<string, 1>, name: string) => prisma.$runCommandRaw({ createIndexes: collection, indexes: [{ key: keys, name, unique: true }] });
  await unique("Portfolio", { userId: 1 }, "Portfolio_userId_key");
  await unique("Portfolio", { slugKey: 1 }, "Portfolio_slugKey_key");
  await unique("PortfolioProject", { portfolioId: 1, workspaceId: 1 }, "PortfolioProject_portfolioId_workspaceId_key");
  await unique("PortfolioBuild", { portfolioId: 1, buildVersion: 1 }, "PortfolioBuild_portfolioId_buildVersion_key");
  await unique("PortfolioSlugReservation", { slugKey: 1 }, "PortfolioSlugReservation_slugKey_key");
  await unique("OutboxEvent", { dedupeKey: 1 }, "OutboxEvent_dedupeKey_key");
}

export async function cleanup(userIds: string[], workspaceIds: string[]): Promise<void> {
  const portfolios = await prisma.portfolio.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const ids = portfolios.map((p) => p.id);
  await Promise.all([
    prisma.portfolioProject.deleteMany({ where: { portfolioId: { in: ids } } }),
    prisma.portfolioBuild.deleteMany({ where: { portfolioId: { in: ids } } }),
    prisma.portfolioSlugReservation.deleteMany({ where: { portfolioId: { in: ids } } }),
    prisma.contributionSnapshot.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.contributionTaskFact.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.resource.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
    prisma.userCareer.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.notificationRecipient.deleteMany({ where: { recipientId: { in: userIds } } }),
    prisma.notification.deleteMany({ where: { type: { startsWith: "portfolio." } } }),
    prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: { in: [...ids, ...userIds] } }, { aggregateType: "Portfolio" }] } }),
    prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } }),
  ]);
  await prisma.portfolio.deleteMany({ where: { id: { in: ids } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
