/**
 * Bộ dựng dùng CHUNG cho unit test `chat-extensions` (KHÔNG phải test): repository in-memory + cổng giả (`IMessageSendPort`, socket, throttle, cổng quyền, tệp, thông báo, hàng đợi). Không mock
 * thứ đang được kiểm — service chạy đúng mã thật; chỉ hạ tầng (Mongo/Redis/BullMQ/socket) là bản giả có ghi lại lời gọi.
 */
import { AppError, ScopeNotFoundError } from "../../../../core/exceptions";
import type { AuthUser } from "../../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import { newObjectId } from "../../../../core/utils/object-id";
import type {
  IMessageSendPort,
  MessageDraftInput,
  NormalizedDraft,
  PortReadableMessage,
  PortScopeType,
  PortSourceRef,
  PortWriteAccess,
  SendMessageAsInput,
  SendMessageAsResult,
} from "../../../../shared/ports/message-send.port";
import type { IResourceCreationPort, ResourceCreationInput, ResourceCreationResult } from "../../../../shared/ports/resource-creation.port";
import type { ITaskCreationPort, TaskCreationInput, TaskCreationResult } from "../../../../shared/ports/task-creation.port";
import type { ChatScopeType, PollEntity } from "../../entities/chat-extensions.types";
import { InMemoryChatDirectory } from "../../repositories/chat-directory.inmemory";
import { InMemoryMessageReminderRepository } from "../../repositories/message-reminder.repository.inmemory";
import { InMemoryPollVoteRepository } from "../../repositories/poll-vote.repository.inmemory";
import { InMemoryPollRepository } from "../../repositories/poll.repository.inmemory";
import { InMemoryScheduledMessageRepository } from "../../repositories/scheduled-message.repository.inmemory";
import { InMemoryOutboxPort, InMemoryTxRunner, type TxHandle } from "../../repositories/tx";
import type { ChatExtLimits } from "../../services/chat-extensions-limits";
import type { ChatPermissionKey, ChatPermissionScope, IChatEmitter, IChatNotifier, IChatPermissionGate, IEmitThrottle, IScheduledAssetPort } from "../../services/chat-extensions-ports";
import { ChatExtensionsSweepService, type IJobEnqueuer } from "../../services/chat-extensions-sweep.service";
import { ChatExtensionsUserDataService } from "../../services/chat-extensions-user-data.service";
import { MessageConversionService } from "../../services/message-conversion.service";
import { MessageReminderService } from "../../services/message-reminder.service";
import { PollPublisher } from "../../services/poll-publisher";
import { PollReaderService } from "../../services/poll-reader.service";
import { PollService } from "../../services/poll.service";
import { ScheduledMessageDispatchService } from "../../services/scheduled-message-dispatch.service";
import { ScheduledMessageService } from "../../services/scheduled-message.service";

export const WS = "a1".repeat(12);
export const CH = "c1".repeat(12);
export const CONV = "c2".repeat(12);

/** Giới hạn cố định cho test (không đọc `SystemConfig`). */
export const TEST_LIMITS: ChatExtLimits = {
  poll: { optionsMin: 2, optionsMax: 10, questionMax: 300, optionMax: 100, closesInMaxDays: 30, closeMinLeadSeconds: 60, votersPageMax: 100 },
  scheduled: { pendingPerUserMax: 50, sendAtMaxDays: 30, minLeadSeconds: 60, staleSendingSeconds: 120, sendRetries: 3 },
  reminder: { pendingPerUserMax: 100, remindAtMaxDays: 365, minLeadSeconds: 60 },
};

const key = (userId: string, scopeType: PortScopeType, scopeId: string): string => `${userId}:${scopeType}:${scopeId}`;

interface FakeMessage {
  id: string;
  scopeType: PortScopeType;
  scopeId: string;
  workspaceId: string | null;
  threadId: string | null;
  authorId: string;
  kind: "USER" | "SYSTEM" | "POLL";
  content: string | null;
  attachments: Array<{ assetId: string; kind: "FILE"; name: string; mime: string; size: number }>;
  deletedAt: Date | null;
  createdAt: Date;
  seq: number;
}

interface Access {
  readable: boolean;
  allowed: boolean;
  canModerate: boolean;
}

