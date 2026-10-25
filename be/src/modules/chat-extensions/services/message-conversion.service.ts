import { createHash } from "crypto";
import { env } from "../../../core/config";
import { NotImplementedError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { IMessageSendPort, PortReadableMessage } from "../../../shared/ports/message-send.port";
import type { IResourceCreationPort, ResourceCreationResult } from "../../../shared/ports/resource-creation.port";
import type { ITaskCreationPort, TaskCreationResult } from "../../../shared/ports/task-creation.port";
import { chatErrors } from "../chat-extensions.errors";
import type { ToResourceDto, ToTaskDto } from "../dtos";
import type { IChatDirectory } from "../repositories/chat-directory.interface";

/** Độ dài tối đa (ký tự hiển thị) của phần trích dẫn đưa vào mô tả thẻ. */
const QUOTE_MAX_CHARS = 1000;

export interface MessageConversionDeps {
  sender: IMessageSendPort;
  directory: Pick<IChatDirectory, "channelVisibility">;
  /** Cổng tạo thẻ (`projects`). Thiếu → `to-task` trả 501 `SYS_501`. */
  tasks?: ITaskCreationPort;
  /** Cổng lưu tài liệu (`resources`, p3-01: `ResourceCreationPortImpl`, xem `resources/public.ts`). Thiếu (test) → `to-resource` trả 501 `SYS_501`. */
  resources?: IResourceCreationPort;
  deepLinkOf?: (message: Pick<PortReadableMessage, "id" | "scopeType" | "scopeId">) => string;
  now?: () => Date;
}

export interface ToTaskResult {
  task: TaskCreationResult["task"];
  /** `false` khi cùng yêu cầu (`Idempotency-Key`) đã tạo thẻ trước đó. */
  created: boolean;
  sourceRef: { kind: "TASK"; refId: string };
}

export interface ToResourceResult {
  resources: ResourceCreationResult[];
  sourceRefs: Array<{ kind: "RESOURCE"; refId: string }>;
}

/** Liên kết mở đúng tin (`?m=<messageId>` — cùng quy ước `InboxItem`); người mở KHÔNG có quyền đọc phạm vi vẫn nhận 404 của `messages`. */
export function defaultDeepLink(message: Pick<PortReadableMessage, "id" | "scopeType" | "scopeId">): string {
  const path = message.scopeType === "CHANNEL" ? "channels" : "conversations";
  return `${env.PUBLIC_APP_LINK_BASE}/${path}/${message.scopeId}?m=${message.id}`;
}

/** Trích dẫn dạng markdown (`> …` mỗi dòng), cắt còn `QUOTE_MAX_CHARS` ký tự hiển thị. */
export function quoteOf(content: string): string {
  const chars = [...content.trim()];
  const text = chars.length > QUOTE_MAX_CHARS ? `${chars.slice(0, QUOTE_MAX_CHARS).join("")}…` : chars.join("");
  return text.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
}

/**
 * Chuyển tin thành thẻ công việc / lưu tệp vào tài liệu (p7-04 be.md §5.5–§5.6) — qua CỔNG của module sở hữu (`ITaskCreationPort`, `IResourceCreationPort`), không đụng `Task`/`Resource` trực tiếp.
 * Nguyên tắc "không mở rộng quyền ngầm": người chuyển phải ĐỌC được tin; thẻ chỉ mang THAM CHIẾU về tin và một trích dẫn CHỈ khi bảng cùng nhóm với tin và tin không phải 1-1 (tin riêng tư
 * không bị sao chép sang bảng của nhóm khác); tệp KHÔNG sao chép (cùng `assetId`), và lưu vào kho từ hội thoại/kênh riêng tư phải có xác nhận mở rộng người xem.
 */
export class MessageConversionService {
  constructor(private readonly d: MessageConversionDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  /** `requestId` = `Idempotency-Key` của request: cùng khoá không sinh hai thẻ (cùng bảng, cùng người); khoá khác cho phép tạo THÊM một thẻ từ cùng tin. */
  async toTask(user: AuthUser, messageId: string, dto: ToTaskDto, requestId: string): Promise<ToTaskResult> {
    const message = await this.requireConvertible(user, messageId);
    if (!this.d.tasks) throw new NotImplementedError("Chuyển tin thành công việc chưa được cấu hình");

    // Kiểm quyền tạo thẻ TRƯỚC mọi ghi; lấy `workspaceId` của bảng để so với nhóm của tin.
    const board = await this.d.tasks.assertCanCreate(user, dto.boardId);
    const direct = message.workspaceId === null;
    if (!direct && board.workspaceId !== message.workspaceId) {
      throw new ValidationError("Bảng không thuộc cùng nhóm với tin nhắn", { reason: "WORKSPACE_MISMATCH" });
    }

    const link = (this.d.deepLinkOf ?? defaultDeepLink)(message);
    const quote = dto.includeQuote && !direct && message.content ? quoteOf(message.content) : null;
    const created = await this.d.tasks.createFromMessage({
      actor: user,
      boardId: dto.boardId,
      ...(dto.columnId ? { columnId: dto.columnId } : {}),
      title: dto.title,
      assigneeIds: dto.assigneeIds,
      ...(dto.dueDate ? { dueDate: dto.dueDate } : {}),
      description: quote ? `${quote}\n\n${link}` : link,
      sourceMessageRef: { scopeType: message.scopeType, scopeId: message.scopeId, messageId: message.id, workspaceId: message.workspaceId },
      // Băm khoá yêu cầu (tối đa 128 ký tự) để `clientTaskId` luôn ≤ 64: `msg-<24 hex>-<16 hex>` = 45 ký tự.
      clientTaskId: `msg-${message.id}-${createHash("sha1").update(requestId).digest("hex").slice(0, 16)}`,
    });
    await this.d.sender.appendSourceRef(message.id, { kind: "TASK", refId: created.task.id, createdBy: user.id, createdAt: this.now() });
    return { task: created.task, created: created.created, sourceRef: { kind: "TASK", refId: created.task.id } };
  }

  async toResource(user: AuthUser, messageId: string, dto: ToResourceDto): Promise<ToResourceResult> {
    const message = await this.requireConvertible(user, messageId);
    if (!this.d.resources) throw new NotImplementedError("Lưu tệp vào tài liệu chưa được cấu hình");

    const attachments = new Map(message.attachments.map((a) => [a.assetId, a]));
    const foreign = dto.assetIds.filter((id) => !attachments.has(id));
    if (foreign.length > 0) throw new ValidationError("Tệp không thuộc tin nhắn này", { reason: "ASSET_NOT_IN_MESSAGE", assetIds: foreign });

    await this.d.resources.assertCanUpload(user, dto.workspaceId);
    const direct = message.workspaceId === null;
    if (!direct && dto.workspaceId !== message.workspaceId) throw new ValidationError("Nhóm đích không phải nhóm của tin nhắn", { reason: "WORKSPACE_MISMATCH" });

    // Lưu vào kho nhóm cho MỌI thành viên nhóm thấy: nếu nguồn hẹp hơn (hội thoại, kênh riêng tư) thì đó là MỞ RỘNG quyền xem tệp — phải có xác nhận rõ ràng.
    const expands = message.scopeType === "CONVERSATION" || (await this.d.directory.channelVisibility(message.scopeId)) !== "PUBLIC";
    if (expands && !dto.confirmVisibilityExpansion) {
      throw new ValidationError("Tệp sẽ hiển thị cho mọi thành viên của nhóm đích, cần xác nhận", { requiresConfirmation: true, audience: "WORKSPACE" });
    }

    const resources: ResourceCreationResult[] = [];
    for (const assetId of dto.assetIds) {
      const attachment = attachments.get(assetId) as NonNullable<ReturnType<typeof attachments.get>>;
      resources.push(
        await this.d.resources.createFromExistingAsset({
          actor: user,
          workspaceId: dto.workspaceId,
          ...(dto.folderId ? { folderId: dto.folderId } : {}),
          assetId,
          name: attachment.name,
          source: { messageId: message.id },
        })
      );
    }
    for (const r of resources) await this.d.sender.appendSourceRef(message.id, { kind: "RESOURCE", refId: r.id, createdBy: user.id, createdAt: this.now() });
    return { resources, sourceRefs: resources.map((r) => ({ kind: "RESOURCE" as const, refId: r.id })) };
  }

  /** Tin người dùng CÒN nguyên và người gọi ĐỌC được: không đọc được/không tồn tại → 404 `MSG_012`; đã thu hồi hoặc không phải tin người dùng thường → 409 `MSG_006`. */
  private async requireConvertible(user: AuthUser, messageId: string): Promise<PortReadableMessage> {
    const message = await this.d.sender.getReadable(user.id, messageId);
    if (!message) throw chatErrors.messageNotFound();
    if (message.deletedAt !== null || message.kind !== "USER") throw chatErrors.messageNotConvertible();
    return message;
  }
}
