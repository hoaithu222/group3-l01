import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { normalizeSearch } from "../../../core/utils/normalize";
import { LIMITS } from "../../../core/constants/limits";
import { AppError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { ResolvedAccess } from "../../../core/permission";
import { RuntimeGuestConfig, type IGuestConfig } from "../../../core/config/guest-config";
import { resolveGuestPolicy, type GuestPolicy } from "../../../core/constants/guest-policy";
import { AuditService } from "../../audit-log/audit-log.service";
import type { AssetLinkService } from "../../assets/public";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { TemplateApplyResult, TemplatePlan, WorkspaceTemplatePort } from "../../../shared/ports/workspace-template.port";
import { logger } from "../../../infrastructure/logger";
import type { IWorkspaceRepository } from "../repositories/workspace.repository.interface";
import type { Workspace, WorkspaceListItem, WorkspaceMeSettings } from "../entities/workspace.interface";
import type { CreateWorkspaceDto, UpdateWorkspaceDto, WorkspaceMeDto, WorkspaceSettingsDto } from "../dtos";
import { getUnreadSummaries } from "./unread-summary.port";
import { notifyWorkspaceNotifyModeChanged } from "./notify-mode-changed.port";
import { computeWorkspaceActions } from "./workspace-permission.resolver";
import { systemDefaultTimeZone } from "../../../core/config/workspace-timezone";
import { toWorkspaceDetail, toWorkspaceListItem, type WorkspaceDetail } from "./workspace.presenter";

const DEFAULT_CHANNEL_NAME = "Chung";
const auditService = new AuditService();

/**
 * Ảnh đại diện + ảnh bìa nhóm chỉ nhận asset scope `AVATAR` (allowlist ảnh + trần 2 MiB của `mimePolicy`) — cùng luật với
 * ảnh đại diện người dùng; ảnh bìa hiển thị bản gốc nên trần dung lượng giữ trang nhóm nhẹ. Sai scope → 415 `ASSET_001`.
 */
const WORKSPACE_IMAGE_SCOPES = ["AVATAR"] as const;
type WorkspaceImageTarget = "WORKSPACE_AVATAR" | "WORKSPACE_COVER";
/** `Prisma.TransactionClient` lấy qua chữ ký `AssetLinkService` — service không import kiểu Prisma trực tiếp. */
type Tx = Parameters<AssetLinkService["detach"]>[0];

/** `PATCH /workspaces/:id/settings` trả về (p3-04) — app vá lại `WorkspaceDetail` bằng đúng ba trường này. */
export interface WorkspaceSettingsResult {
  joinPolicy: "OPEN" | "APPROVAL";
  guestPolicy: GuestPolicy;
  version: number;
}

export interface CreateWorkspaceResult {
  workspace: WorkspaceDetail;
  defaultChannel: { id: string; name: string };
  /** p5-04 — chỉ có khi tạo từ mẫu: kênh đã tạo/bỏ qua; `failed` = nhóm đã tạo nhưng áp mẫu lỗi (áp lại ở cài đặt nhóm). */
  template?: TemplateApplyResult & { failed?: boolean };
}

/** `create/list/get/patch/me` — be.md §5.1/§5.2 (archive/restore/transfer/leave ở `workspace-lifecycle.service.ts`). */
export class WorkspaceService {
  constructor(
    private readonly repo: IWorkspaceRepository,
    private readonly channelBootstrap: ChannelBootstrapPort,
    private readonly assetLinks: AssetLinkService,
    /** p3-04 — mặc định chính sách khách (`SystemConfig limits.guest`); unit test cũ không truyền → `RuntimeGuestConfig` fail-open về mặc định. */
    private readonly guestConfig: IGuestConfig = new RuntimeGuestConfig(),
    /** p5-04 — tạo nhóm từ mẫu; không truyền → `templateCode` bị từ chối (unit test cũ). */
    private readonly templates?: WorkspaceTemplatePort
  ) {}

  async create(userId: string, dto: CreateWorkspaceDto): Promise<CreateWorkspaceResult> {
    const activeCount = await this.repo.countActiveMembershipsForUser(userId);
    if (activeCount >= LIMITS.workspace.perUserMax) {
      throw new AppError(ErrorMessages[ErrorCode.WS_006], 409, ErrorCode.WS_006);
    }

    // p5-04: kiểm mẫu + khoá kênh TRƯỚC khi ghi bất cứ thứ gì (`TPL_001` không để lại nhóm rỗng).
    if (dto.templateCode && !this.templates) throw new AppError(ErrorMessages[ErrorCode.TPL_001], 404, ErrorCode.TPL_001);
    const templatePlan = dto.templateCode && this.templates ? await this.templates.plan(dto.templateCode, dto.channelKeys) : null;

    const { workspace, channel } = await withTransaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: dto.name,
          normalizedName: normalizeSearch(dto.name),
          description: dto.description,
          ownerId: userId,
          // null TƯỜNG MINH (Prisma+Mongo không khớp `{ timezone: null }` với trường vắng mặt) — null = theo mặc định hệ thống.
          timezone: dto.timezone ?? null,
          // Cột ảnh ghi CÙNG transaction với `AssetLink` bên dưới — presenter đọc cột để dựng URL, không truy vấn link.
          avatarAssetId: dto.avatarAssetId ?? null,
          coverAssetId: dto.coverAssetId ?? null,
          coverPreset: dto.coverPreset ?? null,
        },
      });

      await tx.workspaceMembership.create({
        data: { workspaceId: created.id, userId, role: "OWNER" },
      });

      const channel = await this.channelBootstrap.createDefault(tx, {
        workspaceId: created.id,
        createdBy: userId,
        name: DEFAULT_CHANNEL_NAME,
      });

      const workspace = await tx.workspace.update({
        where: { id: created.id },
        data: { defaultChannelId: channel.id },
      });

      await this.attachImage(tx, "WORKSPACE_AVATAR", workspace.id, dto.avatarAssetId, userId);
      await this.attachImage(tx, "WORKSPACE_COVER", workspace.id, dto.coverAssetId, userId);

      await outbox.add(tx, {
        type: "workspace.created",
        aggregateType: "Workspace",
        aggregateId: workspace.id,
        queue: "notifications",
        jobName: "workspace.events",
        dedupeKey: `workspace.created:${workspace.id}`,
        payload: { event: "created", workspaceId: workspace.id, ownerId: userId },
      });

      return { workspace, channel };
    });

    const access: ResolvedAccess = {
      visible: true,
      role: "OWNER",
      actions: computeWorkspaceActions("OWNER", workspace.status),
    };
    const template = templatePlan ? await this.applyTemplate(workspace.id, userId, templatePlan) : undefined;
    return {
      workspace: toWorkspaceDetail(
        workspace as unknown as Workspace,
        1,
        access,
        { role: "OWNER", isFavorite: false, position: null, notifyMode: "INHERIT" },
        await this.policyOf(workspace),
        await systemDefaultTimeZone()
      ),
      defaultChannel: channel,
      ...(template && { template }),
    };
  }

  /** Áp mẫu SAU khi nhóm đã commit — lỗi không làm hỏng việc tạo nhóm (người dùng áp lại được ở cài đặt nhóm). */
  private async applyTemplate(workspaceId: string, actorId: string, plan: TemplatePlan): Promise<TemplateApplyResult & { failed?: boolean }> {
    try {
      return await this.templates!.applyPlan({ workspaceId, actorId, plan });
    } catch (err) {
      logger.warn("[workspaces] Áp mẫu sau khi tạo nhóm thất bại", { workspaceId, code: plan.code, error: err instanceof Error ? err.message : String(err) });
      return { code: plan.code, createdChannels: [], skipped: [], failed: true };
    }
  }

  async list(userId: string, status: "ACTIVE" | "ARCHIVED" | "ALL"): Promise<WorkspaceListItem[]> {
    const now = Date.now();
    const [active, pending] = await Promise.all([this.repo.listForUser(userId, status), this.repo.listPendingForUser(userId, status)]);
    // Khách đã quá hạn (chưa kịp quét) coi như không còn là thành viên — ẩn ngay, không chờ job.
    const rows = active.filter(({ membership: m }) => !(m.role === "GUEST" && m.expiresAt && m.expiresAt.getTime() <= now));
    const unread = await getUnreadSummaries(userId, rows.map((r) => r.workspace.id));
    return [
      ...rows.map(({ workspace, membership }) => toWorkspaceListItem(workspace, membership, unread.get(workspace.id))),
      // p3-04 §5.5: yêu cầu chờ duyệt hiện như một thẻ `status: "PENDING"` (không unread) để app vẽ "Đang chờ duyệt".
      ...pending.map(({ workspace, membership }) => toWorkspaceListItem(workspace, membership, undefined)),
    ];
  }

  async get(workspaceId: string, userId: string, access: ResolvedAccess): Promise<WorkspaceDetail> {
    const workspace = await this.repo.findById(workspaceId);
    if (!workspace) throw new NotFoundError();
    const [memberCount, membership] = await Promise.all([
      this.repo.countMembers(workspaceId),
      this.repo.findMembership(workspaceId, userId),
    ]);
    if (!membership) throw new NotFoundError();
    return toWorkspaceDetail(workspace, memberCount, access, membership, await this.policyOf(workspace), await systemDefaultTimeZone());
  }

  async patch(
    userId: string,
    workspaceId: string,
    dto: UpdateWorkspaceDto,
    access: ResolvedAccess
  ): Promise<WorkspaceDetail> {
    const workspace = await withTransaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (dto.name !== undefined) {
        data.name = dto.name;
        data.normalizedName = normalizeSearch(dto.name);
      }
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.timezone !== undefined) data.timezone = dto.timezone; // null = về mặc định hệ thống
      // Cột ảnh đổi CÙNG lượt CAS với `version` (null = gỡ); link cập nhật ngay sau trong cùng transaction.
      if (dto.avatarAssetId !== undefined) data.avatarAssetId = dto.avatarAssetId;
      if (dto.coverAssetId !== undefined) data.coverAssetId = dto.coverAssetId;
      if (dto.coverPreset !== undefined) data.coverPreset = dto.coverPreset;

      const result = await tx.workspace.updateMany({
        where: { id: workspaceId, version: dto.expectedVersion, status: "ACTIVE" },
        data: { ...data, version: { increment: 1 } },
      });

      if (result.count === 0) {
        const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
        if (!current) throw new NotFoundError();
        if (current.status !== "ACTIVE") {
          throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
        }
        throw new VersionConflictError(current.version);
      }

      await this.syncImage(tx, "WORKSPACE_AVATAR", workspaceId, dto.avatarAssetId, userId);
      await this.syncImage(tx, "WORKSPACE_COVER", workspaceId, dto.coverAssetId, userId);

      const updated = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

      await outbox.add(tx, {
        type: "workspace.updated",
        aggregateType: "Workspace",
        aggregateId: workspaceId,
        queue: "notifications",
        jobName: "workspace.events",
        dedupeKey: `workspace.updated:${workspaceId}:v${updated.version}`,
        payload: { event: "updated", workspaceId },
      });

      return updated;
    });

    const [memberCount, membership] = await Promise.all([
      this.repo.countMembers(workspaceId),
      this.repo.findMembership(workspaceId, userId),
    ]);
    if (!membership) throw new NotFoundError();
    return toWorkspaceDetail(workspace, memberCount, access, membership, await this.policyOf(workspace), await systemDefaultTimeZone());
  }

  /**
   * `PATCH /workspaces/:id/settings` (OWNER, p3-04 §4) — `joinPolicy` và/hoặc `guestPolicy`, cùng CAS `expectedVersion` với `patch()`
   * (tăng `Workspace.version`, phát `workspace:updated`). Nhóm đã lưu trữ → `WS_002`.
   */
  async updateSettings(actorId: string, workspaceId: string, dto: WorkspaceSettingsDto): Promise<WorkspaceSettingsResult> {
    const updated = await withTransaction(async (tx) => {
      const result = await tx.workspace.updateMany({
        where: { id: workspaceId, version: dto.expectedVersion, status: "ACTIVE" },
        data: {
          ...(dto.joinPolicy !== undefined && { joinPolicy: dto.joinPolicy }),
          ...(dto.guestPolicy !== undefined && { guestPolicy: dto.guestPolicy }),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
        if (!current) throw new NotFoundError();
        if (current.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
        throw new VersionConflictError(current.version);
      }
      const row = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      await outbox.add(tx, {
        type: "workspace.updated",
        aggregateType: "Workspace",
        aggregateId: workspaceId,
        queue: "notifications",
        jobName: "workspace.events",
        dedupeKey: `workspace.updated:${workspaceId}:v${row.version}`,
        payload: { event: "updated", workspaceId },
      });
      return row;
    });
    await auditService.record({
      actorId,
      action: "workspace.settings-update",
      targetType: "Workspace",
      targetId: workspaceId,
      workspaceId,
      metadata: {
        ...(dto.joinPolicy !== undefined && { joinPolicy: dto.joinPolicy }),
        ...(dto.guestPolicy !== undefined && { guestPolicy: dto.guestPolicy }),
      },
    });
    return {
      joinPolicy: updated.joinPolicy === "APPROVAL" ? "APPROVAL" : "OPEN",
      guestPolicy: resolveGuestPolicy(updated.guestPolicy, await this.guestConfig.load()),
      version: updated.version,
    };
  }

  /** Gắn ảnh lúc tạo nhóm — `AssetLinkService.attach` kiểm READY + chính chủ + IMAGE + scope `AVATAR`; lỗi ⇒ rollback cả nhóm. */
  private async attachImage(tx: Tx, targetType: WorkspaceImageTarget, workspaceId: string, assetId: string | undefined, actorId: string): Promise<void> {
    if (!assetId) return;
    await this.assetLinks.attach(tx, {
      assetIds: [assetId],
      targetType,
      targetId: workspaceId,
      scopeType: "WORKSPACE",
      scopeId: workspaceId,
      actorId,
      allowedScopes: WORKSPACE_IMAGE_SCOPES,
    });
  }

  /**
   * Đổi/gỡ ảnh khi sửa nhóm: `undefined` = giữ nguyên, `null` = gỡ (asset cũ vào hạn dọn `assets.cleanup`), id = thay.
   * Link scope WORKSPACE ⇒ `GET /assets/:id/url` chỉ thành viên đọc được; URL hiển thị ký sẵn thì ai có URL cũng xem được
   * tới khi URL hết hạn/ảnh bị gỡ (ảnh nhóm không phải nội dung riêng tư — cùng chính sách avatar).
   */
  private async syncImage(tx: Tx, targetType: WorkspaceImageTarget, workspaceId: string, assetId: string | null | undefined, actorId: string): Promise<void> {
    if (assetId === undefined) return;
    if (assetId === null) {
      await this.assetLinks.detach(tx, { targetType, targetId: workspaceId });
      return;
    }
    await this.assetLinks.replace(tx, {
      targetType,
      targetId: workspaceId,
      assetId,
      scopeType: "WORKSPACE",
      scopeId: workspaceId,
      actorId,
      allowedScopes: WORKSPACE_IMAGE_SCOPES,
    });
  }

  /** `guestPolicy` đã chuẩn hoá (mặc định nền tảng cho nhóm chưa thiết lập) — trả trong chi tiết nhóm cho người KHÔNG phải khách. */
  private async policyOf(workspace: Pick<Workspace, "guestPolicy">): Promise<GuestPolicy> {
    return resolveGuestPolicy(workspace.guestPolicy, await this.guestConfig.load());
  }

  async updateMe(workspaceId: string, userId: string, dto: WorkspaceMeDto): Promise<WorkspaceMeSettings> {
    const updated = await this.repo.updateMembershipSettings(workspaceId, userId, dto);
    // Mute/bỏ mute CẢ NHÓM đổi tập kênh INHERIT được tính vào `unreadChannels` của `GET /me/unread/summary`
    // (`UnreadService.summary`) → xoá cache + báo máy khác, cùng lý do `ChannelService.me` làm khi mute 1 kênh.
    if (dto.notifyMode !== undefined) await notifyWorkspaceNotifyModeChanged(userId);
    return { isFavorite: updated.isFavorite, position: updated.position, notifyMode: updated.notifyMode };
  }
}
