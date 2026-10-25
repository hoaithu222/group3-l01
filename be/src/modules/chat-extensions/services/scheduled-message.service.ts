import { ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { isValidIanaTimeZone } from "../../../core/utils/timezone";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { IMessageSendPort, PortMessageView } from "../../../shared/ports/message-send.port";
import { chatErrors } from "../chat-extensions.errors";
import type { ChatScopeType, CursorPage, ScheduledMessageEntity, ScheduledMessagePatch, ScheduledMessageView } from "../entities/chat-extensions.types";
import type { CreateScheduledDto, ListMyScheduledQueryDto, UpdateScheduledDto } from "../dtos";
import { scopeLabelKey, type IChatDirectory } from "../repositories/chat-directory.interface";
import type { IScheduledMessageRepository } from "../repositories/scheduled-message.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { getChatExtLimits, type ChatExtLimits } from "./chat-extensions-limits";
import { writeScheduledSend } from "./chat-extensions-events";
import type { IChatEmitter, IChatPermissionGate, IScheduledAssetPort } from "./chat-extensions-ports";
import { isWithinWindow } from "./chat-extensions-util";
import type { ScheduledMessageDispatchService } from "./scheduled-message-dispatch.service";
import { toScheduledUpdatedPayload, toScheduledView } from "./scheduled-message.presenter";

export interface ScheduledMessageServiceDeps {
  scheduled: IScheduledMessageRepository;
  sender: IMessageSendPort;
  gate: IChatPermissionGate;
  assets: IScheduledAssetPort;
  directory: IChatDirectory;
  dispatcher: Pick<ScheduledMessageDispatchService, "dispatch">;
  emitter: IChatEmitter;
  tx: ITxRunner;
  outbox: IOutboxPort;
  limits?: () => Promise<ChatExtLimits>;
  now?: () => Date;
}

export interface SendNowResult {
  scheduledMessage: ScheduledMessageView;
  message: PortMessageView;
}

/**
 * Tin hẹn giờ (p7-04 be.md §5.3): `ScheduledMessage` riêng (chưa phải `Message` — không lộ trong lịch sử trước giờ phát); đến hạn job tạo `Message` qua `IMessageSendPort` với
 * `clientMessageId = "sched:<id>"` (idempotent). Ở đây: tạo/sửa/huỷ/gửi ngay/danh sách CỦA TÔI. Quyền gửi kiểm LÚC HẸN (bảo đảm nội dung hợp lệ ngay) và LẠI lúc phát (`Dispatch`).
 * Mọi đổi trạng thái là CAS (`updateIfPending`/`cancel`), mỗi lần đổi `version` ghi một hàng outbox hẹn giờ MỚI khoá theo `version` — job của bản cũ tự vô hiệu (SCHED-03).
 */
export class ScheduledMessageService {
  constructor(private readonly d: ScheduledMessageServiceDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  private limits(): Promise<ChatExtLimits> {
    return (this.d.limits ?? getChatExtLimits)();
  }

  async create(user: AuthUser, scopeType: ChatScopeType, scopeId: string, dto: CreateScheduledDto): Promise<ScheduledMessageView> {
    const limits = await this.limits();
    if (dto.threadId && scopeType !== "CHANNEL") throw new ValidationError("Chỉ kênh mới có thread", { field: "threadId" });

    const access = await this.d.sender.canWrite(user.id, scopeType, scopeId);
    if (!access.readable) throw chatErrors.notFound();
    if (!access.allowed) throw chatErrors.cannotWrite();
    this.assertSendAt(dto.sendAt, limits);
    this.assertTimezone(dto.timezone);
    await this.d.gate.assert(user, "SCHEDULED_MESSAGE_CREATE", { scopeType, scopeId, workspaceId: access.workspaceId });

    // Nội dung, tệp READY của tác giả, mention, tin trả lời — CÙNG luật `send()`: lỗi báo ngay lúc hẹn (MSG_001/002/005/007/008) thay vì thất bại âm thầm lúc phát.
    const draft = await this.d.sender.validateDraft(user.id, scopeType, scopeId, {
      ...(dto.content !== undefined ? { content: dto.content } : {}),
      mentions: dto.mentions,
      attachmentAssetIds: dto.attachmentAssetIds,
      ...(dto.replyToId ? { replyToId: dto.replyToId } : {}),
    });

    const created = await this.d.tx.run(async (tx) => {
      // Trần "đang chờ": kiểm TRONG transaction ngay trước khi ghi (đua hai yêu cầu cùng lúc có thể vượt trần 1–2 tin — chấp nhận, không phải ràng buộc an toàn).
      if ((await this.d.scheduled.countPending(user.id, tx)) >= limits.scheduled.pendingPerUserMax) throw chatErrors.scheduledTooMany(limits.scheduled.pendingPerUserMax);
      const row = await this.d.scheduled.create(
        {
          authorId: user.id,
          scopeType,
          scopeId,
          threadId: dto.threadId ?? null,
          workspaceId: access.workspaceId,
          content: draft.content,
          mentions: draft.mentions,
          attachmentAssetIds: draft.attachmentAssetIds,
          replyToId: draft.replyToId,
          sendAt: dto.sendAt,
          timezone: dto.timezone,
        },
        tx
      );
      await this.d.assets.attach(tx, { assetIds: row.attachmentAssetIds, scheduledMessageId: row.id, actorId: user.id });
      await writeScheduledSend(this.d.outbox, tx, row);
      return row;
    });
    this.emitUpdated(created);
    return this.present(user, created);
  }

  async listMine(user: AuthUser, query: ListMyScheduledQueryDto): Promise<CursorPage<ScheduledMessageView>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");
    const rows = await this.d.scheduled.listMine(user.id, { status: query.status, scopeType: query.scopeType, scopeId: query.scopeId }, cursor, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const views = await this.presentMany(user, page);
    const last = page[page.length - 1];
    return { data: views, nextCursor: hasMore && last ? encodeCursor(last.sendAt, last.id) : null, hasMore, limit: query.limit };
  }

  /**
   * Sửa khi còn `PENDING`: CAS `{ id, authorId, status: PENDING, version: expectedVersion }` (người khác → 404; không còn PENDING → `SCHED_003`; `version` lệch → `RES_003`). Đổi bất kỳ trường nào cũng
   * tăng `version` nên LUÔN ghi hàng outbox hẹn giờ mới (jobId khoá theo `version`); job cũ không còn khớp CAS lúc phát. Đổi tệp → gắn/gỡ chênh lệch `AssetLink`.
   */
  async update(user: AuthUser, id: string, dto: UpdateScheduledDto): Promise<ScheduledMessageView> {
    const current = await this.requireOwn(user, id);
    if (current.status !== "PENDING") throw chatErrors.scheduledNotPending();
    if (current.version !== dto.expectedVersion) throw chatErrors.versionConflict(current.version);
    const limits = await this.limits();

    const access = await this.d.sender.canWrite(user.id, current.scopeType, current.scopeId);
    if (!access.readable) throw chatErrors.notFound();
    if (!access.allowed) throw chatErrors.cannotWrite();

    const patch: ScheduledMessagePatch = {};
    if (dto.sendAt !== undefined) {
      this.assertSendAt(dto.sendAt, limits);
      patch.sendAt = dto.sendAt;
    }
    if (dto.timezone !== undefined) {
      this.assertTimezone(dto.timezone);
      patch.timezone = dto.timezone;
    }
    const contentChanged = dto.content !== undefined || dto.mentions !== undefined || dto.attachmentAssetIds !== undefined || dto.replyToId !== undefined;
    if (contentChanged) {
      const nextContent = dto.content !== undefined ? dto.content : (current.content ?? undefined);
      const nextReply = dto.replyToId !== undefined ? dto.replyToId : current.replyToId;
      const draft = await this.d.sender.validateDraft(user.id, current.scopeType, current.scopeId, {
        ...(nextContent !== undefined ? { content: nextContent } : {}),
        mentions: dto.mentions ?? current.mentions,
        attachmentAssetIds: dto.attachmentAssetIds ?? current.attachmentAssetIds,
        ...(nextReply ? { replyToId: nextReply } : {}),
      });
      patch.content = draft.content;
      patch.mentions = draft.mentions;
      patch.attachmentAssetIds = draft.attachmentAssetIds;
      patch.replyToId = draft.replyToId;
    }

    const updated = await this.d.tx.run(async (tx) => {
      const next = await this.d.scheduled.updateIfPending(id, user.id, dto.expectedVersion, patch, tx);
      if (!next) return null;
      if (patch.attachmentAssetIds) {
        const before = new Set(current.attachmentAssetIds);
        const after = new Set(patch.attachmentAssetIds);
        const added = patch.attachmentAssetIds.filter((a) => !before.has(a));
        const removed = current.attachmentAssetIds.filter((a) => !after.has(a));
        if (added.length > 0) await this.d.assets.attach(tx, { assetIds: added, scheduledMessageId: id, actorId: user.id });
        if (removed.length > 0) await this.d.assets.detach(tx, { scheduledMessageId: id, assetIds: removed });
      }
      await writeScheduledSend(this.d.outbox, tx, next);
      return next;
    });
    if (!updated) throw await this.classifyLostRace(id, user.id);
    this.emitUpdated(updated);
    return this.present(user, updated);
  }

  /** Huỷ khi còn `PENDING` (CAS). Đã huỷ → trả yên lặng (idempotent); đã gửi/lỗi/đang gửi → `SCHED_003`. Gỡ liên kết tệp. */
  async cancel(user: AuthUser, id: string): Promise<void> {
    const current = await this.requireOwn(user, id);
    if (current.status === "CANCELLED") return;
    if (current.status !== "PENDING") throw chatErrors.scheduledNotPending();
    const cancelled = await this.d.tx.run(async (tx) => {
      const next = await this.d.scheduled.cancel(id, user.id, this.now(), tx);
      if (!next) return null;
      await this.d.assets.detach(tx, { scheduledMessageId: id });
      return next;
    });
    if (!cancelled) {
      const again = await this.d.scheduled.findById(id);
      if (again?.status === "CANCELLED") return;
      throw chatErrors.scheduledNotPending();
    }
    this.emitUpdated(cancelled);
  }

  /**
   * Gửi ngay: kiểm quyền gửi HIỆN TẠI trước (mất quyền → 403 `SCHED_004`, bản ghi giữ nguyên `PENDING` — không tự chuyển `FAILED` khi chính người dùng đang thao tác), rồi chạy đúng luồng
   * phát của job (claim CAS theo `version` hiện tại, kiểm lại quyền, gửi qua engine, đánh dấu `SENT`). Job hẹn giờ cũ tự vô hiệu vì `version` đổi.
   */
  async sendNow(user: AuthUser, id: string): Promise<SendNowResult> {
    const current = await this.requireOwn(user, id);
    if (current.status !== "PENDING") throw chatErrors.scheduledNotPending();
    const access = await this.d.sender.canWrite(user.id, current.scopeType, current.scopeId);
    if (!access.readable || !access.allowed) throw chatErrors.scheduledCannotSend();

    const outcome = await this.d.dispatcher.dispatch({ id, version: current.version });
    if (outcome.kind === "SENT") return { scheduledMessage: await this.present(user, outcome.scheduled), message: outcome.message };
    if (outcome.kind === "FAILED") throw chatErrors.scheduledCannotSend();
    // Job hẹn giờ thắng đua (đã phát/đã đổi): trả trạng thái mới nhất.
    throw chatErrors.scheduledNotPending();
  }

  // ── Nội bộ ─────────────────────────────────────────────────────────────────────

  /** Tin của CHÍNH tác giả; người khác/không tồn tại → 404 trung tính. */
  private async requireOwn(user: AuthUser, id: string): Promise<ScheduledMessageEntity> {
    const row = await this.d.scheduled.findById(id);
    if (!row || row.authorId !== user.id) throw chatErrors.notFound();
    return row;
  }

  /** CAS thua: đọc lại để báo đúng lý do (bản ghi biến mất → 404; không còn PENDING → `SCHED_003`; còn PENDING nhưng `version` đã đổi → `RES_003`). */
  private async classifyLostRace(id: string, authorId: string): Promise<Error> {
    const row = await this.d.scheduled.findById(id);
    if (!row || row.authorId !== authorId) return chatErrors.notFound();
    if (row.status !== "PENDING") return chatErrors.scheduledNotPending();
    return chatErrors.versionConflict(row.version);
  }

  private assertSendAt(sendAt: Date, limits: ChatExtLimits): void {
    if (!isWithinWindow(sendAt, this.now(), limits.scheduled.minLeadSeconds, limits.scheduled.sendAtMaxDays)) throw chatErrors.scheduledSendAtInvalid();
  }

  private assertTimezone(timezone: string): void {
    if (!isValidIanaTimeZone(timezone)) throw new ValidationError("Múi giờ không hợp lệ", { field: "timezone" });
  }

  private emitUpdated(m: ScheduledMessageEntity): void {
    this.d.emitter.toUsers([m.authorId], SocketEvent.SCHEDULED_MESSAGE_UPDATED, { ...toScheduledUpdatedPayload(m) });
  }

  private async present(user: AuthUser, m: ScheduledMessageEntity): Promise<ScheduledMessageView> {
    return (await this.presentMany(user, [m]))[0];
  }

  /** Nhãn phạm vi CHỈ cho phạm vi người xem còn đọc được (không lộ tên kênh đã mất quyền); tệp + nhãn tra theo lô (không N+1). */
  private async presentMany(user: AuthUser, rows: ScheduledMessageEntity[]): Promise<ScheduledMessageView[]> {
    if (rows.length === 0) return [];
    const scopes = [...new Map(rows.map((r) => [scopeLabelKey(r.scopeType, r.scopeId), { scopeType: r.scopeType, scopeId: r.scopeId }])).values()];
    const readable = (
      await Promise.all(scopes.map(async (s) => ((await this.d.sender.canWrite(user.id, s.scopeType, s.scopeId)).readable ? s : null)))
    ).filter((s): s is { scopeType: ChatScopeType; scopeId: string } => s !== null);
    const [labels, files] = await Promise.all([this.d.directory.scopeLabels(user.id, readable), this.d.directory.assets(rows.flatMap((r) => r.attachmentAssetIds))]);
    return rows.map((r) => toScheduledView(r, labels.get(scopeLabelKey(r.scopeType, r.scopeId)) ?? null, files));
  }
}
