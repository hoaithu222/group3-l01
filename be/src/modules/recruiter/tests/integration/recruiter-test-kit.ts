/**
 * Bộ dựng test tích hợp `recruiter` (Mongo in-memory replset thật): seed người/công ty/ứng viên, dựng app Express với container dùng kho Prisma THẬT + transaction + outbox +
 * `notify` + cache quyền thật; chỉ thay audit/asset/socket/cấu hình/hàng đợi/cổng career-contribution-portfolio/báo cáo bằng bản giả (biên hạ tầng). KHÔNG phải test (không khớp `*.test.ts`).
 */
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { createAdminRecruiterRouter } from "../../admin-recruiter.routes";
import { buildTalentIndexDoc, type TalentIndexSource } from "../../domain/talent-index.builder";
import { emailDomainOf, nameKeyOf, offerOpenKey, taxCodeKeyOf } from "../../domain/company-keys";
import type { CompanyStatus, CompanyTier } from "../../entities/recruiter.interface";
import { registerRecruiterNotificationTypes } from "../../notifications/recruiter.notification-types";
import { buildRecruiterServices, createRecruiterDeps, type RecruiterContainer } from "../../recruiter.container";
import { createRecruiterRouter } from "../../recruiter.routes";
import { registerCompanyScopeResolver } from "../../services/company-scope.resolver";
import type { RecruiterDeps } from "../../services/recruiter.deps";
import { FakeAssets, FakeAudit, FakeBadges, FakeCareerReader, FakeConfig, FakeEmitter, FakeProofs, FakeRebuildQueue, FakeReports, FakeSource } from "../support/fakes";

export interface Clock {
  now: Date;
}

export interface Rig {
  c: RecruiterContainer;
  app: express.Express;
  clock: Clock;
  audit: FakeAudit;
  assets: FakeAssets;
  emitter: FakeEmitter;
  config: FakeConfig;
  queue: FakeRebuildQueue;
  reports: FakeReports;
  source: FakeSource;
  proofs: FakeProofs;
  badges: FakeBadges;
  career: FakeCareerReader;
}

export function buildRig(over: Partial<RecruiterDeps> = {}): Rig {
  registerRecruiterNotificationTypes();
  const clock: Clock = { now: new Date("2026-09-15T05:00:00Z") };
  const audit = new FakeAudit();
  const assets = new FakeAssets();
  const emitter = new FakeEmitter();
  const config = new FakeConfig();
  const queue = new FakeRebuildQueue();
  const reports = new FakeReports();
  const source = new FakeSource();
  const proofs = new FakeProofs();
  const badges = new FakeBadges();
  const career = new FakeCareerReader();
  const deps = createRecruiterDeps({ audit, assets, emitter, config, rebuildQueue: queue, reports, source, proofs, badges, careerReader: career, now: () => new Date(clock.now), ...over });
  const c: RecruiterContainer = { deps, services: buildRecruiterServices(deps) };
  registerCompanyScopeResolver(deps);
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createRecruiterRouter(c));
  app.use("/api/v1", createAdminRecruiterRouter(c));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return { c, app, clock, audit, assets, emitter, config, queue, reports, source, proofs, badges, career };
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

export async function seedUser(name: string, over: { status?: "ACTIVE" | "LOCKED" | "ANONYMIZED"; role?: string; email?: string } = {}): Promise<string> {
  const id = newObjectId();
  await prisma.user.create({ data: { id, email: over.email ?? `${id}@e.com`, name, normalizedName: normalizeSearch(name), role: over.role ?? "user", status: over.status ?? "ACTIVE" } });
  return id;
}

export interface SeededCompany {
  id: string;
  ownerId: string;
}

