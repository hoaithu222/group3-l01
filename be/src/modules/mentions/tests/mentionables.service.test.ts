/**
 * Unit — `MentionablesService` (be.md §5.5, MSG-36 phần service): danh sách gợi ý
 * mention chỉ gồm người ĐỌC ĐƯỢC phạm vi (kênh private: grant; public: membership
 * ACTIVE; hội thoại: member ACTIVE), KHÔNG trả email, lọc `q` theo token
 * không dấu, ưu tiên người mới gửi tin, `canMentionAll`/`allCount` cho nhóm chat.
 */
const mockChannelFindUnique = jest.fn();
const mockMembershipFindMany = jest.fn();
const mockMembershipCount = jest.fn();
const mockGrantFindMany = jest.fn();
const mockMessageFindMany = jest.fn();
const mockConversationFindUnique = jest.fn();
const mockConvMemberFindMany = jest.fn();
const mockUserFindMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    channel: { findUnique: (...a: unknown[]) => mockChannelFindUnique(...a) },
    workspaceMembership: {
      findMany: (...a: unknown[]) => mockMembershipFindMany(...a),
      count: (...a: unknown[]) => mockMembershipCount(...a),
    },
    channelGrant: { findMany: (...a: unknown[]) => mockGrantFindMany(...a) },
    message: { findMany: (...a: unknown[]) => mockMessageFindMany(...a) },
    conversation: { findUnique: (...a: unknown[]) => mockConversationFindUnique(...a) },
    conversationMember: { findMany: (...a: unknown[]) => mockConvMemberFindMany(...a) },
    user: { findMany: (...a: unknown[]) => mockUserFindMany(...a) },
  },
}));
jest.mock("../../../infrastructure/redis", () => ({ redis: {} }));
jest.mock("../../messages/public", () => ({ getMessageScope: jest.fn() }));

