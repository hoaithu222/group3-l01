import { ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { isValidIanaTimeZone } from "../../../core/utils/timezone";
import type { IMessageSendPort } from "../../../shared/ports/message-send.port";
import { chatErrors } from "../chat-extensions.errors";
import type { CursorPage, MessageReminderEntity, ReminderView } from "../entities/chat-extensions.types";
import type { CreateReminderDto, ListMyRemindersQueryDto } from "../dtos";
import type { IChatDirectory } from "../repositories/chat-directory.interface";
import type { IMessageReminderRepository } from "../repositories/message-reminder.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { getChatExtLimits, type ChatExtLimits } from "./chat-extensions-limits";
import { writeReminderFire } from "./chat-extensions-events";
import type { IChatNotifier } from "./chat-extensions-ports";
import { isWithinWindow } from "./chat-extensions-util";

/** Độ dài tối đa (ký tự) của phần xem trước tin trong "Nhắc lại của tôi" — chỉ hiện khi tin còn đọc được lúc xem danh sách. */
const PREVIEW_CHARS = 120;

export interface MessageReminderServiceDeps {
  reminders: IMessageReminderRepository;
  sender: IMessageSendPort;
  directory: Pick<IChatDirectory, "users">;
  notifier: IChatNotifier;
  tx: ITxRunner;
  outbox: IOutboxPort;
  limits?: () => Promise<ChatExtLimits>;
  now?: () => Date;
}

export type FireOutcome = "FIRED" | "SKIPPED";

const toView = (r: MessageReminderEntity, preview?: string): ReminderView => ({
  id: r.id,
  messageId: r.messageId,
  scopeType: r.scopeType,
  scopeId: r.scopeId,
  remindAt: r.remindAt,
  timezone: r.timezone,
  status: r.status,
  unavailable: r.unavailable,
  ...(preview !== undefined ? { preview } : {}),
});

/**
 * Nhắc lại tin (p7-04 be.md §5.4): người dùng chọn thời điểm → nhắc RIÊNG (notification) tại giờ đó. Đặt nhắc cần ĐỌC được tin; LÚC ĐẾN HẠN quyền đọc được kiểm lại — tin đã gỡ/mất quyền thì
 * nhắc chung "Tin không còn khả dụng", KHÔNG kèm `messageId`/nội dung (REMIND-01). Đến hạn claim CAS `PENDING → FIRED` CÙNG transaction với `notify()` (lỗi ghi thông báo ⇒ rollback claim ⇒ BullMQ
 * thử lại không mất nhắc). Khách (GUEST) vẫn đặt nhắc được trong kênh được cấp quyền (không qua cổng quyền tạo).
 */
export class MessageReminderService {
  constructor(private readonly d: MessageReminderServiceDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  private limits(): Promise<ChatExtLimits> {
    return (this.d.limits ?? getChatExtLimits)();
  }

  async create(user: AuthUser, messageId: string, dto: CreateReminderDto): Promise<ReminderView> {
    const limits = await this.limits();
    const message = await this.d.sender.getReadable(user.id, messageId);
    if (!message || message.deletedAt !== null) throw chatErrors.messageNotFound();
    if (!isWithinWindow(dto.remindAt, this.now(), limits.reminder.minLeadSeconds, limits.reminder.remindAtMaxDays)) throw chatErrors.reminderRemindAtInvalid();
    if (!isValidIanaTimeZone(dto.timezone)) throw new ValidationError("Múi giờ không hợp lệ", { field: "timezone" });

    const created = await this.d.tx.run(async (tx) => {
      // Trần "đang chờ" kiểm ngay trước khi ghi (đua hai yêu cầu có thể vượt 1–2 nhắc — chấp nhận, không phải ràng buộc an toàn).
      if ((await this.d.reminders.countPending(user.id, tx)) >= limits.reminder.pendingPerUserMax) throw chatErrors.reminderTooMany(limits.reminder.pendingPerUserMax);
      const row = await this.d.reminders.create(
        { userId: user.id, messageId, scopeType: message.scopeType, scopeId: message.scopeId, workspaceId: message.workspaceId, remindAt: dto.remindAt, timezone: dto.timezone },
        tx
      );
      await writeReminderFire(this.d.outbox, tx, row);
      return row;
    });
    return toView(created);
  }

  /** Nhắc lại của tôi: đang chờ (sắp nhắc trước) hoặc đã nhắc (mới nhất trước). `preview` chỉ khi tin còn đọc được TẠI THỜI ĐIỂM XEM (kiểm quyền lại từng tin). */
  async listMine(user: AuthUser, query: ListMyRemindersQueryDto): Promise<CursorPage<ReminderView>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");
    const rows = await this.d.reminders.listMine(user.id, query.status, cursor, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const previews = await Promise.all(page.map((r) => this.previewOf(user, r)));
    const last = page[page.length - 1];
    return { data: page.map((r, i) => toView(r, previews[i])), nextCursor: hasMore && last ? encodeCursor(last.remindAt, last.id) : null, hasMore, limit: query.limit };
  }

  /** Xoá nhắc của mình: `PENDING → CANCELLED` (CAS). Không phải của mình/không tồn tại → 404; nhắc đã phát/đã huỷ → trả yên lặng (không còn gì để huỷ). */
  async cancel(user: AuthUser, id: string): Promise<void> {
    const cancelled = await this.d.reminders.cancel(id, user.id, this.now());
    if (cancelled) return;
    const existing = await this.d.reminders.findById(id);
    if (!existing || existing.userId !== user.id) throw chatErrors.notFound();
  }

  /**
   * Job `message.reminder` (đến hạn). Quyền đọc tin kiểm TRƯỚC (chỉ đọc), rồi trong MỘT transaction: claim CAS `PENDING → FIRED` (kèm `unavailable`) + `notify()`. Người nhận không còn hoạt động
   * → vẫn đánh dấu đã phát nhưng không thông báo. Chạy hai lần → lần sau `SKIPPED`.
   */
  async fire(reminderId: string): Promise<FireOutcome> {
    const reminder = await this.d.reminders.findById(reminderId);
    if (!reminder || reminder.status !== "PENDING") return "SKIPPED";

    const person = (await this.d.directory.users([reminder.userId])).get(reminder.userId);
    const active = person?.status === "ACTIVE";
    const message = active ? await this.d.sender.getReadable(reminder.userId, reminder.messageId) : null;
    const unavailable = !message || message.deletedAt !== null;

    const claimed = await this.d.tx.run(async (tx) => {
      const next = await this.d.reminders.claimFire(reminderId, { at: this.now(), unavailable }, tx);
      if (!next) return null;
      if (active) {
        await this.d.notifier.reminder(tx, { reminderId, userId: reminder.userId, messageId: reminder.messageId, scopeType: reminder.scopeType, scopeId: reminder.scopeId, unavailable });
      }
      return next;
    });
    return claimed ? "FIRED" : "SKIPPED";
  }

  /** Cron quét bù: các nhắc `PENDING` quá `remindAt` mà job hẹn giờ bị lỡ. */
  findMissed(missedBefore: Date, limit: number): Promise<MessageReminderEntity[]> {
    return this.d.reminders.findMissed(missedBefore, limit);
  }

  /** Ẩn danh hoá tài khoản: huỷ mọi nhắc `PENDING` của người đó. */
  cancelAllOfUser(userId: string): Promise<number> {
    return this.d.reminders.cancelPendingOfUser(userId, this.now());
  }

  private async previewOf(user: AuthUser, r: MessageReminderEntity): Promise<string | undefined> {
    const message = await this.d.sender.getReadable(user.id, r.messageId);
    if (!message || message.deletedAt !== null || !message.content) return undefined;
    // Cắt theo ký tự (code point) — không xé đôi cặp surrogate của emoji.
    const chars = [...message.content];
    return chars.length > PREVIEW_CHARS ? `${chars.slice(0, PREVIEW_CHARS).join("")}…` : message.content;
  }
}
