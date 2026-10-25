/**
 * Ảnh hiển thị của cuộc gọi (hợp đồng `shared/media`): GROUP → ảnh nhóm chat, DIRECT → ảnh NGƯỜI KIA theo góc nhìn người xem, kênh → không
 * ảnh. Chạy `PrismaCallScopeReader` THẬT trên Prisma giả để khoá luôn việc `avatarAssetId` đi CÙNG truy vấn tên (không N+1).
 */
const mockConversationFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockChannelFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  ...jest.requireActual("../../../infrastructure/database"),
  prisma: {
    conversation: { findUnique: (...args: unknown[]) => mockConversationFindUnique(...args) },
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    channel: { findUnique: (...args: unknown[]) => mockChannelFindUnique(...args) },
  },
}));

import { PrismaCallScopeReader } from "../repositories/call-scope.reader";
import { CallScopeService, type CallPermissionPort } from "../services/call-scope.resolver";

const A = "650000000000000000000a01";
const B = "650000000000000000000a02";
const MISSING = "650000000000000000000a09";
const CONV = "650000000000000000000c01";
const AVATAR_A = "65f0000000000000000000aa";
const AVATAR_B = "65f0000000000000000000bb";
const GROUP_AVATAR = "65f0000000000000000000cc";

/** URL ảnh ký sẵn bản THUMB của đúng asset (gốc `PUBLIC_API_URL` tuỳ môi trường). */
const signedThumb = (assetId: string): RegExp => new RegExp(`/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

// `scopeInfo` không hỏi quyền — cổng quyền chỉ để dựng service.
const permission: CallPermissionPort = {
  resolve: () => Promise.reject(new Error("không dùng trong test")),
  can: () => Promise.resolve(false),
};
const scopes = (): CallScopeService => new CallScopeService(new PrismaCallScopeReader(), permission);
const inConversation = { scopeType: "CONVERSATION" as const, scopeId: CONV, initiatorId: A };

function conversationRow(kind: "DIRECT" | "GROUP", avatarAssetId: string | null) {
  const group = kind === "GROUP";
  return { id: CONV, kind, status: "ACTIVE", workspaceId: group ? "650000000000000000000b01" : null, meetingId: null, title: group ? "Nhóm học tập" : null, avatarAssetId };
}

function usersInDb(rows: Array<{ id: string; name: string; avatarAssetId: string | null }>): void {
  mockUserFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(rows.filter((r) => where.id.in.includes(r.id))));
}

describe("CallScopeService.scopeInfo — ảnh hiển thị theo phạm vi", () => {
  it("GROUP có ảnh nhóm chat → avatarUrl là URL ký sẵn (THUMB) của đúng asset; `avatarAssetId` đọc cùng lượt tra hội thoại", async () => {
    mockConversationFindUnique.mockResolvedValue(conversationRow("GROUP", GROUP_AVATAR));

    const info = await scopes().scopeInfo(B, inConversation, [A, B]);

    expect(info).toEqual({ kind: "GROUP", title: "Nhóm học tập", avatarUrl: expect.stringMatching(signedThumb(GROUP_AVATAR)) });
    expect(mockConversationFindUnique).toHaveBeenCalledTimes(1);
    expect(mockConversationFindUnique.mock.calls[0]![0]).toMatchObject({ where: { id: CONV }, select: { avatarAssetId: true } });
    expect(mockUserFindMany).not.toHaveBeenCalled(); // ảnh nhóm không lấy từ thành viên nào
  });

  it("GROUP chưa đặt ảnh → null; hội thoại không còn → null", async () => {
    mockConversationFindUnique.mockResolvedValueOnce(conversationRow("GROUP", null)).mockResolvedValueOnce(null);
    expect((await scopes().scopeInfo(A, inConversation, [A, B])).avatarUrl).toBeNull();
    expect(await scopes().scopeInfo(A, inConversation, [A, B])).toEqual({ title: "", avatarUrl: null, kind: "GROUP" });
  });

  it("DIRECT → tên + ảnh của NGƯỜI KIA theo góc nhìn người xem (người gọi thấy B, người nhận thấy A)", async () => {
    mockConversationFindUnique.mockResolvedValue(conversationRow("DIRECT", null));
    usersInDb([
      { id: A, name: "Người A", avatarAssetId: AVATAR_A },
      { id: B, name: "Người B", avatarAssetId: AVATAR_B },
    ]);

    const asCaller = await scopes().scopeInfo(A, inConversation, [A, B]);
    const asCallee = await scopes().scopeInfo(B, inConversation, [A, B]);

    expect(asCaller).toEqual({ kind: "DIRECT", title: "Người B", avatarUrl: expect.stringMatching(signedThumb(AVATAR_B)) });
    expect(asCallee).toEqual({ kind: "DIRECT", title: "Người A", avatarUrl: expect.stringMatching(signedThumb(AVATAR_A)) });
    expect(mockUserFindMany).toHaveBeenNthCalledWith(1, { where: { id: { in: [B] } }, select: { id: true, name: true, avatarAssetId: true } });
  });

  it("DIRECT với người kia đã ẩn danh hoá (`avatarAssetId` bị xoá) → null; kênh thoại → không có ảnh", async () => {
    mockConversationFindUnique.mockResolvedValue(conversationRow("DIRECT", null));
    usersInDb([{ id: B, name: "Người dùng đã xoá", avatarAssetId: null }]);
    expect(await scopes().scopeInfo(A, inConversation, [A, B])).toEqual({ kind: "DIRECT", title: "Người dùng đã xoá", avatarUrl: null });

    mockChannelFindUnique.mockResolvedValue({ id: "ch1", workspaceId: "ws1", name: "phong-hoc", type: "VOICE", status: "ACTIVE", visibility: "PUBLIC", voiceSettings: null });
    expect(await scopes().scopeInfo(A, { scopeType: "CHANNEL", scopeId: "ch1", initiatorId: A }, [])).toEqual({ title: "phong-hoc", avatarUrl: null, kind: "CHANNEL" });
  });
});

describe("PrismaCallScopeReader.getUserProfiles — nguồn avatar của participant/initiator/phòng thoại", () => {
  it("nhiều id (có trùng) → MỘT truy vấn; có ảnh → URL ký sẵn, không ảnh → null; id không tồn tại vắng mặt", async () => {
    usersInDb([
      { id: A, name: "Người A", avatarAssetId: AVATAR_A },
      { id: B, name: "Người B", avatarAssetId: null },
    ]);

    const profiles = await new PrismaCallScopeReader().getUserProfiles([A, B, A, MISSING]);

    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledWith({ where: { id: { in: [A, B, MISSING] } }, select: { id: true, name: true, avatarAssetId: true } });
    expect(profiles.get(A)).toEqual({ name: "Người A", avatarUrl: expect.stringMatching(signedThumb(AVATAR_A)) });
    expect(profiles.get(B)).toEqual({ name: "Người B", avatarUrl: null });
    expect(profiles.has(MISSING)).toBe(false);
  });
});
