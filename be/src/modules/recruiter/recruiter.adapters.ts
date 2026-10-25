import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { runtimeConfig } from "../../core/config/runtime-config";
import { permissionService } from "../../core/permission";
import { invalidateDataPermissions } from "../../core/permission/data-permissions";
import type { AuthUser } from "../../core/types/express";
import { enqueue, toSafeJobId } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { redis } from "../../infrastructure/redis";
import { emitToUsers } from "../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../infrastructure/socket/socket.events";
import { eventKeys } from "../../shared/events/domain-events";
import { AuditService } from "../audit-log/audit-log.service";
import { createAssetLifecycleService, createAssetLinkService, createAssetUrlService } from "../assets/public";
import { createSkillBadgeReadPort } from "../career/public";
import { createContributionReadPort } from "../contribution/public";
import { createReportPort } from "../moderation/public";
import { createPortfolioLinkReader } from "../portfolio/public";
import type { TalentIndexSource } from "./domain/talent-index.builder";
import type { CompanyTier } from "./entities/recruiter.interface";
import type { ICompanyBlockRepository } from "./repositories/company-block.repository";
import type { IRecruiterDirectory } from "./repositories/recruiter-directory";
import type { TxHandle } from "./repositories/tx";
import { RECRUITER_REPORTS_QUEUE, TALENT_REBUILD_JOB } from "./services/recruiter-outbox-rows";
import type {
  CompanyUpdatedPayload,
  IRecruiterAccess,
  IRecruiterAssets,
  IRecruiterAudit,
  IRecruiterConfig,
  IRecruiterEmitter,
  IRecruiterReports,
  IRecruiterSearchCache,
  ITalentRebuildQueue,
  ITalentSource,
  OfferMessagePayload,
  OfferUpdatedPayload,
  RecruiterAssetInfo,
  RecruiterAuditInput,
} from "./services/recruiter.deps";

const SEARCH_VERSION_KEY = "talent:search:ver";

/** `SystemConfig recruiter.*` + cờ `career`; đọc lỗi/giá trị hỏng → mặc định của mã (KHÔNG làm hỏng nghiệp vụ). `enabled` mặc định TẮT. */
export class RuntimeRecruiterConfig implements IRecruiterConfig {
  async enabled(): Promise<boolean> {
    if (!(await runtimeConfig.isFeatureEnabled(MODULES.CAREER))) return false;
    return (await runtimeConfig.getEffective("recruiter"))["enabled"] === true;
  }

  async offerQuotaByTier(): Promise<Record<CompanyTier, number>> {
    const raw = (await runtimeConfig.getEffective("recruiter"))["offerQuotaByTier"];
    const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const pick = (t: CompanyTier): number => {
      const v = src[t];
      return typeof v === "number" && Number.isFinite(v) ? v : LIMITS.company.offerQuotaByTier[t];
    };
    return { FREE: pick("FREE"), PRO: pick("PRO"), ENTERPRISE: pick("ENTERPRISE") };
  }

  async consentVersion(): Promise<string> {
    const v = (await runtimeConfig.getEffective("recruiter"))["consentVersion"];
    return typeof v === "string" && v.length > 0 ? v : LIMITS.company.defaultConsentVersion;
  }
}

