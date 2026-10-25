import type { AuthUser } from "../../../core/types/express";
import type { MessageModerationPort } from "../../../shared/ports/message-moderation.port";
import type { Report } from "../entities/report.interface";
import type {
  DirectoryChannel,
  DirectoryConversation,
  IModerationDirectory,
} from "../repositories/moderation-directory.repository.interface";

/** Ký tự hex 24 — id hợp lệ cho test (ObjectId giả). */
export const oid = (c: string): string => c.repeat(24).slice(0, 24);

export const REPORTER: AuthUser = { id: oid("1"), email: "reporter@test.local", role: "user" };
export const AUTHOR = oid("2");
export const WS = oid("a");
export const CHANNEL_ID = oid("c");
export const CONV_ID = oid("d");
export const MSG_ID = oid("e");

let seq = 0;
/** Báo cáo mẫu — mặc định: MESSAGE trong kênh PUBLIC của `WS`, xử lý theo phạm vi. */
export function makeReport(overrides: Partial<Report> = {}): Report {
  seq += 1;
  const createdAt = new Date(Date.UTC(2026, 8, 19, 0, 0, seq));
  return {
    id: oid("9").slice(0, 20) + String(seq).padStart(4, "0"),
    reporterId: REPORTER.id,
    targetType: "MESSAGE",
    targetId: MSG_ID,
    groupKey: `MESSAGE:${MSG_ID}`,
    scopeType: "CHANNEL",
    scopeId: CHANNEL_ID,
    scopeIsPrivate: false,
    workspaceId: WS,
    targetAuthorId: AUTHOR,
    handlerLevel: "SCOPE",
    reason: "SPAM",
    description: null,
    status: "OPEN",
    resolution: null,
    resolutionNote: null,
    resolvedBy: null,
    resolvedAtLevel: null,
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

/** Danh bạ giả — mọi hàm trả rỗng/false trừ khi test ghi đè. */
export function makeDirectory(overrides: Partial<IModerationDirectory> = {}): jest.Mocked<IModerationDirectory> {
  return {
    findUsers: jest.fn().mockResolvedValue([]),
    findWorkspaces: jest.fn().mockResolvedValue([]),
    findChannels: jest.fn().mockResolvedValue([]),
    findConversations: jest.fn().mockResolvedValue([]),
    isActiveWorkspaceMember: jest.fn().mockResolvedValue(true),
    listWorkspaceAdminIds: jest.fn().mockResolvedValue([]),
    findWorkspaceOwnerId: jest.fn().mockResolvedValue(null),
    listChannelManagerIds: jest.fn().mockResolvedValue([]),
    listConversationAdminIds: jest.fn().mockResolvedValue([]),
    listConversationMemberIds: jest.fn().mockResolvedValue([]),
    listPlatformModeratorIds: jest.fn().mockResolvedValue([]),
    listManagedPrivateChannelIds: jest.fn().mockResolvedValue([]),
    listAdministeredGroupIds: jest.fn().mockResolvedValue([]),
    notificationExists: jest.fn().mockResolvedValue(false),
    ...overrides,
  } as jest.Mocked<IModerationDirectory>;
}

/** Port tin nhắn giả — mặc định KHÔNG thấy/không kiểm duyệt được gì. */
export function makeMessagePort(overrides: Partial<MessageModerationPort> = {}): jest.Mocked<MessageModerationPort> {
  return {
    findReadable: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
    canReadScope: jest.fn().mockResolvedValue(false),
    canModerateScope: jest.fn().mockResolvedValue(false),
    removeByModerator: jest.fn().mockResolvedValue({ messageId: MSG_ID, deletedAt: new Date(), alreadyDeleted: false }),
    contextAround: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as jest.Mocked<MessageModerationPort>;
}

export const publicChannel = (over: Partial<DirectoryChannel> = {}): DirectoryChannel => ({
  id: CHANNEL_ID,
  name: "general",
  workspaceId: WS,
  visibility: "PUBLIC",
  status: "ACTIVE",
  ...over,
});

export const conversation = (over: Partial<DirectoryConversation> = {}): DirectoryConversation => ({
  id: CONV_ID,
  kind: "GROUP",
  title: "Nhóm học",
  workspaceId: WS,
  status: "ACTIVE",
  ...over,
});
