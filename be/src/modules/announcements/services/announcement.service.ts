import { LIMITS } from "../../../core/constants/limits";
import { AppError, NotFoundError, ValidationError } from "../../../core/exceptions";
import { permissionService, type PermissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { OutboxEventInput } from "../../../infrastructure/queue/outbox/outbox.types";
import type { CreateAnnouncementDto } from "../dtos";
import type { AnnouncementRequest, AnnouncementView } from "../entities/announcement.interface";
import type { IAnnouncementLookupRepository, IAnnouncementRepository } from "../repositories/announcement.repository.interface";
import { toAnnouncementView } from "./announcement.presenter";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Số yêu cầu chưa huỷ trả về cho một kênh (đủ cho `perChannelActiveMax` còn hiệu lực + vài yêu cầu đã hết hạn gần đây). */
const LIST_LIMIT = 50;

/** Phát sự kiện socket — best-effort, KHÔNG được làm hỏng request đã commit. */
export interface AnnouncementEmitter {
  toRoom(room: string, event: string, payload: Record<string, unknown>): void;
  toUsers(userIds: string[], event: string, payload: Record<string, unknown>): void;
}

export const socketEmitter: AnnouncementEmitter = {
  toRoom(room, event, payload) {
    try {
      emitToRoom(room, event, payload);
    } catch (err) {
      logger.warn("[announcements] Không phát được sự kiện tới room", { event, error: err instanceof Error ? err.message : String(err) });
    }
  },
  toUsers(userIds, event, payload) {
    try {
      emitToUsers(userIds, event, payload);
    } catch (err) {
      logger.warn("[announcements] Không phát được sự kiện tới người dùng", { event, error: err instanceof Error ? err.message : String(err) });
    }
  },
};

export interface AnnouncementServiceDeps {
  repo: IAnnouncementRepository;
  lookup: IAnnouncementLookupRepository;
  permissions?: Pick<PermissionService, "assert" | "can">;
  emitter?: AnnouncementEmitter;
  now?: () => Date;
}

export interface CreateResult {
  view: AnnouncementView;
  /** `false` khi yêu cầu còn hiệu lực đã có (idempotent) — không ghi thêm. */
  created: boolean;
}

const notFound = (): NotFoundError => new NotFoundError();
const invalidChannel = (): AppError => new AppError(ErrorMessages[ErrorCode.ANN_001], 400, ErrorCode.ANN_001);
const goneError = (): AppError => new AppError(ErrorMessages[ErrorCode.ANN_003], 410, ErrorCode.ANN_003);

/**
 * Xác nhận đã đọc thông báo kênh (be.md p5-04 §5). Chỉ tin GỐC của kênh có `postingPolicy = ADMINS_ONLY`; tạo/huỷ cần `channel.manage`
 * (public: OWNER/ADMIN nhóm; private: MANAGER) — người yêu cầu vẫn huỷ được dù mất quyền quản lý. Biên nhận CHỈ tạo khi người
 * nhận bấm (RC-02), idempotent theo (yêu cầu, người). Không tìm thấy / không đọc được kênh → 404 trung tính.
 */
export class AnnouncementService {
  private readonly repo: IAnnouncementRepository;
  private readonly lookup: IAnnouncementLookupRepository;
  private readonly permissions: Pick<PermissionService, "assert" | "can">;
  private readonly emitter: AnnouncementEmitter;
  private readonly now: () => Date;

  constructor(deps: AnnouncementServiceDeps) {
    this.repo = deps.repo;
    this.lookup = deps.lookup;
    this.permissions = deps.permissions ?? permissionService;
    this.emitter = deps.emitter ?? socketEmitter;
    this.now = deps.now ?? (() => new Date());
  }

  async create(user: AuthUser, messageId: string, dto: CreateAnnouncementDto): Promise<CreateResult> {
    const message = await this.lookup.findMessage(messageId);
    if (!message || message.deletedAt !== null || message.kind !== "USER") throw notFound();
    if (message.scopeType !== "CHANNEL") throw invalidChannel();
    await this.permissions.assert(user, "channel.manage", { type: "CHANNEL", id: message.scopeId });

    const channel = await this.lookup.findChannel(message.scopeId);
    if (!channel) throw notFound();
    if (channel.postingPolicy !== "ADMINS_ONLY" || message.threadId !== null) throw invalidChannel();
    if (channel.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CH_004], 409, ErrorCode.CH_004);

    const now = this.now();
    const deadlineAt = this.checkDeadline(dto.deadlineAt, now);
    const existing = await this.repo.findByMessageId(messageId);
    // Đã có yêu cầu còn hiệu lực cho tin này: idempotent (bấm hai lần) — giữ nguyên hạn cũ, không ghi thêm.
    if (existing && this.isActive(existing, now)) return { view: await this.viewFor(existing, user, true), created: false };

    // Yêu cầu mới HOẶC khôi phục yêu cầu đã huỷ/hết hạn đều chiếm một chỗ "còn hiệu lực" của kênh.
    if ((await this.repo.countActive(channel.id, now)) >= LIMITS.announcement.perChannelActiveMax) {
      throw new AppError(ErrorMessages[ErrorCode.ANN_002], 409, ErrorCode.ANN_002, { max: LIMITS.announcement.perChannelActiveMax });
    }

    let request: AnnouncementRequest;
    let created: boolean;
    if (existing) {
      request = await this.repo.reactivate(existing.id, deadlineAt, this.remindEvents(messageId, deadlineAt, now));
      created = true;
    } else {
      const events = [this.notifyEvent(messageId), ...this.remindEvents(messageId, deadlineAt, now)];
      ({ request, created } = await this.repo.create(
        { messageId, channelId: channel.id, workspaceId: channel.workspaceId, requestedBy: user.id, deadlineAt },
        events
      ));
    }
    if (created) this.emitUpdated(request, { cancelled: false });
    return { view: await this.viewFor(request, user, true), created };
  }

  async cancel(user: AuthUser, messageId: string): Promise<Date> {
    const request = await this.requireRequest(messageId);
    await this.permissions.assert(user, "channel.read", { type: "CHANNEL", id: request.channelId });
    if (request.requestedBy !== user.id) {
      await this.permissions.assert(user, "channel.manage", { type: "CHANNEL", id: request.channelId });
    }
    if (request.cancelledAt) return request.cancelledAt; // idempotent
    const now = this.now();
    const cancelled = await this.repo.cancel(request.id, user.id, now);
    const result = cancelled ?? (await this.repo.findById(request.id)) ?? request;
    if (cancelled) this.emitUpdated(result, { cancelled: true });
    return result.cancelledAt ?? now;
  }

  async confirm(user: AuthUser, messageId: string): Promise<{ confirmedAt: Date }> {
    const request = await this.requireRequest(messageId);
    await this.permissions.assert(user, "channel.read", { type: "CHANNEL", id: request.channelId });
    const now = this.now();
    if (!this.isActive(request, now)) throw goneError();

    const result = await this.repo.confirm(request.id, user.id, now);
    if (result.created) {
      const base = { messageId, channelId: request.channelId };
      this.emitter.toUsers([request.requestedBy], SocketEvent.ANNOUNCEMENT_CONFIRMED, { ...base, confirmedCount: result.confirmedCount });
      // Đa thiết bị của người vừa xác nhận: thiết bị khác cập nhật `confirmedByMe`.
      this.emitter.toUsers([user.id], SocketEvent.ANNOUNCEMENT_UPDATED, { ...base, required: true, confirmedByMe: true });
    }
    return { confirmedAt: result.receipt.confirmedAt };
  }

  async get(user: AuthUser, messageId: string): Promise<AnnouncementView> {
    const request = await this.requireRequest(messageId);
    await this.permissions.assert(user, "channel.read", { type: "CHANNEL", id: request.channelId });
    if (request.cancelledAt) throw notFound();
    return this.viewFor(request, user, request.requestedBy === user.id || (await this.canManage(user, request.channelId)));
  }

  /** Yêu cầu chưa huỷ của kênh — app dựng huy hiệu "Cần xác nhận"/"Đã xác nhận" trên tin. */
  async listByChannel(user: AuthUser, channelId: string): Promise<AnnouncementView[]> {
    await this.permissions.assert(user, "channel.read", { type: "CHANNEL", id: channelId });
    const requests = await this.repo.listByChannel(channelId, LIST_LIMIT);
    if (requests.length === 0) return [];
    const [confirmed, manage] = await Promise.all([this.repo.confirmedRequestIds(user.id, requests.map((r) => r.id)), this.canManage(user, channelId)]);
    const now = this.now();
    return requests.map((r) => toAnnouncementView(r, { now, confirmedByMe: confirmed.has(r.id), canViewReceipts: manage || r.requestedBy === user.id }));
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async requireRequest(messageId: string): Promise<AnnouncementRequest> {
    const request = await this.repo.findByMessageId(messageId);
    if (!request) throw notFound();
    return request;
  }

  private async canManage(user: AuthUser, channelId: string): Promise<boolean> {
    return this.permissions.can(user, "channel.manage", { type: "CHANNEL", id: channelId });
  }

  private isActive(request: AnnouncementRequest, now: Date): boolean {
    return request.cancelledAt === null && (request.deadlineAt === null || request.deadlineAt > now);
  }

  private async viewFor(request: AnnouncementRequest, user: AuthUser, canViewReceipts: boolean): Promise<AnnouncementView> {
    const confirmed = await this.repo.confirmedRequestIds(user.id, [request.id]);
    return toAnnouncementView(request, { now: this.now(), confirmedByMe: confirmed.has(request.id), canViewReceipts });
  }

  /** `deadlineAt` phải ở tương lai và tối đa `deadlineMaxDays` ngày kể từ bây giờ; vắng → không hạn. */
  private checkDeadline(deadlineAt: Date | undefined, now: Date): Date | null {
    if (!deadlineAt) return null;
    const max = now.getTime() + LIMITS.announcement.deadlineMaxDays * DAY_MS;
    if (deadlineAt.getTime() <= now.getTime() || deadlineAt.getTime() > max) {
      throw new ValidationError(`Hạn xác nhận phải ở tương lai và không quá ${LIMITS.announcement.deadlineMaxDays} ngày`, {
        maxDays: LIMITS.announcement.deadlineMaxDays,
      });
    }
    return deadlineAt;
  }

  private emitUpdated(request: AnnouncementRequest, opts: { cancelled: boolean }): void {
    this.emitter.toRoom(ROOM.channel(request.channelId), SocketEvent.ANNOUNCEMENT_UPDATED, {
      messageId: request.messageId,
      channelId: request.channelId,
      required: !opts.cancelled,
      deadlineAt: request.deadlineAt ? request.deadlineAt.toISOString() : null,
      cancelled: opts.cancelled,
    });
  }

  private notifyEvent(messageId: string): OutboxEventInput {
    return {
      type: "announcement.requested",
      aggregateType: "Announcement",
      aggregateId: messageId,
      queue: "notifications",
      jobName: "announcement.notify",
      dedupeKey: `announcement.notify:msg:${messageId}`,
      payload: { messageId },
    };
  }

  /** Nhắc người chưa xác nhận `remindBeforeHours` giờ trước hạn (chỉ khi mốc nhắc còn ở tương lai). */
  private remindEvents(messageId: string, deadlineAt: Date | null, now: Date): OutboxEventInput[] {
    if (!deadlineAt) return [];
    const remindAt = new Date(deadlineAt.getTime() - LIMITS.announcement.remindBeforeHours * HOUR_MS);
    if (remindAt <= now) return [];
    return [
      {
        type: "announcement.remind-scheduled",
        aggregateType: "Announcement",
        aggregateId: messageId,
        queue: "notifications",
        jobName: "announcement.deadline-remind",
        // `now` trong khoá: yêu cầu huỷ rồi khôi phục cùng hạn vẫn có dòng outbox mới (dedupeKey là unique); processor kiểm lại hạn/huỷ.
        dedupeKey: `announcement.remind:msg:${messageId}:${now.getTime()}`,
        availableAt: remindAt,
        payload: { messageId, deadlineAt: deadlineAt.toISOString() },
      },
    ];
  }
}
