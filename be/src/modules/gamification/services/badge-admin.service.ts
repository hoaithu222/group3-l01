import { AppError, ConflictError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { criteriaCounters, criteriaSchema, type Criteria } from "../../../shared/criteria/criteria-evaluator";
import type { AdminBadgesQueryDto, CreateBadgeDto, PatchBadgeDto } from "../dtos";
import type { Badge } from "../entities/gamification.interface";
import type { IBadgeRepository } from "../repositories/badge.repository.interface";
import { UniqueViolationError, type ITxRunner } from "../repositories/tx";
import type { IUserBadgeRepository } from "../repositories/user-badge.repository.interface";
import type { BadgeService } from "./badge.service";
import { badgeAuditSnapshot, toAdminDto, type BadgeAdminDto } from "./badge-admin-presenter";
import type { IGamBadgeIcons } from "./badge-icon.port";
import type { IGamAudit } from "./gamification.ports";

export type { BadgeAdminDto } from "./badge-admin-presenter";

/** Cổng xếp job nền (`badge.backfill`) — service không tự `enqueue()` (mẫu cổng của `study`). */
export interface IGamJobs {
  /** Trả `jobId` (tất định theo huy hiệu + phiên bản — bấm hai lần khi job cũ còn tồn tại không tạo job thứ hai). */
  enqueueBackfill(badgeId: string, version: number): Promise<string>;
}

/** `GAME_002` (400) — điều kiện mở huy hiệu sai dạng (kèm chi tiết lỗi Zod để form admin hiện đúng chỗ). */
export function parseCriteriaOrThrow(raw: unknown): Criteria {
  const parsed = criteriaSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(ErrorMessages[ErrorCode.GAME_002], 400, ErrorCode.GAME_002, parsed.error.flatten());
  return parsed.data;
}

export interface BadgeAdminDeps {
  badges: IBadgeRepository;
  userBadges: IUserBadgeRepository;
  badgeService: BadgeService;
  audit: IGamAudit;
  jobs: IGamJobs;
  /** Ảnh huy hiệu: kiểm asset + gắn/gỡ `AssetLink BADGE_ICON` (be.md §12). */
  icons: IGamBadgeIcons;
  tx: ITxRunner;
  now?: () => Date;
}

/** Quản trị huy hiệu (p4-03 be.md §4): tạo/sửa/tắt, xem trước, backfill, thu hồi — mọi thao tác ghi cần lý do + audit. Sửa `criteria` KHÔNG thu hồi huy hiệu đã mở. */
export class BadgeAdminService {
  constructor(private readonly d: BadgeAdminDeps) {}

  async list(query: AdminBadgesQueryDto) {
    const { rows, total } = await this.d.badges.listPage({ page: query.page, limit: query.limit, isActive: query.isActive, q: query.q });
    const counts = await this.d.userBadges.countByBadges(rows.map((b) => b.id));
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    return {
      data: rows.map((b) => toAdminDto(b, counts.get(b.id) ?? 0)),
      meta: { page: query.page, limit: query.limit, total, totalPages, hasNext: query.page < totalPages, hasPrev: query.page > 1 },
    };
  }

  /** Một huy hiệu theo id (kèm `unlockedCount`) — cho deep link `/gamification/badges/:badgeId` của admin (không phụ thuộc trang danh sách). */
  async get(id: string): Promise<BadgeAdminDto> {
    const badge = await this.d.badges.findById(id);
    if (!badge) throw new NotFoundError("Không tìm thấy huy hiệu");
    return toAdminDto(badge, (await this.d.userBadges.countByBadges([id])).get(id) ?? 0);
  }

  async create(actor: AuthUser, dto: CreateBadgeDto): Promise<BadgeAdminDto> {
    const criteria = parseCriteriaOrThrow(dto.criteria);
    const iconAssetId = dto.iconAssetId ?? null;
    if (iconAssetId) await this.d.icons.assertUsable(iconAssetId, actor.id);
    const input = {
      code: dto.code,
      name: dto.name,
      description: dto.description,
      emoji: dto.emoji ?? null,
      iconAssetId,
      criteria,
      counters: criteriaCounters(criteria),
      rarity: dto.rarity,
      order: dto.order,
      createdBy: actor.id,
    };
    let badge: Badge;
    try {
      // Có ảnh: tạo huy hiệu + gắn `AssetLink` trong MỘT transaction (asset không bao giờ mồ côi khi huy hiệu đã tồn tại). Lỗi unique (P2002) thoát
      // khỏi callback → rollback, rồi bắt Ở NGOÀI (tx Mongo đã hỏng sau P2002).
      badge = iconAssetId
        ? await this.d.tx.run(async (tx) => {
            const created = await this.d.badges.create(input, tx);
            await this.d.icons.attach(tx, { badgeId: created.id, assetId: iconAssetId, actorId: actor.id });
            return created;
          })
        : await this.d.badges.create(input);
    } catch (err) {
      if (err instanceof UniqueViolationError) throw new AppError(ErrorMessages[ErrorCode.GAME_003], 409, ErrorCode.GAME_003, { code: dto.code });
      throw err;
    }
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "badge.create", targetType: "Badge", targetId: badge.id, reason: dto.reason, metadata: { after: badgeAuditSnapshot(badge) } });
    return toAdminDto(badge, 0);
  }

  async patch(actor: AuthUser, id: string, dto: PatchBadgeDto): Promise<BadgeAdminDto> {
    const before = await this.d.badges.findById(id);
    if (!before) throw new NotFoundError("Không tìm thấy huy hiệu");
    const criteria = dto.criteria === undefined ? undefined : parseCriteriaOrThrow(dto.criteria);
    // Ảnh đổi khi có trường `iconAssetId` khác giá trị hiện tại (`null` = gỡ ảnh). Gửi lại đúng ảnh đang dùng = không đổi, không kiểm lại.
    const iconChanged = dto.iconAssetId !== undefined && dto.iconAssetId !== before.iconAssetId;
    const nextIcon = dto.iconAssetId ?? null;
    if (iconChanged && nextIcon) await this.d.icons.assertUsable(nextIcon, actor.id);
    const patch = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.emoji !== undefined && { emoji: dto.emoji }),
      ...(iconChanged && { iconAssetId: nextIcon }),
      ...(dto.rarity !== undefined && { rarity: dto.rarity }),
      ...(dto.order !== undefined && { order: dto.order }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(criteria && { criteria, counters: criteriaCounters(criteria) }),
    };
    // Đổi ảnh: CAS huy hiệu + gỡ link cũ + gắn link mới trong MỘT transaction (lệch phiên bản → `null` → không link nào bị đổi).
    const after = iconChanged
      ? await this.d.tx.run(async (tx) => {
          const updated = await this.d.badges.updateIf(id, dto.expectedVersion, patch, tx);
          if (!updated) return null;
          if (before.iconAssetId) await this.d.icons.detach(tx, { badgeId: id, assetId: before.iconAssetId });
          if (nextIcon) await this.d.icons.attach(tx, { badgeId: id, assetId: nextIcon, actorId: actor.id });
          return updated;
        })
      : await this.d.badges.updateIf(id, dto.expectedVersion, patch);
    if (!after) throw new VersionConflictError((await this.d.badges.findById(id))?.version ?? before.version);
    await this.d.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "badge.update",
      targetType: "Badge",
      targetId: id,
      reason: dto.reason,
      metadata: { before: badgeAuditSnapshot(before), after: badgeAuditSnapshot(after) },
    });
    return toAdminDto(after, (await this.d.userBadges.countByBadges([id])).get(id) ?? 0);
  }

  /** Xem trước: bao nhiêu người ĐANG đủ điều kiện (GM-12). */
  async preview(rawCriteria: unknown): Promise<{ eligibleUsers: number }> {
    return { eligibleUsers: await this.d.badgeService.preview(parseCriteriaOrThrow(rawCriteria)) };
  }

  /** Backfill (P1): xếp job nền; huy hiệu đang tắt → 409. Chạy lại vô hại (`UserBadge` unique, tối đa một thông báo/người). */
  async backfill(actor: AuthUser, id: string, reason: string): Promise<{ jobId: string }> {
    const badge = await this.d.badges.findById(id);
    if (!badge) throw new NotFoundError("Không tìm thấy huy hiệu");
    if (!badge.isActive) throw new ConflictError("Huy hiệu đang tắt, hãy bật lại trước khi backfill");
    const jobId = await this.d.jobs.enqueueBackfill(id, badge.version);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "badge.backfill", targetType: "Badge", targetId: id, reason, metadata: { jobId, version: badge.version } });
    return { jobId };
  }

  /** Thu hồi thủ công (P1) — đánh dấu, không xoá; huy hiệu thu hồi KHÔNG tự mở lại. */
  async revoke(actor: AuthUser, userId: string, badgeId: string, reason: string): Promise<void> {
    const at = this.d.now?.() ?? new Date();
    if (!(await this.d.userBadges.revoke(userId, badgeId, actor.id, reason, at))) throw new NotFoundError("Người dùng chưa có huy hiệu này");
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "badge.revoke", targetType: "UserBadge", targetId: `${userId}:${badgeId}`, reason, metadata: { userId, badgeId } });
  }
}
