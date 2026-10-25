import sharp from "sharp";
import { newObjectId } from "../../../../core/utils/object-id";
import { createPortfolioContainer, type PortfolioContainer, type PortfolioOverrides } from "../../portfolio.container";
import { InMemoryPortfolioBuildRepository } from "../../repositories/portfolio-build.repository.inmemory";
import { InMemoryPortfolioProjectRepository } from "../../repositories/portfolio-project.repository.inmemory";
import { InMemoryPortfolioSlugReservationRepository } from "../../repositories/portfolio-slug-reservation.repository.inmemory";
import { InMemoryPortfolioRepository } from "../../repositories/portfolio.repository.inmemory";
import type { MemberStats } from "../../entities/portfolio.interface";
import { FakeAssets, FakeAudit, FakeCache, FakeCareer, FakeConfig, FakeContribution, FakeEmitter, FakeNotifier, FakeOutbox, FakeReports, FakeSource, FakeStorage, FakeTx } from "./fakes";

export const BASE_URL = "https://superapp.test/p";
export const PREFIX = "portfolio/";

export interface Harness {
  c: PortfolioContainer;
  portfolios: InMemoryPortfolioRepository;
  projects: InMemoryPortfolioProjectRepository;
  builds: InMemoryPortfolioBuildRepository;
  reservations: InMemoryPortfolioSlugReservationRepository;
  source: FakeSource;
  outbox: FakeOutbox;
  notifier: FakeNotifier;
  config: FakeConfig;
  audit: FakeAudit;
  emitter: FakeEmitter;
  storage: FakeStorage;
  assets: FakeAssets;
  cache: FakeCache;
  contribution: FakeContribution;
  career: FakeCareer;
  reports: FakeReports;
  clock: { now: Date };
}

/** Đồ thị `portfolio` hoàn toàn in-memory (không Prisma/Redis/Storage/Socket) cho unit test service. `clock.now` chỉnh tay để kiểm hạn 30 ngày/lease. */
export function buildHarness(over: PortfolioOverrides = {}): Harness {
  const portfolios = new InMemoryPortfolioRepository();
  const projects = new InMemoryPortfolioProjectRepository();
  const builds = new InMemoryPortfolioBuildRepository();
  const reservations = new InMemoryPortfolioSlugReservationRepository();
  const source = new FakeSource();
  const outbox = new FakeOutbox();
  const notifier = new FakeNotifier();
  const config = new FakeConfig();
  const audit = new FakeAudit();
  const emitter = new FakeEmitter();
  const storage = new FakeStorage();
  const assets = new FakeAssets();
  const cache = new FakeCache();
  const contribution = new FakeContribution();
  const career = new FakeCareer();
  const reports = new FakeReports();
  const clock = { now: new Date("2026-09-26T03:00:00.000Z") };
  const now = () => new Date(clock.now);
  for (const repo of [portfolios, projects, builds, reservations]) repo.now = now;
  const c = createPortfolioContainer({
    portfolios,
    projects,
    builds,
    reservations,
    source,
    tx: new FakeTx(),
    outbox,
    notifier,
    config,
    audit,
    emitter,
    storage,
    assets,
    cache,
    contribution,
    career,
    reports,
    now,
    baseUrl: () => BASE_URL,
    storagePrefix: PREFIX,
    ...over,
  });
  return { c, portfolios, projects, builds, reservations, source, outbox, notifier, config, audit, emitter, storage, assets, cache, contribution, career, reports, clock };
}

export const stats = (over: Partial<MemberStats> = {}): MemberStats => ({
  tasksDone: 40,
  storyPointsX10: 620,
  tasksWithDue: 20,
  tasksOnTime: 18,
  reviewCount: 4,
  peerScoreWeightedSum: 34,
  ...over,
});

export interface SeededUser {
  id: string;
  name: string;
}

/** Người dùng ACTIVE trong nguồn giả. */
export function seedUser(h: Harness, name: string, over: { status?: string; avatarAssetId?: string | null } = {}): SeededUser {
  const id = newObjectId();
  h.source.userRefs.set(id, { id, name, status: over.status ?? "ACTIVE", avatarAssetId: over.avatarAssetId ?? null });
  return { id, name };
}

/** Nhóm có `owner` làm việc: số liệu + đồng đội + tệp; trả `workspaceId`. */
export function seedWorkspace(h: Harness, owner: string, name: string, over: { stats?: Partial<MemberStats>; teammates?: string[]; files?: number; archived?: boolean; member?: boolean } = {}): string {
  const workspaceId = newObjectId();
  h.source.workspaceRefs.set(workspaceId, { id: workspaceId, name, archived: over.archived ?? false });
  const s = stats(over.stats);
  h.source.stats.set(`${owner}:${workspaceId}`, s);
  h.source.eligible.set(owner, [...(h.source.eligible.get(owner) ?? []), { workspaceId, tasksDone: s.tasksDone }]);
  h.source.coAssigneesOf.set(`${owner}:${workspaceId}`, over.teammates ?? []);
  h.source.files.set(`${owner}:${workspaceId}`, over.files ?? 7);
  if (over.member !== false) h.source.activeMembers.add(`${owner}:${workspaceId}`);
  return workspaceId;
}

/** Ảnh PNG thật, nhỏ, để chạy qua `sharp` resize (kiểm đường ảnh thật, không mock). */
export async function tinyPng(color = "#ff0000"): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 24, channels: 3, background: color } }).png().toBuffer();
}

export interface PublishedFixture {
  user: SeededUser;
  workspaceId: string;
  portfolioId: string;
  slug: string;
  buildVersion: number;
}

/** Người dùng có hồ sơ + 1 dự án + giới thiệu, đã Publish và build xong (READY) — điểm xuất phát chung cho test build/sự kiện/công khai. */
export async function publishedFixture(h: Harness, over: { name?: string; teammates?: string[]; badges?: string[] } = {}): Promise<PublishedFixture> {
  const user = seedUser(h, over.name ?? "Nguyễn Văn An");
  const workspaceId = seedWorkspace(h, user.id, "Nhóm Đồ án kho", { teammates: over.teammates ?? [] });
  for (const badge of over.badges ?? []) h.career.addBadge(user.id, badge);
  await h.c.projectService.add(user.id, workspaceId);
  const overview = await h.c.portfolio.overview(user.id);
  const pf = overview.portfolio;
  if (!pf) throw new Error("hồ sơ chưa được tạo");
  await h.c.portfolio.update(user.id, {
    displayName: pf.displayName,
    headline: "Lập trình viên",
    bio: "Tôi thích xây sản phẩm.",
    avatarAssetId: null,
    links: [{ label: "GitHub", url: "https://github.com/an-dev" }],
    theme: { template: "CLASSIC", accent: "GREEN" },
    sections: pf.sections.map((s) => ({ kind: s.kind as "ABOUT", visible: s.visible, order: s.order })),
    seoIndexable: false,
    expectedVersion: pf.version,
  });
  const fresh = (await h.c.portfolio.overview(user.id)).portfolio;
  if (!fresh) throw new Error("hồ sơ biến mất");
  const { buildVersion } = await h.c.publish.publish(user.id, fresh.version);
  await h.c.build.run({ portfolioId: pf.id, buildVersion }, { retry: false, finalAttempt: false });
  return { user, workspaceId, portfolioId: pf.id, slug: fresh.slug, buildVersion };
}
