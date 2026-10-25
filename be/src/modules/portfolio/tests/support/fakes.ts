/* eslint-disable @typescript-eslint/require-await -- bản giả cài đặt interface bất đồng bộ */
import type { OutboxEventInput } from "../../../../infrastructure/queue";
import type { ContributionCareerScore, ContributionMemberScore, ContributionReadPort } from "../../../../shared/ports/contribution-read.port";
import type { CloseReportsInput } from "../../../../shared/ports/report.port";
import type { SkillBadgeDto } from "../../../career/public";
import type { CareerVisibility, UserCareer } from "../../../career/public";
import type { NotifyInput } from "../../../notifications/public";
import type { MemberStats } from "../../entities/portfolio.interface";
import type { EligibleWorkspace, IPortfolioSourceRepository, UserRef, WorkspaceRef } from "../../repositories/portfolio-source.repository.interface";
import type { IPortfolioNotifier, IPortfolioOutbox, ITxRunner, TxHandle } from "../../repositories/tx";
import type { AuditInput, BuildUpdatedPayload, CachedResolution, IPortfolioAssets, IPortfolioAudit, IPortfolioCache, IPortfolioConfig, IPortfolioEmitter, IPortfolioStorage } from "../../services/portfolio.ports";
import { AppError, NotFoundError } from "../../../../core/exceptions";

export class FakeTx implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return fn({} as TxHandle);
  }
}

export class FakeOutbox implements IPortfolioOutbox {
  rows: OutboxEventInput[] = [];
  async add(_tx: TxHandle, event: OutboxEventInput): Promise<void> {
    if (this.rows.some((r) => r.dedupeKey === event.dedupeKey)) throw new Error(`dedupeKey trùng: ${event.dedupeKey}`);
    this.rows.push(event);
  }
  byJob(jobName: string): OutboxEventInput[] {
    return this.rows.filter((r) => r.jobName === jobName);
  }
}

export class FakeNotifier implements IPortfolioNotifier {
  calls: NotifyInput[] = [];
  async notify(_tx: TxHandle, input: NotifyInput): Promise<void> {
    this.calls.push(input);
  }
}

export class FakeAudit implements IPortfolioAudit {
  records: AuditInput[] = [];
  async record(input: AuditInput): Promise<void> {
    this.records.push(input);
  }
}

export class FakeEmitter implements IPortfolioEmitter {
  events: { userId: string; payload: BuildUpdatedPayload }[] = [];
  buildUpdated(userId: string, payload: BuildUpdatedPayload): void {
    this.events.push({ userId, payload });
  }
}

export class FakeConfig implements IPortfolioConfig {
  isActive = true;
  noindexByDefault = true;
  banned: string[] = [];
  async enabled(): Promise<boolean> {
    return this.isActive;
  }
  async active(): Promise<boolean> {
    return this.isActive;
  }
  async defaultNoindex(): Promise<boolean> {
    return this.noindexByDefault;
  }
  async bannedSlugTerms(): Promise<string[]> {
    return this.banned;
  }
}

export class FakeStorage implements IPortfolioStorage {
  objects = new Map<string, Buffer>();
  /** Đặt để `put` ném lỗi (mô phỏng sự cố storage); `putFailuresLeft` = số lần thất bại còn lại. */
  putFailuresLeft = 0;
  putCalls = 0;
  /** Chạy SAU khi ghi xong một object — mô phỏng sự kiện xen giữa lúc build (Ngừng công khai, gỡ vi phạm…). */
  afterPut: ((key: string) => Promise<void>) | null = null;
  async put(key: string, body: Buffer): Promise<void> {
    this.putCalls += 1;
    if (this.putFailuresLeft > 0) {
      this.putFailuresLeft -= 1;
      throw new Error("storage down");
    }
    this.objects.set(key, Buffer.from(body));
    if (this.afterPut) await this.afterPut(key);
  }
  async read(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }
  async deleteMany(keys: string[]): Promise<void> {
    keys.forEach((k) => this.objects.delete(k));
  }
  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
  html(key: string): string {
    return (this.objects.get(key) ?? Buffer.alloc(0)).toString("utf8");
  }
}

export class FakeCache implements IPortfolioCache {
  map = new Map<string, CachedResolution>();
  deleted: string[] = [];
  async get(slugKey: string): Promise<CachedResolution | null> {
    return this.map.get(slugKey) ?? null;
  }
  async set(slugKey: string, value: CachedResolution): Promise<void> {
    this.map.set(slugKey, value);
  }
  async del(slugKeys: readonly string[]): Promise<void> {
    for (const k of slugKeys) {
      this.map.delete(k);
      this.deleted.push(k);
    }
  }
}

export class FakeAssets implements IPortfolioAssets {
  /** assetId → nội dung ảnh gốc; có mặt = asset READY của chủ. */
  images = new Map<string, Buffer>();
  links: { targetId: string; assetId: string }[] = [];
  async assertUsableImage(_userId: string, assetId: string): Promise<void> {
    if (!this.images.has(assetId)) throw new NotFoundError("Không tìm thấy tệp");
    if (this.images.get(assetId)?.length === 0) throw new AppError("Loại tệp không được hỗ trợ", 415);
  }
  async readImage(assetId: string): Promise<Buffer | null> {
    return this.images.get(assetId) ?? null;
  }
  async replace(_tx: TxHandle, input: { userId: string; assetId: string; targetId: string }): Promise<void> {
    this.links = this.links.filter((l) => l.targetId !== input.targetId);
    this.links.push({ targetId: input.targetId, assetId: input.assetId });
  }
  async detachAll(_tx: TxHandle, targetId: string): Promise<void> {
    this.links = this.links.filter((l) => l.targetId !== targetId);
  }
}