/** Cache tìm kiếm + phiên bản trên Redis; Redis lỗi/tắt → không cache (`version` 0, `bump` bỏ qua) chứ không làm hỏng nghiệp vụ. */
export class RedisSearchCache implements IRecruiterSearchCache {
  async version(): Promise<number> {
    try {
      const raw = await redis.get<number | string>(SEARCH_VERSION_KEY);
      const n = typeof raw === "string" ? Number(raw) : raw;
      return typeof n === "number" && Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  async bump(): Promise<void> {
    try {
      await redis.incr(SEARCH_VERSION_KEY);
    } catch (err) {
      logger.warn("[recruiter] Không tăng được talent:search:ver", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return await redis.get<T>(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await redis.set(key, value as object, ttlSeconds);
    } catch {
      // bỏ qua — lần sau tính lại
    }
  }
}

/** Vô hiệu cache quyền: quyền theo dữ liệu (`recruiter:*`, 60 s) + version scope COMPANY (cache `perm:*` của mọi thành viên) — không tăng `sessionVersion`. */
export class PermissionRecruiterAccess implements IRecruiterAccess {
  async invalidateUsers(userIds: readonly string[]): Promise<void> {
    await Promise.all([...new Set(userIds)].map((id) => invalidateDataPermissions(id)));
  }

  async bumpCompany(companyId: string): Promise<void> {
    await permissionService.bumpVersion({ type: "COMPANY", id: companyId });
  }
}

export class ServiceRecruiterAudit implements IRecruiterAudit {
  private readonly audit = new AuditService();

  async record(input: RecruiterAuditInput): Promise<void> {
    await this.audit.record(input);
  }
}

/** Cổng asset thật — CHỈ qua `@modules/assets/public`. Logo/JD gắn `scope NONE` (quyền đọc do resolver đăng ký ở `recruiter-integrations.ts`, fail-closed ở worker). */
export class PublicRecruiterAssets implements IRecruiterAssets {
  private readonly lifecycle = createAssetLifecycleService();
  private readonly links = createAssetLinkService();
  private readonly urls = createAssetUrlService();

  async get(assetId: string): Promise<RecruiterAssetInfo | null> {
    const found = await this.lifecycle.getForAttach(assetId);
    if (!found) return null;
    const a = found.asset;
    return { id: a.id, ownerId: a.ownerId, status: a.status, scope: a.scope, kind: a.kind, mime: a.mime };
  }

  async replaceLogo(tx: TxHandle, input: { companyId: string; assetId: string | null; actorId: string }): Promise<void> {
    if (input.assetId === null) {
      await this.links.detachAll(tx, { targetType: "COMPANY_LOGO", targetId: input.companyId });
      return;
    }
    await this.links.replace(tx, { targetType: "COMPANY_LOGO", targetId: input.companyId, assetId: input.assetId, scopeType: "NONE", actorId: input.actorId });
  }

  async attachJd(tx: TxHandle, input: { offerId: string; assetId: string; actorId: string }): Promise<void> {
    await this.links.attach(tx, { assetIds: [input.assetId], targetType: "JOB_OFFER", targetId: input.offerId, scopeType: "NONE", actorId: input.actorId });
  }

  async signedUrl(assetId: string, viewer: AuthUser): Promise<string | null> {
    try {
      return (await this.urls.getUrl(assetId, viewer, { variant: "ORIGINAL", disposition: "inline" })).url;
    } catch {
      return null;
    }
  }

  async signThumbs(assetIds: readonly string[]): Promise<Map<string, string>> {
    if (assetIds.length === 0) return new Map();
    try {
      const thumbs = await this.urls.signThumbnails([...assetIds]);
      return new Map([...thumbs.entries()].map(([id, t]) => [id, t.url]));
    } catch {
      return new Map();
    }
  }
}

/** Phát socket qua `emitToUsers` (chạy ở API lẫn worker nhờ cầu nối p0-03). Payload KHÔNG có nội dung lời mời/tin nhắn. */
export class SocketRecruiterEmitter implements IRecruiterEmitter {
  offerUpdated(userIds: readonly string[], payload: OfferUpdatedPayload): void {
    emitToUsers([...new Set(userIds)], SocketEvent.OFFER_UPDATED, payload);
  }

  offerMessageCreated(userIds: readonly string[], payload: OfferMessagePayload): void {
    emitToUsers([...new Set(userIds)], SocketEvent.OFFER_MESSAGE_CREATED, payload);
  }

  companyUpdated(userIds: readonly string[], payload: CompanyUpdatedPayload): void {
    emitToUsers([...new Set(userIds)], SocketEvent.COMPANY_UPDATED, payload);
  }
}

/** Nguồn dựng bản chiếu: đọc career/contribution/portfolio CHỈ qua cổng công khai của module đó (career/public, contribution/public, portfolio/public). */
export class PublicTalentSource implements ITalentSource {
  private readonly career = createSkillBadgeReadPort();
  private readonly contribution = createContributionReadPort();
  private readonly portfolio = createPortfolioLinkReader();

  constructor(
    private readonly directory: IRecruiterDirectory,
    private readonly blocks: ICompanyBlockRepository
  ) {}

  async load(userId: string, now: Date): Promise<TalentIndexSource | null> {
    const user = await this.directory.findUser(userId);
    if (!user) return null;
    const career = await this.career.career(userId);
    const base = { now, user: { id: user.id, name: user.name, status: user.status, avatarAssetId: user.avatarAssetId }, career };
    // Chưa đủ điều kiện (không ACTIVE / tắt Open to work) → không tốn thêm truy vấn nặng (builder trả null).
    if (user.status !== "ACTIVE" || !career.openToWork) return { ...base, badges: [], contribution: null, portfolioUrl: null, blockedCompanyIds: [] };
    const [badges, score, link, blocked] = await Promise.all([
      career.visibility.showSkills ? this.career.activeBadges(userId) : Promise.resolve([]),
      career.visibility.showContribution ? this.contribution.careerScore(userId) : Promise.resolve(null),
      this.portfolio.linkOf(userId),
      this.blocks.companyIdsOf(userId),
    ]);
    return { ...base, badges, contribution: score, portfolioUrl: link?.url ?? null, blockedCompanyIds: blocked };
  }
}

/** Xếp job dựng lại index có trễ; `jobId` gộp theo phút (BullMQ bỏ qua trùng) nên nhiều sự kiện liên tiếp chỉ một job. */
export class QueueTalentRebuild implements ITalentRebuildQueue {
  async enqueue(userId: string, delaySeconds: number, at: Date): Promise<void> {
    const bucket = at.toISOString().slice(0, 16).replace(/[-T:]/g, "");
    await enqueue(RECRUITER_REPORTS_QUEUE, TALENT_REBUILD_JOB, { userId, at: at.toISOString() }, { jobId: toSafeJobId(eventKeys.talentIndexRebuild(userId, bucket)), delay: delaySeconds * 1000 });
  }
}

/** Đóng báo cáo mở của đích COMPANY/JOB_OFFER qua cổng `moderation` — best-effort (lỗi chỉ log: việc tạm ngưng đã xong). */
export class ModerationRecruiterReports implements IRecruiterReports {
  private readonly port = createReportPort();

  async closeOpenByTarget(input: Parameters<IRecruiterReports["closeOpenByTarget"]>[0]): Promise<void> {
    try {
      await this.port.closeOpenByTarget({ targetType: input.targetType, targetId: input.targetId, actor: input.actor, resolution: input.resolution, level: "PLATFORM", reason: input.reason });
    } catch (err) {
      logger.warn("[recruiter] Không đóng được báo cáo mở", { targetType: input.targetType, targetId: input.targetId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
