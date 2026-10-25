/**
 * Helper DÙNG CHUNG cho các unit test `MessageService` (KHÔNG phải file test —
 * không khớp `testMatch`). Mỗi file `*.test.ts` vẫn tự khai `jest.mock(...)`
 * riêng (Jest hoist `jest.mock` lên đầu module, không thể gọi hộ từ file khác):
 *   - `infrastructure/database` (`withTransaction`, `prisma.asset.findMany`)
 *   - `infrastructure/queue` (`outbox.add`)
 *   - `assets/public` (`createAssetLinkService`)
 * Ở đây chỉ gom fake repo/scope/DTO builder để không chép lại 5-7 lần.
 */
import { newObjectId } from "../../../../core/utils/object-id";
import type { AuthUser } from "../../../../core/types/express";
import { InMemoryMessageRepository } from "../../repositories/message.repository.inmemory";
import { registerMessageScope, clearMessageScopeRegistry } from "../../scope/message-scope.registry";
import { MessageService } from "../../services/message.service";
import type { MessageScope, MessageScopeCapabilities } from "../../scope/message-scope.interface";
import type { IReactionRepository } from "../../repositories/reaction.repository.interface";
import type { IMessageHideRepository } from "../../repositories/message-hide.repository.interface";
import type { AssetLinkService } from "../../../assets/public";
import type { Message } from "../../entities/message.interface";
import type { SendMessageDto } from "../../dtos/send-message.dto";

export const WS = "a1".repeat(12);
export const CH = "c1".repeat(12);
export const CONV = "c2".repeat(12);
export const U1 = "b1".repeat(12);
export const U2 = "b2".repeat(12);
export const U3 = "b3".repeat(12);
export const U4 = "b4".repeat(12);

export const userOf = (id: string): AuthUser => ({ id, email: `${id}@e.com` });

const FULL_CAPS: MessageScopeCapabilities = { canWrite: true, canReact: true, canPin: true, canModerate: false };

export interface FakeScope extends MessageScope {
  committed: Array<{ scopeId: string; messageId: string; threadKey: string; seq: number }>;
  setAccess(patch: { visible?: boolean; allowed?: boolean }): void;
}

/** Scope giả: mặc định thấy + ghi được, `hiddenBeforeSeq=0`. Ghi lại các lần `onMessageCommitted`. */
export function makeScope(scopeType: "CHANNEL" | "CONVERSATION" = "CHANNEL"): FakeScope {
  let visible = true;
  let allowed = true;
  const committed: FakeScope["committed"] = [];
  return {
    scopeType,
    committed,
    setAccess(patch) {
      if (patch.visible !== undefined) visible = patch.visible;
      if (patch.allowed !== undefined) allowed = patch.allowed;
    },
    async canRead() {
      return { visible, workspaceId: WS };
    },
    async canWrite() {
      return { visible, allowed, workspaceId: WS };
    },
    async viewerContext() {
      return { hiddenBeforeSeq: 0, capabilities: FULL_CAPS };
    },
    pinMax: () => 20,
    async readerIds() {
      return [];
    },
    async onMessageCommitted(_tx, scopeId, info) {
      committed.push({ scopeId, messageId: info.messageId, threadKey: info.threadKey, seq: info.seq });
    },
    async emitActivity() {
      return undefined;
    },
    contentRoom: (scopeId: string) => (scopeType === "CHANNEL" ? `ch:${scopeId}` : `conv:${scopeId}`),
  };
}

export function makeHarness(scopeType: "CHANNEL" | "CONVERSATION" = "CHANNEL") {
  clearMessageScopeRegistry();
  const repo = new InMemoryMessageRepository();
  const scope = makeScope(scopeType);
  registerMessageScope(scopeType, scope);
  const reactionRepo = {
    findMineByMessageIds: async () => new Set<string>(),
    deleteByMessage: async () => undefined,
  } as unknown as IReactionRepository;
  const hideRepo = { findHiddenSeqs: async () => new Set<number>() } as unknown as IMessageHideRepository;
  const assetLinks = { attach: async () => undefined, detach: async () => undefined } as unknown as AssetLinkService;
  const service = new MessageService(repo, reactionRepo, hideRepo, assetLinks);
  return { repo, scope, service, scopeId: scopeType === "CHANNEL" ? CH : CONV };
}

let clientSeq = 0;
/** DTO gửi tin hợp lệ (đã qua Zod: mảng mặc định đủ) — `clientMessageId` luôn khác nhau. */
export function sendDto(over: Partial<SendMessageDto> = {}): SendMessageDto {
  clientSeq += 1;
  const hex = clientSeq.toString(16).padStart(12, "0");
  return {
    clientMessageId: `00000000-0000-4000-8000-${hex}`,
    content: "Xin chào",
    attachments: [],
    mentions: [],
    ...over,
  };
}

/** Chèn thẳng 1 tin vào repo in-memory (bỏ qua `send()`), mặc định là tin USER của `U1` trong kênh `CH`. */
export function seedMessage(repo: InMemoryMessageRepository, over: Partial<Message> = {}): Message {
  const id = over.id ?? newObjectId();
  const message: Message = {
    id,
    scopeType: "CHANNEL",
    scopeId: CH,
    workspaceId: WS,
    threadId: null,
    threadKey: "root",
    seq: 1,
    authorId: U1,
    kind: "USER",
    systemType: null,
    systemPayload: null,
    clientMessageId: null,
    dedupeKey: `seed:${id}`,
    content: "Tin gốc",
    normalizedContent: "tin goc",
    mentions: [],
    attachments: [],
    links: [],
    linkPreview: null,
    replyToId: null,
    replyPreview: null,
    forwardedFrom: null,
    reactionsSummary: [],
    sourceRefs: [],
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    version: 1,
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
    deleteMode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
  repo.seed(message);
  return message;
}