/** Cổng gửi tin giả: quyền theo (người, phạm vi), idempotency theo (tác giả, clientMessageId), `onCreated` chạy như engine thật, có thể ép lỗi lần gửi kế tiếp. */
export class FakeMessageSendPort implements IMessageSendPort {
  readonly messages = new Map<string, FakeMessage>();
  readonly sent: SendMessageAsInput[] = [];
  readonly sourceRefs: Array<{ messageId: string; ref: PortSourceRef }> = [];
  /** Lỗi ném ở các lần `send` kế tiếp (mỗi phần tử dùng một lần). */
  sendErrors: Error[] = [];
  draftError: Error | null = null;
  private readonly access = new Map<string, Access>();
  private readonly workspaceOf = new Map<string, string | null>();
  private readonly inactive = new Set<string>();
  private readonly byClientId = new Map<string, string>();
  private seq = 0;

  constructor(private readonly clock: () => Date) {}

  /** Khai phạm vi (kênh/hội thoại) và nhóm chứa nó (`null` = 1-1). */
  setScope(scopeType: PortScopeType, scopeId: string, workspaceId: string | null): void {
    this.workspaceOf.set(`${scopeType}:${scopeId}`, workspaceId);
  }

  grant(userId: string, scopeType: PortScopeType, scopeId: string, patch: Partial<Access> = {}): void {
    this.access.set(key(userId, scopeType, scopeId), { readable: true, allowed: true, canModerate: false, ...patch });
  }

  revoke(userId: string, scopeType: PortScopeType, scopeId: string): void {
    this.access.set(key(userId, scopeType, scopeId), { readable: false, allowed: false, canModerate: false });
  }

  deactivate(userId: string): void {
    this.inactive.add(userId);
  }

  deleteMessage(id: string): void {
    const m = this.messages.get(id);
    if (m) this.messages.set(id, { ...m, deletedAt: this.clock(), content: null, attachments: [] });
  }

  /** Chèn thẳng một tin (không qua `send`) — cho test đọc/chuyển đổi. */
  seedMessage(over: Partial<FakeMessage> & Pick<FakeMessage, "authorId">): FakeMessage {
    const scopeType = over.scopeType ?? "CHANNEL";
    const scopeId = over.scopeId ?? CH;
    const m: FakeMessage = {
      id: newObjectId(),
      scopeType,
      scopeId,
      workspaceId: this.workspaceOf.get(`${scopeType}:${scopeId}`) ?? null,
      threadId: null,
      kind: "USER",
      content: "Nội dung tin",
      attachments: [],
      deletedAt: null,
      createdAt: this.clock(),
      seq: (this.seq += 1),
      ...over,
    };
    this.messages.set(m.id, m);
    return m;
  }

  private accessOf(userId: string, scopeType: PortScopeType, scopeId: string): Access {
    if (this.inactive.has(userId)) return { readable: false, allowed: false, canModerate: false };
    return this.access.get(key(userId, scopeType, scopeId)) ?? { readable: false, allowed: false, canModerate: false };
  }

  async canWrite(userId: string, scopeType: PortScopeType, scopeId: string): Promise<PortWriteAccess> {
    const a = this.accessOf(userId, scopeType, scopeId);
    return { readable: a.readable, allowed: a.readable && a.allowed, workspaceId: a.readable ? (this.workspaceOf.get(`${scopeType}:${scopeId}`) ?? null) : null };
  }

  async send(input: SendMessageAsInput): Promise<SendMessageAsResult> {
    const next = this.sendErrors.shift();
    if (next) throw next;
    const a = this.accessOf(input.authorId, input.scopeType, input.scopeId);
    if (!a.readable) throw new ScopeNotFoundError();
    if (!a.allowed) throw new AppError(ErrorMessages[ErrorCode.MSG_004], 403, ErrorCode.MSG_004);
    this.sent.push(input);

    const dedupe = `${input.authorId}:${input.clientMessageId}`;
    const existingId = this.byClientId.get(dedupe);
    if (existingId) return { view: this.viewOf(this.messages.get(existingId) as FakeMessage), replayed: true };

    const message: FakeMessage = {
      id: newObjectId(),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      workspaceId: this.workspaceOf.get(`${input.scopeType}:${input.scopeId}`) ?? null,
      threadId: input.threadId ?? null,
      authorId: input.authorId,
      kind: input.kind ?? "USER",
      content: input.content ?? null,
      attachments: (input.attachmentAssetIds ?? []).map((assetId) => ({ assetId, kind: "FILE", name: `${assetId.slice(0, 4)}.pdf`, mime: "application/pdf", size: 10 })),
      deletedAt: null,
      createdAt: this.clock(),
      seq: (this.seq += 1),
    };
    this.messages.set(message.id, message);
    this.byClientId.set(dedupe, message.id);
    if (input.onCreated) {
      await input.onCreated({} as unknown as TxHandle, {
        id: message.id,
        scopeType: message.scopeType,
        scopeId: message.scopeId,
        workspaceId: message.workspaceId,
        threadId: message.threadId,
        authorId: message.authorId,
        kind: message.kind,
        createdAt: message.createdAt,
      });
    }
    return { view: this.viewOf(message), replayed: false };
  }