/** Công ty + OWNER trực tiếp qua Prisma (bỏ qua service để dựng nhanh trạng thái tuỳ ý). */
export async function seedCompany(over: { name?: string; status?: CompanyStatus; tier?: CompanyTier; ownerId?: string; quota?: number | null; taxCode?: string | null } = {}): Promise<SeededCompany> {
  const id = newObjectId();
  const ownerId = over.ownerId ?? (await seedUser("Chủ doanh nghiệp"));
  const name = over.name ?? `Công ty ${id.slice(-6)}`;
  await prisma.company.create({
    data: {
      id,
      name,
      normalizedName: normalizeSearch(name),
      nameKey: over.status === "REJECTED" ? `rejected:${id}` : nameKeyOf(name),
      taxCode: over.taxCode ?? null,
      taxCodeKey: over.status === "REJECTED" ? `none:${id}` : taxCodeKeyOf(over.taxCode, id),
      website: "https://acme.test",
      emailDomain: emailDomainOf("https://acme.test"),
      description: null,
      logoAssetId: null,
      industry: null,
      sizeRange: null,
      tier: over.tier ?? "FREE",
      offerQuotaOverride: over.quota ?? null,
      status: over.status ?? "APPROVED",
      statusReason: null,
      reviewedBy: null,
      reviewedAt: null,
      reportedCount: 0,
      createdBy: ownerId,
      version: 1,
    },
  });
  await prisma.companyMember.create({ data: { companyId: id, userId: ownerId, role: "OWNER", status: "ACTIVE", activeKey: ownerId, invitedBy: null, removedAt: null } });
  return { id, ownerId };
}

export async function seedMember(companyId: string, userId: string, role: "OWNER" | "RECRUITER" = "RECRUITER"): Promise<void> {
  await prisma.companyMember.create({ data: { companyId, userId, role, status: "ACTIVE", activeKey: userId, invitedBy: null, removedAt: null } });
}

export interface TalentSeed {
  name?: string;
  skills?: Array<{ id?: string; code: string; name?: string }>;
  contribution?: { pctX10: number; workspaces: number } | null;
  showSkills?: boolean;
  showContribution?: boolean;
  headline?: string;
  roles?: string[];
  location?: string;
  portfolioUrl?: string | null;
  blocked?: string[];
}

/** Sinh viên Open to work: `User` + `UserCareer` (openToWork) + bản chiếu `TalentSearchIndex` dựng bằng builder THẬT (đúng luật lọc quyền riêng tư). */
export async function seedTalent(t: TalentSeed = {}): Promise<{ id: string; doc: NonNullable<ReturnType<typeof buildTalentIndexDoc>> }> {
  const id = await seedUser(t.name ?? "Nguyễn Văn An");
  const visibility = { showSkills: t.showSkills ?? true, proofTitles: false, showContribution: t.showContribution ?? true, showQuiz: false, appearInOthersPortfolios: false };
  await prisma.userCareer.create({
    data: { userId: id, openToWork: true, openToWorkChangedAt: new Date(), headline: t.headline ?? "Lập trình viên", preferredRoles: t.roles ?? ["Frontend Developer"], location: t.location ?? "Hà Nội", consentVersion: "v1", visibility },
  });
  const src: TalentIndexSource = {
    now: new Date(),
    user: { id, name: t.name ?? "Nguyễn Văn An", status: "ACTIVE", avatarAssetId: null },
    career: { openToWork: true, headline: t.headline ?? "Lập trình viên", preferredRoles: t.roles ?? ["Frontend Developer"], location: t.location ?? "Hà Nội", updatedAt: null, visibility: { showSkills: visibility.showSkills, showContribution: visibility.showContribution } },
    badges: (t.skills ?? [{ code: "reactjs" }]).map((s) => ({ skill: { id: s.id ?? newObjectId(), code: s.code, name: s.name ?? s.code, icon: s.code } })),
    contribution: t.contribution === undefined ? { pctX10: 800, workspaces: 2 } : t.contribution,
    portfolioUrl: t.portfolioUrl ?? null,
    blockedCompanyIds: t.blocked ?? [],
  };
  const doc = buildTalentIndexDoc(src);
  if (!doc) throw new Error("seedTalent: bản chiếu rỗng");
  await prisma.talentSearchIndex.create({ data: { ...doc, skills: doc.skills } });
  return { id, doc };
}

/** Lời mời trực tiếp qua Prisma (dựng trạng thái tuỳ ý). */
export async function seedOffer(o: { companyId: string; recruiterId: string; studentId: string; status?: "SENT" | "READ" | "INTERESTED" | "DECLINED" | "WITHDRAWN" | "EXPIRED"; expiresAt?: Date }): Promise<string> {
  const id = newObjectId();
  const open = !o.status || ["SENT", "READ", "INTERESTED"].includes(o.status);
  await prisma.jobOffer.create({
    data: {
      id,
      companyId: o.companyId,
      recruiterId: o.recruiterId,
      studentId: o.studentId,
      title: "Thực tập React",
      message: "Chúng tôi muốn mời bạn tham gia dự án frontend của công ty.",
      employmentType: "INTERNSHIP",
      location: null,
      jdAssetId: null,
      status: o.status ?? "SENT",
      activeKey: open ? offerOpenKey(o.companyId, o.studentId) : `closed:${id}`,
      clientRequestId: `gen:${id}`,
      sharedEmail: null,
      declineReason: null,
      threadLocked: false,
      studentUnread: 0,
      companyUnread: 0,
      reportedCount: 0,
      sentAt: new Date("2026-09-10T00:00:00Z"),
      readAt: null,
      respondedAt: null,
      withdrawnAt: null,
      expiresAt: o.expiresAt ?? new Date("2026-10-10T00:00:00Z"),
      lastMessageAt: null,
      version: 1,
    },
  });
  return id;
}