import { normalizeSearch } from "../../../core/utils/normalize";
import { permissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { MentionablesService } from "../mentionables.service";

const WS = "w".repeat(24);
const CH = "c".repeat(24);
const CONV = "v".repeat(24);
const ME = "0".repeat(24);
const A = "a".repeat(24); // Nguyễn Văn Minh
const B = "b".repeat(24); // Trần Thị Lan
const C = "d".repeat(24); // Lê Minh Tuấn
const D = "e".repeat(24); // Phạm Quốc Bảo (không có grant / không phải member)
const me: AuthUser = { id: ME, email: "me@e.com" };

const NAMES: Record<string, string> = {
  [ME]: "Tôi Đây",
  [A]: "Nguyễn Văn Minh",
  [B]: "Trần Thị Lan",
  [C]: "Lê Minh Tuấn",
  [D]: "Phạm Quốc Bảo",
};

/** Mock `user.findMany` như Prisma thật: lọc theo `id in` + `status`, CHỈ trả field được `select`. */
function usersInDb(): void {
  mockUserFindMany.mockImplementation(async (args: { where: { id: { in: string[] }; status?: string }; select: Record<string, boolean> }) =>
    Object.entries(NAMES)
      .filter(([id]) => args.where.id.in.includes(id))
      .map(([id, name]) => {
        const full: Record<string, unknown> = { id, name, normalizedName: normalizeSearch(name), email: `${id}@e.com` };
        return Object.fromEntries(Object.entries(full).filter(([k]) => args.select[k]));
      })
  );
}

describe("MentionablesService", () => {
  const service = new MentionablesService();

  beforeEach(() => {
    usersInDb();
    mockMessageFindMany.mockResolvedValue([]);
  });

  describe("CHANNEL", () => {
    it("kênh không tồn tại → 404", async () => {
      mockChannelFindUnique.mockResolvedValue(null);
      await expect(service.list(me, "CHANNEL", CH, "", 20)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("kênh PUBLIC: thành viên ACTIVE của workspace; canMentionAll=false (P0 chưa có @everyone)", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PUBLIC" });
      mockMembershipFindMany.mockResolvedValue([
        { userId: A, role: "MEMBER", expiresAt: null },
        { userId: B, role: "ADMIN", expiresAt: null },
      ]);
      mockGrantFindMany.mockResolvedValue([]);

      const res = await service.list(me, "CHANNEL", CH, "", 20);
      expect(mockMembershipFindMany).toHaveBeenCalledWith({
        where: { workspaceId: WS, status: "ACTIVE" },
        select: { userId: true, role: true, expiresAt: true },
      });
      expect(res.users.map((u) => u.userId).sort()).toEqual([A, B].sort());
      expect(res.canMentionAll).toBe(false);
      expect(res.allCount).toBeUndefined();
    });

    it("p3-04 — kênh PUBLIC: KHÁCH chỉ xuất hiện khi được chỉ định (grant DIRECT) và chưa hết hạn", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PUBLIC" });
      const past = new Date(Date.now() - 1000);
      const future = new Date(Date.now() + 3600_000);
      mockMembershipFindMany.mockResolvedValue([
        { userId: A, role: "MEMBER", expiresAt: null },
        { userId: B, role: "GUEST", expiresAt: future }, // được chỉ định
        { userId: C, role: "GUEST", expiresAt: future }, // khách KHÔNG được chỉ định vào kênh này
        { userId: D, role: "GUEST", expiresAt: past }, // được chỉ định nhưng đã hết hạn
      ]);
      mockGrantFindMany.mockResolvedValue([{ userId: B }, { userId: D }]);

      const res = await service.list(me, "CHANNEL", CH, "", 20);
      expect(mockGrantFindMany).toHaveBeenCalledWith({ where: { channelId: CH, source: "DIRECT" }, select: { userId: true } });
      expect(res.users.map((u) => u.userId).sort()).toEqual([A, B].sort());
    });

    it("MSG-36: kênh PRIVATE chỉ gồm người CÓ GRANT (người ngoài grant không xuất hiện), không tra membership workspace", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([{ userId: A }, { userId: C }]);

      const res = await service.list(me, "CHANNEL", CH, "", 20);
      expect(mockGrantFindMany).toHaveBeenCalledWith({ where: { channelId: CH }, select: { userId: true, source: true, roleRef: true } });
      expect(mockMembershipFindMany).not.toHaveBeenCalled();
      expect(res.users.map((u) => u.userId).sort()).toEqual([A, C].sort());
      expect(res.users.map((u) => u.userId)).not.toContain(D);
    });

    it("p3-04: kênh PRIVATE có role grant ADMIN → thêm thành viên ACTIVE có vai trò OWNER/ADMIN (DIRECT + ROLE bỏ trùng); không role grant thì không tra membership", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([
        { userId: A, source: "DIRECT", roleRef: null },
        { userId: null, source: "ROLE", roleRef: "ADMIN" },
      ]);
      mockMembershipFindMany.mockResolvedValue([{ userId: A }, { userId: B }]); // A trùng với grant DIRECT

      const res = await service.list(me, "CHANNEL", CH, "", 20);
      expect(mockMembershipFindMany).toHaveBeenCalledWith({
        where: { workspaceId: WS, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
        select: { userId: true },
      });
      expect(res.users.map((u) => u.userId).sort()).toEqual([A, B].sort());
      expect(res.roles).toBeUndefined(); // không có includeRoles
    });

    it("p3-04: includeRoles=true + có quyền mention.role → roles[] kèm nhãn và số người nhận (trừ chính mình)", async () => {
      jest.spyOn(permissionService, "can").mockResolvedValue(true);
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([{ userId: ME, source: "DIRECT", roleRef: null }, { userId: A, source: "DIRECT", roleRef: null }]);
      mockMembershipCount.mockImplementation(async (args: { where: { role: { in: string[] } } }) => (args.where.role.in.length === 2 ? 1 : 2));

      const res = await service.list(me, "CHANNEL", CH, "", 20, true);
      expect(permissionService.can).toHaveBeenCalledWith(me, "workspace.mention.role", { type: "WORKSPACE", id: WS });
      expect(res.canMentionRole).toBe(true);
      expect(res.roles).toEqual([
        { roleRef: "ADMIN", label: "Quản trị viên", recipientCount: 1 },
        { roleRef: "MEMBER", label: "Thành viên", recipientCount: 2 },
      ]);
      // người nhận đếm trong tập đọc được kênh, KHÔNG gồm chính mình
      expect(mockMembershipCount.mock.calls[0][0].where.userId).toEqual({ in: [A] });
    });

    it("p3-04: includeRoles=true nhưng KHÔNG có quyền mention.role → canMentionRole=false, không có roles[]", async () => {
      jest.spyOn(permissionService, "can").mockResolvedValue(false);
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([{ userId: A, source: "DIRECT", roleRef: null }]);

      const res = await service.list(me, "CHANNEL", CH, "", 20, true);
      expect(res.canMentionRole).toBe(false);
      expect(res.roles).toBeUndefined();
      expect(mockMembershipCount).not.toHaveBeenCalled();
    });

    it("MSG-36: KHÔNG trả email — không select email và mỗi phần tử chỉ có userId/name/avatarUrl", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([{ userId: A }]);

      const res = await service.list(me, "CHANNEL", CH, "", 20);
      const select = (mockUserFindMany.mock.calls[0][0] as { select: Record<string, boolean> }).select;
      expect(select.email).toBeUndefined();
      expect(Object.keys(res.users[0]).sort()).toEqual(["avatarUrl", "name", "userId"]);
      expect(JSON.stringify(res)).not.toContain("@e.com");
    });

    it("chỉ tài khoản ACTIVE (where status=ACTIVE truyền xuống truy vấn user)", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([{ userId: A }]);
      await service.list(me, "CHANNEL", CH, "", 20);
      expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [A] }, status: "ACTIVE" } }));
    });

    it("không có ai đọc được kênh → users rỗng, không truy vấn user", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([]);
      await expect(service.list(me, "CHANNEL", CH, "", 20)).resolves.toEqual({ users: [], canMentionAll: false });
      expect(mockUserFindMany).not.toHaveBeenCalled();
    });

    it("q lọc theo token KHÔNG DẤU, khớp tiền tố từng token ('minh' → 2 người; 'van min' → 1; 'xyz' → 0)", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([{ userId: A }, { userId: B }, { userId: C }]);

      const minh = await service.list(me, "CHANNEL", CH, "Minh", 20);
      expect(minh.users.map((u) => u.userId).sort()).toEqual([A, C].sort());
      const vanMin = await service.list(me, "CHANNEL", CH, "văn min", 20);
      expect(vanMin.users.map((u) => u.userId)).toEqual([A]);
      const none = await service.list(me, "CHANNEL", CH, "xyz", 20);
      expect(none.users).toEqual([]);
    });

    it("sắp: người gửi tin GẦN ĐÂY trong kênh trước, còn lại theo tên (vi); cắt theo limit", async () => {
      mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
      mockGrantFindMany.mockResolvedValue([{ userId: A }, { userId: B }, { userId: C }]);
      // C gửi gần nhất, rồi B; A chưa gửi
      mockMessageFindMany.mockResolvedValue([{ authorId: C }, { authorId: B }, { authorId: C }]);

      const res = await service.list(me, "CHANNEL", CH, "", 20);
      expect(res.users.map((u) => u.userId)).toEqual([C, B, A]);
      expect(mockMessageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ scopeType: "CHANNEL", scopeId: CH, threadKey: "root", authorId: { in: [A, B, C] } }) })
      );

      const limited = await service.list(me, "CHANNEL", CH, "", 2);
      expect(limited.users.map((u) => u.userId)).toEqual([C, B]);
    });
  });

  describe("CONVERSATION", () => {
    const members = (rows: Array<[string, "OWNER" | "ADMIN" | "MEMBER"]>) =>
      mockConvMemberFindMany.mockResolvedValue(rows.map(([userId, role]) => ({ userId, role })));

    it("hội thoại không tồn tại → 404", async () => {
      mockConversationFindUnique.mockResolvedValue(null);
      await expect(service.list(me, "CONVERSATION", CONV, "", 20)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("DIRECT: chỉ member ACTIVE; canMentionAll=false, không có allCount", async () => {
      mockConversationFindUnique.mockResolvedValue({ kind: "DIRECT", settings: {}, memberCount: 2 });
      members([[ME, "MEMBER"], [A, "MEMBER"]]);
      const res = await service.list(me, "CONVERSATION", CONV, "", 20);
      expect(mockConvMemberFindMany).toHaveBeenCalledWith({ where: { conversationId: CONV, status: "ACTIVE" }, select: { userId: true, role: true } });
      expect(res.users.map((u) => u.userId).sort()).toEqual([ME, A].sort());
      expect(res).toMatchObject({ canMentionAll: false });
      expect(res.allCount).toBeUndefined();
    });

    it("GROUP + mentionAllRole=ADMIN: ADMIN → canMentionAll=true, allCount = memberCount − 1", async () => {
      mockConversationFindUnique.mockResolvedValue({ kind: "GROUP", settings: { mentionAllRole: "ADMIN" }, memberCount: 5 });
      members([[ME, "ADMIN"], [A, "MEMBER"], [B, "MEMBER"]]);
      const res = await service.list(me, "CONVERSATION", CONV, "", 20);
      expect(res.canMentionAll).toBe(true);
      expect(res.allCount).toBe(4);
    });

    it("GROUP + mentionAllRole=ADMIN: MEMBER → canMentionAll=false, KHÔNG lộ allCount", async () => {
      mockConversationFindUnique.mockResolvedValue({ kind: "GROUP", settings: { mentionAllRole: "ADMIN" }, memberCount: 5 });
      members([[ME, "MEMBER"], [A, "MEMBER"]]);
      const res = await service.list(me, "CONVERSATION", CONV, "", 20);
      expect(res.canMentionAll).toBe(false);
      expect(res.allCount).toBeUndefined();
    });

    it("GROUP + mentionAllRole=MEMBER: MEMBER được; thiếu settings → mặc định ADMIN", async () => {
      mockConversationFindUnique.mockResolvedValue({ kind: "GROUP", settings: { mentionAllRole: "MEMBER" }, memberCount: 3 });
      members([[ME, "MEMBER"], [A, "MEMBER"]]);
      await expect(service.list(me, "CONVERSATION", CONV, "", 20)).resolves.toMatchObject({ canMentionAll: true, allCount: 2 });

      mockConversationFindUnique.mockResolvedValue({ kind: "GROUP", settings: {}, memberCount: 3 });
      await expect(service.list(me, "CONVERSATION", CONV, "", 20)).resolves.toMatchObject({ canMentionAll: false });
    });

    it("người gọi không phải member (rank 0) → canMentionAll=false; allCount không âm khi memberCount=0", async () => {
      mockConversationFindUnique.mockResolvedValue({ kind: "GROUP", settings: { mentionAllRole: "MEMBER" }, memberCount: 0 });
      members([[A, "OWNER"]]);
      const res = await service.list(me, "CONVERSATION", CONV, "", 20);
      expect(res.canMentionAll).toBe(false);

      mockConversationFindUnique.mockResolvedValue({ kind: "GROUP", settings: { mentionAllRole: "MEMBER" }, memberCount: 0 });
      members([[ME, "OWNER"]]);
      await expect(service.list(me, "CONVERSATION", CONV, "", 20)).resolves.toMatchObject({ canMentionAll: true, allCount: 0 });
    });
  });
});