  private viewOf(m: FakeMessage): SendMessageAsResult["view"] {
    return { id: m.id, scopeType: m.scopeType, scopeId: m.scopeId, threadId: m.threadId, seq: m.seq, kind: m.kind, authorId: m.authorId, content: m.content, version: 1, createdAt: m.createdAt };
  }

  async getReadable(userId: string, messageId: string): Promise<PortReadableMessage | null> {
    const m = this.messages.get(messageId);
    if (!m) return null;
    const a = this.accessOf(userId, m.scopeType, m.scopeId);
    if (!a.readable) return null;
    return {
      id: m.id,
      scopeType: m.scopeType,
      scopeId: m.scopeId,
      workspaceId: m.workspaceId,
      threadId: m.threadId,
      authorId: m.authorId,
      kind: m.kind,
      createdAt: m.createdAt,
      content: m.deletedAt ? null : m.content,
      attachments: m.deletedAt ? [] : m.attachments,
      deletedAt: m.deletedAt,
      sourceRefs: this.sourceRefs.filter((s) => s.messageId === m.id).map((s) => s.ref),
      myPermissions: { canModerate: a.canModerate, canWrite: a.allowed },
    };
  }

  async validateDraft(_userId: string, _scopeType: PortScopeType, _scopeId: string, draft: MessageDraftInput): Promise<NormalizedDraft> {
    if (this.draftError) throw this.draftError;
    const content = draft.content?.trim() ? draft.content.trim() : null;
    if (!content && (draft.attachmentAssetIds ?? []).length === 0) throw new AppError(ErrorMessages[ErrorCode.MSG_007], 400, ErrorCode.MSG_007);
    return { content, mentions: draft.mentions ?? [], attachmentAssetIds: draft.attachmentAssetIds ?? [], replyToId: draft.replyToId ?? null };
  }

  async appendSourceRef(messageId: string, ref: PortSourceRef): Promise<void> {
    if (!this.sourceRefs.some((s) => s.messageId === messageId && s.ref.kind === ref.kind && s.ref.refId === ref.refId)) this.sourceRefs.push({ messageId, ref });
  }
}

export class RecordingEmitter implements IChatEmitter {
  readonly rooms: Array<{ room: string; event: string; payload: Record<string, unknown> }> = [];
  readonly users: Array<{ userIds: string[]; event: string; payload: Record<string, unknown> }> = [];

  toRoom(room: string, event: string, payload: Record<string, unknown>): void {
    this.rooms.push({ room, event, payload });
  }

  toUsers(userIds: string[], event: string, payload: Record<string, unknown>): void {
    this.users.push({ userIds, event, payload });
  }
}

/** Nhịp phát giả: `allow=true` mặc định (phát ngay); đặt `false` để mô phỏng "hết vé" → ghi vào `trailing`. */
export class FakeThrottle implements IEmitThrottle {
  allow = true;
  readonly trailing: string[] = [];

  async tryAcquire(): Promise<boolean> {
    return this.allow;
  }

  async scheduleTrailing(poll: Pick<PollEntity, "id">): Promise<void> {
    this.trailing.push(poll.id);
  }
}

export class FakeGate implements IChatPermissionGate {
  readonly calls: Array<{ key: ChatPermissionKey; scope: ChatPermissionScope }> = [];
  private readonly denied = new Set<string>();

  deny(userId: string, permission: ChatPermissionKey): void {
    this.denied.add(`${userId}:${permission}`);
  }

  async assert(user: AuthUser, permission: ChatPermissionKey, scope: ChatPermissionScope): Promise<void> {
    this.calls.push({ key: permission, scope });
    if (this.denied.has(`${user.id}:${permission}`)) throw new AppError(ErrorMessages[ErrorCode.PERM_001], 403, ErrorCode.PERM_001);
  }
}

