import { LIMITS } from "../../core/constants/limits";
import { AppError, NotFoundError, ValidationError, VersionConflictError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { normalizeSearch } from "../../core/utils/normalize";
import type { ChannelCreationPort } from "../../shared/ports/channel-creation.port";
import type {
  TemplateApplyResult,
  TemplateChannelPlan,
  TemplatePlan,
  TemplateSkipReason,
  WorkspaceTemplatePort,
} from "../../shared/ports/workspace-template.port";
import type { IWorkspaceTemplateRepository, TemplateRecord } from "./workspace-templates.repo";
import type { AdminUpdateTemplateDto } from "./workspace-templates.validators";

/** Cổng ghi audit — thoả mãn bởi `AuditService` (audit-log) qua structural typing, giống `system-config.service.ts`. */
export interface AuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    workspaceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

/** Mẫu trả cho người dùng (`GET /workspace-templates`) — chỉ mẫu đang bật. */
export interface TemplateDto {
  code: string;
  name: string;
  description: string;
  channels: (TemplateChannelPlan & { defaultSelected: boolean })[];
}

/** Mẫu trả cho admin — thêm trạng thái/phiên bản/thứ tự. */
export interface AdminTemplateDto extends TemplateDto {
  isActive: boolean;
  order: number;
  version: number;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface ApplyTemplateResult {
  createdChannels: { key: string; id: string; name: string }[];
  skipped: { key: string; reason: TemplateSkipReason }[];
}

const toDto = (t: TemplateRecord): TemplateDto => ({
  code: t.code,
  name: t.name,
  description: t.description,
  channels: t.channels.map((c) => ({
    key: c.key,
    name: c.name,
    description: c.description,
    type: c.type,
    visibility: c.visibility,
    postingPolicy: c.postingPolicy,
    defaultSelected: c.defaultSelected,
  })),
});

const toAdminDto = (t: TemplateRecord): AdminTemplateDto => ({
  ...toDto(t),
  isActive: t.isActive,
  order: t.order,
  version: t.version,
  updatedBy: t.updatedBy,
  updatedAt: t.updatedAt,
});

const templateNotFound = (): AppError => new AppError(ErrorMessages[ErrorCode.TPL_001], 404, ErrorCode.TPL_001);

/**
 * Mẫu workspace (be.md p5-04 §5 "Template apply"). Hai đường vào cùng một nơi tạo kênh (`ChannelCreationPort`):
 *  - tạo nhóm với `templateCode` (`plan()` trước khi tạo workspace, `applyPlan()` sau khi commit);
 *  - áp mẫu cho nhóm đã có (`apply()`, OWNER/ADMIN, `Idempotency-Key` bắt buộc — gọi lại trả kết quả cũ).
 * Kênh trùng tên (chuẩn hoá, kể cả kênh đã lưu trữ) hoặc loại kênh chưa bật bị BỎ QUA và báo lại, không lỗi. Mỗi kênh là một
 * transaction riêng (`ChannelService.create`), nên trước khi tạo ta kiểm hạn mức `channel.perWorkspaceMax` cho CẢ lô (`TPL_003`).
 */
export class WorkspaceTemplateService implements WorkspaceTemplatePort {
  constructor(
    private readonly repo: IWorkspaceTemplateRepository,
    private readonly channels: ChannelCreationPort,
    private readonly audit?: AuditRecorder
  ) {}

  // ── Người dùng ─────────────────────────────────────────────────────────────

  async list(): Promise<TemplateDto[]> {
    return (await this.repo.listActive()).map(toDto);
  }

  async plan(code: string, channelKeys: readonly string[] | undefined): Promise<TemplatePlan> {
    const template = await this.repo.findByCode(code);
    if (!template || !template.isActive) throw templateNotFound();

    const byKey = new Map(template.channels.map((c) => [c.key, c]));
    if (channelKeys) {
      const unknown = channelKeys.filter((k) => !byKey.has(k));
      if (unknown.length > 0) throw new ValidationError("Kênh không thuộc mẫu đã chọn", { unknownKeys: unknown });
    }
    const chosen = channelKeys ? Array.from(new Set(channelKeys)).flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])) : template.channels.filter((c) => c.defaultSelected);
    return {
      code: template.code,
      name: template.name,
      channels: chosen.map((c) => ({ key: c.key, name: c.name, description: c.description, type: c.type, visibility: c.visibility, postingPolicy: c.postingPolicy })),
    };
  }

  async applyPlan(input: { workspaceId: string; actorId: string; plan: TemplatePlan }): Promise<TemplateApplyResult> {
    const state = await this.repo.workspaceChannelState(input.workspaceId);
    if (state.status === null) throw new NotFoundError();
    if (state.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.TPL_002], 409, ErrorCode.TPL_002);

    const names = new Set(state.normalizedNames);
    const toCreate = input.plan.channels.filter((c) => !names.has(normalizeSearch(c.name)));
    if (state.activeChannelCount + toCreate.length > LIMITS.channel.perWorkspaceMax) {
      throw new AppError(ErrorMessages[ErrorCode.TPL_003], 409, ErrorCode.TPL_003, { max: LIMITS.channel.perWorkspaceMax });
    }

    const createdChannels: TemplateApplyResult["createdChannels"] = [];
    const skipped: TemplateApplyResult["skipped"] = [];
    for (const channel of input.plan.channels) {
      const normalized = normalizeSearch(channel.name);
      if (names.has(normalized)) {
        skipped.push({ key: channel.key, reason: "NAME_EXISTS" });
        continue;
      }
      try {
        const created = await this.channels.create({
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          name: channel.name,
          description: channel.description || undefined,
          type: channel.type,
          visibility: channel.visibility,
          postingPolicy: channel.postingPolicy,
        });
        names.add(normalized);
        createdChannels.push({ key: channel.key, id: created.id, name: created.name });
      } catch (err) {
        const reason = this.skipReasonOf(err);
        if (!reason) throw err;
        skipped.push({ key: channel.key, reason });
      }
    }
    return { code: input.plan.code, createdChannels, skipped };
  }

  /** `POST /workspaces/:id/templates/:code/apply` — idempotent theo `(người gọi, Idempotency-Key)`. */
  async apply(actorId: string, workspaceId: string, code: string, channelKeys: readonly string[], idempotencyKey: string): Promise<ApplyTemplateResult> {
    const previous = await this.repo.findApplication(actorId, idempotencyKey);
    if (previous) return this.fromApplication(previous);

    const plan = await this.plan(code, channelKeys);
    const result = await this.applyPlan({ workspaceId, actorId, plan });

    const saved = await this.repo.createApplication({
      workspaceId,
      templateCode: code,
      channelKeys: plan.channels.map((c) => c.key),
      createdChannelIds: result.createdChannels.map((c) => c.id),
      // `<khoá>:<lý do>` — giữ lý do để trả lại đúng khi gọi lại cùng `Idempotency-Key`.
      skippedKeys: result.skipped.map((s) => `${s.key}:${s.reason}`),
      appliedBy: actorId,
      idempotencyKey,
    });
    // Yêu cầu song song trùng khoá: bản ghi thắng cuộc là nguồn sự thật — trả đúng kết quả của nó.
    if (saved.createdChannelIds.join() !== result.createdChannels.map((c) => c.id).join()) return this.fromApplication(saved);

    await this.audit?.record({
      actorId,
      action: "workspace.template-apply",
      targetType: "Workspace",
      targetId: workspaceId,
      workspaceId,
      metadata: { templateCode: code, created: result.createdChannels.length, skipped: result.skipped.length },
    });
    return { createdChannels: result.createdChannels, skipped: result.skipped };
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  async adminList(): Promise<AdminTemplateDto[]> {
    return (await this.repo.listAll()).map(toAdminDto);
  }

  async adminGet(code: string): Promise<AdminTemplateDto> {
    const template = await this.repo.findByCode(code);
    if (!template) throw templateNotFound();
    return toAdminDto(template);
  }

  async adminUpdate(actor: { id: string; role?: string }, code: string, dto: AdminUpdateTemplateDto): Promise<AdminTemplateDto> {
    const { expectedVersion, reason, ...patch } = dto;
    const result = await this.repo.update(code, expectedVersion, patch, actor.id);
    if (!result.ok) {
      if (!result.current) throw templateNotFound();
      throw new VersionConflictError(result.current.version);
    }
    await this.audit?.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "workspace-template.update",
      targetType: "WorkspaceTemplate",
      targetId: code,
      reason,
      metadata: { fields: Object.keys(patch), version: result.record.version },
    });
    return toAdminDto(result.record);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** `CH_001` (trùng tên do tranh chấp) / `CH_010` (loại kênh chưa bật) → bỏ qua; lỗi khác nổi lên. */
  private skipReasonOf(err: unknown): TemplateSkipReason | null {
    if (!(err instanceof AppError)) return null;
    if (err.errorCode === ErrorCode.CH_001) return "NAME_EXISTS";
    if (err.errorCode === ErrorCode.CH_010) return "TYPE_UNAVAILABLE";
    if (err.errorCode === ErrorCode.CH_006) throw new AppError(ErrorMessages[ErrorCode.TPL_003], 409, ErrorCode.TPL_003);
    return null;
  }

  private async fromApplication(app: { templateCode: string; channelKeys: string[]; createdChannelIds: string[]; skippedKeys: string[] }): Promise<ApplyTemplateResult> {
    const template = await this.repo.findByCode(app.templateCode);
    const nameByKey = new Map((template?.channels ?? []).map((c) => [c.key, c.name]));
    const skipped = app.skippedKeys.map((entry) => {
      const at = entry.lastIndexOf(":");
      return { key: entry.slice(0, at), reason: entry.slice(at + 1) as TemplateSkipReason };
    });
    // Lần đầu các kênh được tạo THEO THỨ TỰ khoá, bỏ những khoá bị bỏ qua — ghép lại đúng thứ tự đó.
    const skippedKeySet = new Set(skipped.map((s) => s.key));
    const createdKeys = app.channelKeys.filter((k) => !skippedKeySet.has(k));
    return {
      createdChannels: app.createdChannelIds.map((id, i) => ({ key: createdKeys[i] ?? "", id, name: nameByKey.get(createdKeys[i] ?? "") ?? "" })),
      skipped,
    };
  }
}
