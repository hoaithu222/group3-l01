/**
 * Unit — ảnh người dùng trong các DTO `conversations` đọc qua Prisma (mock bảng `User` CHỈ trả field được `select`, như
 * Prisma thật): `avatarUrl` = URL ảnh ký sẵn (`/api/v1/assets/<id>/image?v=THUMB…`, dùng thẳng làm nguồn ảnh) dựng từ
 * `User.avatarAssetId` nạp CÙNG truy vấn user sẵn có; chưa có ảnh (hoặc đã ẩn danh hoá ⇒ `avatarAssetId` null) → `null`.
 */
const mockUserFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockMemberFindFirst = jest.fn();
const mockMemberFindMany = jest.fn();
const mockWsMembershipFindMany = jest.fn();
const mockConversationFindMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a), findMany: (...a: unknown[]) => mockUserFindMany(...a) },
    conversationMember: { findFirst: (...a: unknown[]) => mockMemberFindFirst(...a), findMany: (...a: unknown[]) => mockMemberFindMany(...a) },
    workspaceMembership: { findMany: (...a: unknown[]) => mockWsMembershipFindMany(...a) },
    conversation: { findMany: (...a: unknown[]) => mockConversationFindMany(...a) },
  },
  withTransaction: jest.fn(),
}));
const mockGetStates = jest.fn();
jest.mock("../../presence/presence.service", () => ({ getStates: (...a: unknown[]) => mockGetStates(...a) }));
const mockCheckDirectEligibility = jest.fn();
jest.mock("../services/eligibility.service", () => ({ checkDirectEligibility: (...a: unknown[]) => mockCheckDirectEligibility(...a) }));

import type { AuthUser } from "../../../core/types/express";
import type { Conversation } from "../entities/conversation.interface";
import { buildDirectPeerContext } from "../services/conversation-presenter";
import { ConversationListService } from "../services/conversation-list.service";
import { ConversationMemberService } from "../services/conversation-member.service";
import { ReadReceiptService } from "../services/read-receipt.service";

const ME = "a".repeat(24);
const PEER = "b".repeat(24);
const OTHER = "c".repeat(24);
const WS = "d".repeat(24);
const CONV = "e".repeat(24);
const PEER_AVATAR = "65f0000000000000000000a1";
const viewer: AuthUser = { id: ME, email: "me@e.com" };

interface UserRow {
  id: string;
  name: string;
  avatarAssetId: string | null;
  privacy: { readReceipts: boolean; showPresence: boolean };
}
const USERS: UserRow[] = [
  { id: ME, name: "Tôi", avatarAssetId: null, privacy: { readReceipts: true, showPresence: true } },
  { id: PEER, name: "Bình", avatarAssetId: PEER_AVATAR, privacy: { readReceipts: true, showPresence: true } },
  { id: OTHER, name: "Chi", avatarAssetId: null, privacy: { readReceipts: true, showPresence: true } },
];

type Select = Record<string, boolean>;
const pick = (row: UserRow, select: Select): Partial<UserRow> =>
  Object.fromEntries(Object.entries(row).filter(([key]) => select[key])) as Partial<UserRow>;

const expectSignedAvatar = (url: string | null | undefined, assetId: string): void => {
  expect(url).toContain(`/api/v1/assets/${assetId}/image?v=THUMB`);
  expect(url).not.toContain("/users/");
};

beforeEach(() => {
  mockUserFindUnique.mockImplementation(async (args: { where: { id: string }; select: Select }) => {
    const row = USERS.find((u) => u.id === args.where.id);
    return row ? pick(row, args.select) : null;
  });
  mockUserFindMany.mockImplementation(async (args: { where: { id: { in: string[] } }; select: Select }) =>
    USERS.filter((u) => args.where.id.in.includes(u.id)).map((u) => pick(u, args.select))
  );
  mockGetStates.mockResolvedValue({});
  mockCheckDirectEligibility.mockResolvedValue({ canMessage: true, reason: null });
});

describe("DIRECT — peer.avatarUrl", () => {
  it("buildDirectPeerContext (GET /conversations/:id): người kia có ảnh → peer.avatarUrl là URL ký sẵn", async () => {
    mockMemberFindFirst.mockResolvedValue({ userId: PEER, lastReadSeq: 3, lastReadAt: null });
    const conversation = { id: CONV, kind: "DIRECT" } as Conversation;

    const { peer } = await buildDirectPeerContext(conversation, ME);
    expect(peer).toMatchObject({ userId: PEER, name: "Bình" });
    expectSignedAvatar(peer?.avatarUrl, PEER_AVATAR);
  });
});

describe("GET /conversations/people", () => {
  it("người có ảnh → avatarUrl ký sẵn, chưa có ảnh → null (cùng truy vấn user, không N+1)", async () => {
    mockWsMembershipFindMany
      .mockResolvedValueOnce([{ workspaceId: WS }])
      .mockResolvedValueOnce([{ userId: PEER, workspaceId: WS }, { userId: OTHER, workspaceId: WS }]);
    mockConversationFindMany.mockResolvedValue([]);

    const people = await new ConversationListService().people(viewer, { q: "" });
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expectSignedAvatar(people.find((p) => p.userId === PEER)?.avatarUrl, PEER_AVATAR);
    expect(people.find((p) => p.userId === OTHER)?.avatarUrl).toBeNull();
  });
});

describe("GET /conversations/:id/members", () => {
  it("mỗi thành viên mang avatarUrl theo avatarAssetId của chính người đó", async () => {
    const joinedAt = new Date("2026-09-01T00:00:00.000Z");
    mockMemberFindMany.mockResolvedValue([
      { userId: PEER, role: "OWNER", joinedAt },
      { userId: OTHER, role: "MEMBER", joinedAt },
    ]);

    const { data } = await new ConversationMemberService({ post: jest.fn() }).list(viewer, CONV, { limit: 50 });
    expectSignedAvatar(data.find((m) => m.userId === PEER)?.avatarUrl, PEER_AVATAR);
    expect(data.find((m) => m.userId === OTHER)?.avatarUrl).toBeNull();
  });
});

describe("GET /conversations/:id/read-receipts (ai đã xem)", () => {
  it("người đã xem có ảnh → avatarUrl ký sẵn; chưa có ảnh → null", async () => {
    const readAt = new Date("2026-09-02T00:00:00.000Z");
    mockMemberFindMany.mockResolvedValue([
      { userId: PEER, lastReadAt: readAt },
      { userId: OTHER, lastReadAt: readAt },
    ]);

    const { readers } = await new ReadReceiptService().getReceipts(viewer, CONV, 1);
    expect(readers.map((r) => r.userId)).toEqual([PEER, OTHER]);
    expectSignedAvatar(readers[0]?.avatarUrl, PEER_AVATAR);
    expect(readers[1]?.avatarUrl).toBeNull();
  });
});