export class FakeAssetPort implements IScheduledAssetPort {
  readonly attached: Array<{ assetIds: string[]; scheduledMessageId: string }> = [];
  readonly detached: Array<{ scheduledMessageId: string; assetIds?: string[] }> = [];

  async attach(_tx: TxHandle, input: { assetIds: string[]; scheduledMessageId: string; actorId: string }): Promise<void> {
    this.attached.push({ assetIds: input.assetIds, scheduledMessageId: input.scheduledMessageId });
  }

  async detach(_tx: TxHandle, input: { scheduledMessageId: string; assetIds?: string[] }): Promise<void> {
    this.detached.push(input);
  }
}

export class FakeNotifier implements IChatNotifier {
  readonly failed: Array<{ scheduledMessageId: string; authorId: string; reason: string }> = [];
  readonly reminders: Array<{ reminderId: string; userId: string; messageId: string; unavailable: boolean; refs: Record<string, unknown> }> = [];

  async scheduledFailed(_tx: TxHandle, input: { scheduledMessageId: string; authorId: string; reason: string }): Promise<void> {
    this.failed.push(input);
  }

  async reminder(_tx: TxHandle, input: { reminderId: string; userId: string; messageId: string; scopeType: ChatScopeType; scopeId: string; unavailable: boolean }): Promise<void> {
    // Cùng quy tắc `refs` của `NotifyChatNotifier`: tin không khả dụng KHÔNG mang messageId/phạm vi.
    const refs = input.unavailable ? { reminderId: input.reminderId, unavailable: true } : { reminderId: input.reminderId, messageId: input.messageId, scopeType: input.scopeType, scopeId: input.scopeId };
    this.reminders.push({ reminderId: input.reminderId, userId: input.userId, messageId: input.messageId, unavailable: input.unavailable, refs });
  }
}

export class FakeEnqueuer implements IJobEnqueuer {
  readonly jobs: Array<{ queue: string; name: string; payload: object; jobId: string }> = [];

  async enqueue(queue: string, name: string, payload: object, jobId: string): Promise<void> {
    this.jobs.push({ queue, name, payload, jobId });
  }
}

export class FakeTaskPort implements ITaskCreationPort {
  readonly created: TaskCreationInput[] = [];
  /** `boardId → workspaceId` của các bảng người gọi có quyền tạo thẻ; bảng lạ → 404. */
  readonly boards = new Map<string, string>();
  private readonly byClientId = new Map<string, TaskCreationResult["task"]>();

  async assertCanCreate(_actor: AuthUser, boardId: string): Promise<{ workspaceId: string }> {
    const workspaceId = this.boards.get(boardId);
    if (!workspaceId) throw new ScopeNotFoundError();
    return { workspaceId };
  }

  async createFromMessage(input: TaskCreationInput): Promise<TaskCreationResult> {
    const existing = this.byClientId.get(input.clientTaskId);
    if (existing) return { task: existing, created: false };
    this.created.push(input);
    const task = { id: newObjectId(), boardId: input.boardId, title: input.title };
    this.byClientId.set(input.clientTaskId, task);
    return { task, created: true };
  }
}

export class FakeResourcePort implements IResourceCreationPort {
  readonly created: ResourceCreationInput[] = [];
  readonly workspaces = new Set<string>();
  private readonly assets = new Set<string>();

  async assertCanUpload(_actor: AuthUser, workspaceId: string): Promise<void> {
    if (!this.workspaces.has(workspaceId)) throw new ScopeNotFoundError();
  }

  async createFromExistingAsset(input: ResourceCreationInput): Promise<ResourceCreationResult> {
    if (this.assets.has(input.assetId)) throw new AppError(ErrorMessages[ErrorCode.RSC_003], 409, ErrorCode.RSC_003);
    this.assets.add(input.assetId);
    this.created.push(input);
    return { id: newObjectId(), assetId: input.assetId, name: input.name };
  }
}

export class ChatExtHarness {
  clock = new Date("2026-09-27T10:00:00.000Z");
  readonly now = (): Date => this.clock;
  readonly limits = async (): Promise<ChatExtLimits> => TEST_LIMITS;

