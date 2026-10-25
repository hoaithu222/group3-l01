import type { AuthUser } from "../../../../core/types/express";
import type { SkillBadgeDto, SkillProofDto, UserCareer } from "../../../career/public";
import { DEFAULT_CAREER_VISIBILITY } from "../../../career/public";
import type { TalentIndexSource } from "../../domain/talent-index.builder";
import type { CompanyTier } from "../../entities/recruiter.interface";
import type {
  CompanyUpdatedPayload,
  IActiveBadgeReader,
  ICareerReader,
  IRecruiterAssets,
  IRecruiterAudit,
  IRecruiterConfig,
  IRecruiterEmitter,
  IRecruiterProofPort,
  IRecruiterReports,
  ITalentRebuildQueue,
  ITalentSource,
  OfferMessagePayload,
  OfferUpdatedPayload,
  RecruiterAssetInfo,
  RecruiterAuditInput,
} from "../../services/recruiter.deps";
import type { TxHandle } from "../../repositories/tx";

/** Biên hạ tầng giả cho test `recruiter` (audit/asset/socket/cấu hình/hàng đợi/cổng career) — kho Prisma, transaction, outbox và `notify` là bản THẬT. */
export class FakeAudit implements IRecruiterAudit {
  readonly records: RecruiterAuditInput[] = [];

  async record(input: RecruiterAuditInput): Promise<void> {
    this.records.push(input);
  }

  of(action: string): RecruiterAuditInput[] {
    return this.records.filter((r) => r.action === action);
  }
}

export class FakeAssets implements IRecruiterAssets {
  readonly assets = new Map<string, RecruiterAssetInfo>();
  readonly logos: Array<{ companyId: string; assetId: string | null }> = [];
  readonly jds: Array<{ offerId: string; assetId: string }> = [];

  put(a: Partial<RecruiterAssetInfo> & { id: string; ownerId: string }): void {
    this.assets.set(a.id, { status: "READY", scope: "COMPANY", kind: "IMAGE", mime: "image/png", ...a });
  }

  async get(assetId: string): Promise<RecruiterAssetInfo | null> {
    return this.assets.get(assetId) ?? null;
  }

  async replaceLogo(_tx: TxHandle, input: { companyId: string; assetId: string | null }): Promise<void> {
    this.logos.push({ companyId: input.companyId, assetId: input.assetId });
  }

  async attachJd(_tx: TxHandle, input: { offerId: string; assetId: string }): Promise<void> {
    this.jds.push({ offerId: input.offerId, assetId: input.assetId });
  }

  async signedUrl(assetId: string, _viewer: AuthUser): Promise<string | null> {
    return `https://files.test/${assetId}`;
  }

  async signThumbs(assetIds: readonly string[]): Promise<Map<string, string>> {
    return new Map(assetIds.map((id) => [id, `https://files.test/thumb/${id}`]));
  }
}

export class FakeEmitter implements IRecruiterEmitter {
  readonly offerUpdates: Array<{ userIds: string[]; payload: OfferUpdatedPayload }> = [];
  readonly messages: Array<{ userIds: string[]; payload: OfferMessagePayload }> = [];
  readonly companyUpdates: Array<{ userIds: string[]; payload: CompanyUpdatedPayload }> = [];

  offerUpdated(userIds: readonly string[], payload: OfferUpdatedPayload): void {
    this.offerUpdates.push({ userIds: [...userIds], payload });
  }

  offerMessageCreated(userIds: readonly string[], payload: OfferMessagePayload): void {
    this.messages.push({ userIds: [...userIds], payload });
  }

  companyUpdated(userIds: readonly string[], payload: CompanyUpdatedPayload): void {
    this.companyUpdates.push({ userIds: [...userIds], payload });
  }
}

export class FakeConfig implements IRecruiterConfig {
  on = true;
  quotas: Record<CompanyTier, number> = { FREE: 5, PRO: 50, ENTERPRISE: 500 };
  consent = "v1";

  async enabled(): Promise<boolean> {
    return this.on;
  }

  async offerQuotaByTier(): Promise<Record<CompanyTier, number>> {
    return this.quotas;
  }

  async consentVersion(): Promise<string> {
    return this.consent;
  }
}

export class FakeRebuildQueue implements ITalentRebuildQueue {
  readonly calls: Array<{ userId: string; delaySeconds: number }> = [];

  async enqueue(userId: string, delaySeconds: number): Promise<void> {
    this.calls.push({ userId, delaySeconds });
  }
}

export class FakeReports implements IRecruiterReports {
  readonly closed: Array<{ targetType: string; targetId: string; reason: string }> = [];

  async closeOpenByTarget(input: { targetType: "COMPANY" | "JOB_OFFER"; targetId: string; reason: string }): Promise<void> {
    this.closed.push({ targetType: input.targetType, targetId: input.targetId, reason: input.reason });
  }
}

/** Nguồn dựng index giả: test đặt dữ liệu nguồn từng người (`set`) rồi kiểm bản chiếu. */
export class FakeSource implements ITalentSource {
  readonly data = new Map<string, TalentIndexSource | null>();

  set(userId: string, src: TalentIndexSource | null): void {
    this.data.set(userId, src);
  }

  async load(userId: string): Promise<TalentIndexSource | null> {
    return this.data.get(userId) ?? null;
  }
}

export class FakeProofs implements IRecruiterProofPort {
  readonly calls: Array<{ viewerId: string; targetId: string; skillId: string }> = [];

  async proofFor(viewer: AuthUser, targetId: string, skillId: string): Promise<SkillProofDto> {
    this.calls.push({ viewerId: viewer.id, targetId, skillId });
    return {
      skill: { id: skillId, code: "reactjs", name: "ReactJS", description: null, category: "FRONTEND", icon: "react" },
      unlockedAt: "2026-09-01T00:00:00.000Z",
      revoked: false,
      tasksDone: 12,
      storyPoints: 40,
      avgPeerScore: 8.5,
      tasks: [{ title: null, storyPoints: 5, completedAt: "2026-09-02T00:00:00.000Z", reviewScore: 9, workspaceName: null }],
      verifiedBy: "SYSTEM",
    } as unknown as SkillProofDto;
  }
}

export class FakeBadges implements IActiveBadgeReader {
  readonly byUser = new Map<string, SkillBadgeDto[]>();

  async activeBadges(userId: string): Promise<SkillBadgeDto[]> {
    return this.byUser.get(userId) ?? [];
  }
}

export class FakeCareerReader implements ICareerReader {
  readonly byUser = new Map<string, UserCareer>();

  async career(userId: string): Promise<UserCareer> {
    return (
      this.byUser.get(userId) ?? {
        userId,
        openToWork: false,
        openToWorkChangedAt: null,
        headline: null,
        preferredRoles: [],
        location: null,
        consentVersion: null,
        visibility: { ...DEFAULT_CAREER_VISIBILITY },
        updatedAt: null,
      }
    );
  }
}

export const badgeDto = (skillId: string, code: string, name: string): SkillBadgeDto => ({
  skill: { id: skillId, code, name, description: null, category: "FRONTEND", icon: code } as SkillBadgeDto["skill"],
  unlockedAt: "2026-09-01T00:00:00.000Z",
  revoked: false,
  revokedNotice: null,
  proof: { tasksDone: 10, storyPoints: 30, avgPeerScore: 8 },
});