export const DEFAULT_VISIBILITY: CareerVisibility = { showSkills: true, proofTitles: false, showContribution: true, showQuiz: false, appearInOthersPortfolios: false };

/** Cổng career giả: hồ sơ quyền riêng tư + huy hiệu còn hiệu lực theo người. */
export class FakeCareer {
  visibilityOf = new Map<string, CareerVisibility>();
  badges = new Map<string, SkillBadgeDto[]>();
  async career(userId: string): Promise<UserCareer> {
    return {
      userId,
      openToWork: false,
      openToWorkChangedAt: null,
      headline: null,
      preferredRoles: [],
      location: null,
      consentVersion: null,
      visibility: { ...(this.visibilityOf.get(userId) ?? DEFAULT_VISIBILITY) },
      updatedAt: null,
    };
  }
  async activeBadges(userId: string): Promise<SkillBadgeDto[]> {
    return [...(this.badges.get(userId) ?? [])];
  }
  addBadge(userId: string, name: string, unlockedAt = new Date("2026-08-01T00:00:00Z")): SkillBadgeDto {
    const badge: SkillBadgeDto = {
      skill: { id: `${name}-id`.padEnd(24, "0").slice(0, 24), code: name.toLowerCase(), name, description: null, category: "FRONTEND", icon: "badge" },
      unlockedAt: unlockedAt.toISOString(),
      revoked: false,
      revokedNotice: null,
      proof: { tasksDone: 3, storyPoints: 10, avgPeerScore: null },
    };
    this.badges.set(userId, [...(this.badges.get(userId) ?? []), badge]);
    return badge;
  }
  revokeBadge(userId: string, name: string): void {
    this.badges.set(userId, (this.badges.get(userId) ?? []).filter((b) => b.skill.name !== name));
  }
}

export class FakeContribution implements ContributionReadPort {
  scores = new Map<string, ContributionMemberScore>();
  failing = false;
  async memberScore(workspaceId: string, userId: string): Promise<ContributionMemberScore | null> {
    if (this.failing) throw new Error("contribution down");
    return this.scores.get(`${userId}:${workspaceId}`) ?? null;
  }
  async careerScore(): Promise<ContributionCareerScore | null> {
    return null;
  }
}

export class FakeReports {
  closed: CloseReportsInput[] = [];
  async closeOpenByTarget(input: CloseReportsInput): Promise<{ closedCount: number }> {
    this.closed.push(input);
    return { closedCount: 1 };
  }
}

/** Nguồn số liệu giả: đặt tay từng bảng theo khoá `userId:workspaceId`. */
export class FakeSource implements IPortfolioSourceRepository {
  eligible = new Map<string, EligibleWorkspace[]>();
  stats = new Map<string, MemberStats>();
  coAssigneesOf = new Map<string, string[]>();
  files = new Map<string, number>();
  workspaceRefs = new Map<string, WorkspaceRef>();
  activeMembers = new Set<string>();
  userRefs = new Map<string, UserRef>();
  consent = new Set<string>();
  failing: Set<keyof IPortfolioSourceRepository> = new Set();
  private guard(op: keyof IPortfolioSourceRepository): void {
    if (this.failing.has(op)) throw new Error(`${op} down`);
  }
  async eligibleWorkspaces(userId: string): Promise<EligibleWorkspace[]> {
    return [...(this.eligible.get(userId) ?? [])];
  }
  async memberStats(userId: string, workspaceId: string): Promise<MemberStats | null> {
    this.guard("memberStats");
    return this.stats.get(`${userId}:${workspaceId}`) ?? null;
  }
  async coAssignees(userId: string, workspaceId: string): Promise<string[]> {
    this.guard("coAssignees");
    return [...(this.coAssigneesOf.get(`${userId}:${workspaceId}`) ?? [])];
  }
  async filesUploaded(userId: string, workspaceId: string): Promise<number> {
    this.guard("filesUploaded");
    return this.files.get(`${userId}:${workspaceId}`) ?? 0;
  }
  async workspaces(ids: readonly string[]): Promise<Map<string, WorkspaceRef>> {
    return new Map(ids.flatMap((id) => (this.workspaceRefs.has(id) ? [[id, this.workspaceRefs.get(id) as WorkspaceRef] as const] : [])));
  }
  async activeMemberOf(userId: string, workspaceIds: readonly string[]): Promise<Set<string>> {
    return new Set(workspaceIds.filter((w) => this.activeMembers.has(`${userId}:${w}`)));
  }
  async users(ids: readonly string[]): Promise<Map<string, UserRef>> {
    this.guard("users");
    return new Map(ids.flatMap((id) => (this.userRefs.has(id) ? [[id, this.userRefs.get(id) as UserRef] as const] : [])));
  }
  async teammateConsent(userIds: readonly string[]): Promise<Set<string>> {
    this.guard("teammateConsent");
    return new Set(userIds.filter((id) => this.consent.has(id)));
  }
}