  readonly polls = new InMemoryPollRepository(this.now);
  readonly votes = new InMemoryPollVoteRepository(this.now);
  readonly scheduled = new InMemoryScheduledMessageRepository(this.now);
  readonly reminderRepo = new InMemoryMessageReminderRepository(this.now);
  readonly directory = new InMemoryChatDirectory();
  readonly sender = new FakeMessageSendPort(this.now);
  readonly emitter = new RecordingEmitter();
  readonly throttle = new FakeThrottle();
  readonly gate = new FakeGate();
  readonly assets = new FakeAssetPort();
  readonly notifier = new FakeNotifier();
  readonly enqueuer = new FakeEnqueuer();
  readonly tasks = new FakeTaskPort();
  readonly resources = new FakeResourcePort();
  readonly outbox = new InMemoryOutboxPort();
  readonly tx = new InMemoryTxRunner();
  /** Cờ phụ `scheduledMessages` (dispatch kiểm lại lúc phát). */
  scheduledMessagesEnabled = true;

  readonly publisher = new PollPublisher(this.polls, this.emitter, this.throttle);
  readonly pollService = new PollService({
    polls: this.polls,
    votes: this.votes,
    directory: this.directory,
    sender: this.sender,
    gate: this.gate,
    publisher: this.publisher,
    tx: this.tx,
    outbox: this.outbox,
    limits: this.limits,
    now: this.now,
    sleep: async () => undefined,
  });
  readonly pollReader = new PollReaderService(this.polls, this.votes, this.now);
  readonly dispatch = new ScheduledMessageDispatchService({
    scheduled: this.scheduled,
    sender: this.sender,
    directory: this.directory,
    assets: this.assets,
    notifier: this.notifier,
    emitter: this.emitter,
    tx: this.tx,
    subFeatureEnabled: async () => this.scheduledMessagesEnabled,
    limits: this.limits,
    now: this.now,
  });
  readonly scheduledService = new ScheduledMessageService({
    scheduled: this.scheduled,
    sender: this.sender,
    gate: this.gate,
    assets: this.assets,
    directory: this.directory,
    dispatcher: this.dispatch,
    emitter: this.emitter,
    tx: this.tx,
    outbox: this.outbox,
    limits: this.limits,
    now: this.now,
  });
  readonly reminderService = new MessageReminderService({
    reminders: this.reminderRepo,
    sender: this.sender,
    directory: this.directory,
    notifier: this.notifier,
    tx: this.tx,
    outbox: this.outbox,
    limits: this.limits,
    now: this.now,
  });
  readonly conversion = new MessageConversionService({
    sender: this.sender,
    directory: this.directory,
    tasks: this.tasks,
    resources: this.resources,
    deepLinkOf: (m) => `https://app.test/${m.scopeType === "CHANNEL" ? "channels" : "conversations"}/${m.scopeId}?m=${m.id}`,
    now: this.now,
  });
  readonly sweep = new ChatExtensionsSweepService(this.scheduled, this.reminderRepo, this.pollService, this.enqueuer, this.limits, this.now);
  readonly userData = new ChatExtensionsUserDataService(this.scheduled, this.reminderRepo, this.votes, this.assets, this.tx, this.now);

  constructor() {
    this.sender.setScope("CHANNEL", CH, WS);
    this.sender.setScope("CONVERSATION", CONV, null);
  }

  /** Người dùng ACTIVE có quyền đọc + ghi ở kênh `CH` (mặc định) — `over` đổi quyền/phạm vi. */
  addUser(over: { scopeType?: PortScopeType; scopeId?: string; access?: Partial<{ readable: boolean; allowed: boolean; canModerate: boolean }> | null } = {}): AuthUser {
    const id = newObjectId();
    this.directory.addUser(id);
    const scopeType = over.scopeType ?? "CHANNEL";
    const scopeId = over.scopeId ?? (scopeType === "CHANNEL" ? CH : CONV);
    if (over.access !== null) this.sender.grant(id, scopeType, scopeId, over.access);
    return { id, email: `${id}@e.com`, name: `Người ${id.slice(-4)}`, role: "user", permissions: [] };
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** `sendAt`/`remindAt` cách hiện tại `ms` mili giây. */
  after(ms: number): Date {
    return new Date(this.clock.getTime() + ms);
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const pollDto = (over: Partial<{ clientMessageId: string; question: string; options: string[]; multi: boolean; anonymous: boolean; closesAt: Date; threadId: string }> = {}) => ({
  clientMessageId: newObjectId(),
  question: "Đi ăn ở đâu?",
  options: ["Phở", "Bún"],
  multi: false,
  anonymous: false,
  ...over,
});