/** Unique index theo `schema.prisma` (Mongo in-memory không chạy `db push`) — để kiểm đường P2002 khi đua ghi/trùng khoá. Tên theo quy ước Prisma `<Model>_<fields>_key`. */
export async function ensureRecruiterIndexes(): Promise<void> {
  const unique = (collection: string, keys: Record<string, 1>, name: string) => prisma.$runCommandRaw({ createIndexes: collection, indexes: [{ key: keys, name, unique: true }] });
  await unique("Company", { nameKey: 1 }, "Company_nameKey_key");
  await unique("Company", { taxCodeKey: 1 }, "Company_taxCodeKey_key");
  await unique("CompanyMember", { activeKey: 1 }, "CompanyMember_activeKey_key");
  await unique("CompanyMember", { companyId: 1, userId: 1 }, "CompanyMember_companyId_userId_key");
  await unique("CompanyOfferUsage", { companyId: 1, period: 1 }, "CompanyOfferUsage_companyId_period_key");
  await unique("JobOffer", { activeKey: 1 }, "JobOffer_activeKey_key");
  await unique("JobOffer", { recruiterId: 1, clientRequestId: 1 }, "JobOffer_recruiterId_clientRequestId_key");
  await unique("JobOfferMessage", { authorId: 1, clientMessageId: 1 }, "JobOfferMessage_authorId_clientMessageId_key");
  await unique("TalentSearchIndex", { userId: 1 }, "TalentSearchIndex_userId_key");
  await unique("TalentProfileView", { companyId: 1, studentId: 1, dayKey: 1 }, "TalentProfileView_companyId_studentId_dayKey_key");
  await unique("CompanyBlock", { userId: 1, companyId: 1 }, "CompanyBlock_userId_companyId_key");
  await unique("OutboxEvent", { dedupeKey: 1 }, "OutboxEvent_dedupeKey_key");
}

/** Dọn dữ liệu của MỘT lượt test (DB memory dùng chung mọi suite): theo id người dùng/công ty đã seed. */
export async function cleanup(userIds: string[], companyIds: string[]): Promise<void> {
  const offers = await prisma.jobOffer.findMany({ where: { OR: [{ companyId: { in: companyIds } }, { studentId: { in: userIds } }] }, select: { id: true } });
  const offerIds = offers.map((o) => o.id);
  await Promise.all([
    prisma.jobOfferMessage.deleteMany({ where: { offerId: { in: offerIds } } }),
    prisma.jobOffer.deleteMany({ where: { id: { in: offerIds } } }),
    prisma.companyOfferUsage.deleteMany({ where: { companyId: { in: companyIds } } }),
    prisma.companyMember.deleteMany({ where: { OR: [{ companyId: { in: companyIds } }, { userId: { in: userIds } }] } }),
    prisma.talentSearchIndex.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.talentProfileView.deleteMany({ where: { OR: [{ companyId: { in: companyIds } }, { studentId: { in: userIds } }] } }),
    prisma.companyBlock.deleteMany({ where: { OR: [{ companyId: { in: companyIds } }, { userId: { in: userIds } }] } }),
    prisma.userCareer.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.notificationRecipient.deleteMany({ where: { recipientId: { in: userIds } } }),
    prisma.notification.deleteMany({ where: { OR: [{ type: { startsWith: "job-offer." } }, { type: { startsWith: "company." } }] } }),
    prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: { in: [...offerIds, ...companyIds, ...userIds] } }, { aggregateType: { in: ["JobOffer", "Company", "UserCareer"] } }] } }),
    prisma.report.deleteMany({ where: { targetId: { in: [...offerIds, ...companyIds] } } }),
  ]);
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
