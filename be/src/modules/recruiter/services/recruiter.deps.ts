import type { AuthUser } from "../../../core/types/express";
import type { SkillBadgeDto, SkillProofDto, UserCareer } from "../../career/public";
import type { CompanyTier, TalentIndexDoc } from "../entities/recruiter.interface";
import type { ICareerSettingsRepository } from "../repositories/career-settings.repository";
import type { ICompanyBlockRepository } from "../repositories/company-block.repository";
import type { ICompanyMemberRepository } from "../repositories/company-member.repository.interface";
import type { ICompanyOfferUsageRepository } from "../repositories/company-offer-usage.repository";
import type { ICompanyRepository } from "../repositories/company.repository.interface";
import type { IJobOfferMessageRepository } from "../repositories/job-offer-message.repository";
import type { IJobOfferRepository } from "../repositories/job-offer.repository.interface";
import type { IRecruiterDirectory } from "../repositories/recruiter-directory";
import type { ITalentProfileViewRepository } from "../repositories/talent-profile-view.repository";
import type { ITalentSearchIndexRepository } from "../repositories/talent-search-index.repository";
import type { IRecruiterNotifier, IRecruiterOutbox, ITxRunner, TxHandle } from "../repositories/tx";
import type { TalentIndexSource } from "../domain/talent-index.builder";

/** Cấu hình runtime (`SystemConfig recruiter.*` + cờ `career`) — service không import `runtimeConfig`. */
export interface IRecruiterConfig {
  /** `recruiter.enabled` (mặc định TẮT) VÀ cờ `career`. */
  enabled(): Promise<boolean>;
  offerQuotaByTier(): Promise<Record<CompanyTier, number>>;
  /** Phiên bản chính sách dữ liệu hiện hành. */
  consentVersion(): Promise<string>;
}

/** Cache tìm kiếm + phiên bản (`talent:search:ver`) — Redis; lỗi Redis không được làm hỏng nghiệp vụ. */
export interface IRecruiterSearchCache {
  version(): Promise<number>;
  /** Tăng phiên bản → mọi kết quả cache cũ vô hiệu. Best-effort. */
  bump(): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

/** Vô hiệu cache quyền: quyền theo dữ liệu (`recruiter:*`) + version scope `COMPANY` (mọi thành viên thấy đổi trạng thái ≤ vài trăm ms). */
export interface IRecruiterAccess {
  invalidateUsers(userIds: readonly string[]): Promise<void>;
  bumpCompany(companyId: string): Promise<void>;
}

export interface RecruiterAuditInput {
  actorId: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface IRecruiterAudit {
  record(input: RecruiterAuditInput): Promise<void>;
}

export interface RecruiterAssetInfo {
  id: string;
  ownerId: string;
  status: string;
  scope: string;
  kind: string;
  mime: string;
}

/** Cổng asset (chỉ qua `@modules/assets/public`): kiểm asset trước khi gắn + `AssetLink COMPANY_LOGO`/`JOB_OFFER` cùng transaction + URL ký. */
export interface IRecruiterAssets {
  get(assetId: string): Promise<RecruiterAssetInfo | null>;
  /** Thay logo (gỡ link cũ, gắn mới) — `assetId = null` chỉ gỡ. */
  replaceLogo(tx: TxHandle, input: { companyId: string; assetId: string | null; actorId: string }): Promise<void>;
  attachJd(tx: TxHandle, input: { offerId: string; assetId: string; actorId: string }): Promise<void>;
  /** URL ký cho MỘT asset (caller đã kiểm quyền) — `null` khi lỗi/không có. */
  signedUrl(assetId: string, viewer: AuthUser): Promise<string | null>;
  /** Thumbnail hàng loạt (danh sách) — caller đã kiểm quyền đọc đối tượng gắn. */
  signThumbs(assetIds: readonly string[]): Promise<Map<string, string>>;
}

export interface OfferUpdatedPayload {
  offerId: string;
  companyId: string;
  status: string;
  threadLocked: boolean;
}

export interface OfferMessagePayload {
  offerId: string;
  messageId: string;
  side: string;
  createdAt: string;
}

export interface CompanyUpdatedPayload {
  companyId: string;
  status: string;
  tier: string;
}

/** Phát socket (`emitToUsers` — chạy ở cả API lẫn worker). Payload KHÔNG có nội dung lời mời/tin nhắn. */
export interface IRecruiterEmitter {
  offerUpdated(userIds: readonly string[], payload: OfferUpdatedPayload): void;
  offerMessageCreated(userIds: readonly string[], payload: OfferMessagePayload): void;
  companyUpdated(userIds: readonly string[], payload: CompanyUpdatedPayload): void;
}

/** Nguồn dựng `TalentSearchIndex` qua cổng career/contribution/portfolio (không import nội bộ module đó). */
export interface ITalentSource {
  load(userId: string, now: Date): Promise<TalentIndexSource | null>;
}

/** Xếp job dựng lại index có trễ (debounce) — trong worker/sink (ngoài transaction). */
export interface ITalentRebuildQueue {
  enqueue(userId: string, delaySeconds: number, at: Date): Promise<void>;
}

export interface IRecruiterReports {
  closeOpenByTarget(input: { targetType: "COMPANY" | "JOB_OFFER"; targetId: string; actor: { id: string; role?: string }; resolution: "CONTENT_REMOVED" | "NO_ACTION"; reason: string }): Promise<void>;
}

export interface IRecruiterProofPort {
  proofFor(viewer: AuthUser, targetId: string, skillId: string): Promise<SkillProofDto>;
}

/** Hồ sơ nghề nghiệp đầy đủ (mặc định khi chưa có bản ghi) — qua cổng `career/public`. */
export interface ICareerReader {
  career(userId: string): Promise<UserCareer>;
}

export interface IActiveBadgeReader {
  /** Huy hiệu CÒN hiệu lực của người này (mới → cũ) — chỉ số liệu tổng, không tiêu đề task. */
  activeBadges(userId: string): Promise<SkillBadgeDto[]>;
}

/** Toàn bộ phụ thuộc của service recruiter (DI qua `recruiter.container.ts`); test thay từng phần. */
export interface RecruiterDeps {
  companies: ICompanyRepository;
  members: ICompanyMemberRepository;
  usage: ICompanyOfferUsageRepository;
  offers: IJobOfferRepository;
  messages: IJobOfferMessageRepository;
  index: ITalentSearchIndexRepository;
  views: ITalentProfileViewRepository;
  blocks: ICompanyBlockRepository;
  careerSettings: ICareerSettingsRepository;
  directory: IRecruiterDirectory;
  tx: ITxRunner;
  outbox: IRecruiterOutbox;
  notifier: IRecruiterNotifier;
  config: IRecruiterConfig;
  searchCache: IRecruiterSearchCache;
  access: IRecruiterAccess;
  audit: IRecruiterAudit;
  assets: IRecruiterAssets;
  emitter: IRecruiterEmitter;
  source: ITalentSource;
  rebuildQueue: ITalentRebuildQueue;
  reports: IRecruiterReports;
  proofs: IRecruiterProofPort;
  badges: IActiveBadgeReader;
  careerReader: ICareerReader;
  now: () => Date;
  newId: () => string;
}

export type { TalentIndexDoc };
