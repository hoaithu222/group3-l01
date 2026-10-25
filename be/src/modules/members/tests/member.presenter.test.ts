import { toMemberRow, buildMemberActions, toMemberCard, toAdminMemberRow } from "../services/member.presenter";
import type { MembershipWithUser } from "../repositories/membership.repository.interface";
import type { WorkspaceMembership, WorkspaceRoleValue } from "../entities/member.interface";

function makeMembership(overrides: Partial<WorkspaceMembership> = {}): WorkspaceMembership {
  return {
    id: "m1",
    workspaceId: "ws1",
    userId: "u1",
    role: "MEMBER",
    status: "ACTIVE",
    displayName: null,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
    leftAt: null,
    expiresAt: null,
    invitedBy: null,
    inviteLinkId: null,
    banReason: null,
    removedBy: null,
    ...overrides,
  };
}

function makeRow(overrides: Partial<WorkspaceMembership> = {}, userOverrides: Partial<MembershipWithUser["user"]> = {}): MembershipWithUser {
  return {
    membership: makeMembership(overrides),
    user: {
      id: overrides.userId ?? "u1",
      name: "Nguyễn Văn A",
      normalizedName: "nguyen van a",
      email: "a@example.com",
      avatarAssetId: null,
      ...userOverrides,
    },
  };
}

describe("member.presenter", () => {
  describe("toMemberRow", () => {
    it("map đúng field, chưa đặt ảnh → avatarUrl null, isMe theo viewerId", () => {
      const row = makeRow({ userId: "u1", role: "ADMIN", displayName: "Sếp A" });
      const result = toMemberRow(row, "u1", "ONLINE");
      expect(result).toEqual({
        userId: "u1",
        name: "Nguyễn Văn A",
        displayName: "Sếp A",
        avatarUrl: null,
        role: "ADMIN",
        status: "ACTIVE",
        joinedAt: row.membership.joinedAt,
        presence: "ONLINE",
        isMe: true,
      });
    });

    it("isMe = false khi userId khác viewerId", () => {
      const row = makeRow({ userId: "u2" });
      const result = toMemberRow(row, "u1", "OFFLINE");
      expect(result.isMe).toBe(false);
    });

    it("thành viên có ảnh → avatarUrl là URL ảnh hiển thị TUYỆT ĐỐI ký sẵn (bản THUMB) của đúng asset", () => {
      const assetId = "65f0000000000000000000ab";
      const signedThumb = new RegExp(`^https?://[^/]+/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);
      const row = makeRow({ userId: "u2" }, { avatarAssetId: assetId });
      expect(toMemberRow(row, "u1", "ONLINE").avatarUrl).toMatch(signedThumb);
      // Thẻ thành viên (`GET …/members/:userId`) dựng từ cùng presenter.
      expect(toMemberCard(row, "u1", "OWNER", "ONLINE").avatarUrl).toMatch(signedThumb);
    });
  });

  describe("buildMemberActions", () => {
    it("canMessage/canCall lấy từ `contact` do server tính; không truyền = false", () => {
      const target = makeRow({ userId: "u2", role: "MEMBER" });
      const none = buildMemberActions("OWNER", target, "u1");
      expect([none.canMessage, none.canCall]).toEqual([false, false]);
      const both = buildMemberActions("OWNER", target, "u1", { canMessage: true, canCall: true });
      expect([both.canMessage, both.canCall]).toEqual([true, true]);
      const messageOnly = buildMemberActions("MEMBER", target, "u1", { canMessage: true, canCall: false });
      expect([messageOnly.canMessage, messageOnly.canCall]).toEqual([true, false]);
    });

    it("chính mình (isSelf) → mọi hành động quản trị đều false dù viewer là OWNER", () => {
      const target = makeRow({ userId: "u1", role: "ADMIN" });
      const actions = buildMemberActions("OWNER", target, "u1");
      expect(actions).toMatchObject({ canChangeRole: false, canRemove: false, canBan: false });
    });

    it("OWNER với target ADMIN (không phải OWNER) → canChangeRole/canRemove/canBan đều true", () => {
      const target = makeRow({ userId: "u2", role: "ADMIN" });
      const actions = buildMemberActions("OWNER", target, "u1");
      expect(actions).toMatchObject({ canChangeRole: true, canRemove: true, canBan: true });
    });

    it("OWNER với target OWNER khác (không outrank) → canChangeRole false (target là OWNER), canRemove/canBan false", () => {
      const target = makeRow({ userId: "u2", role: "OWNER" });
      const actions = buildMemberActions("OWNER", target, "u1");
      expect(actions).toMatchObject({ canChangeRole: false, canRemove: false, canBan: false });
    });

    it("ADMIN với target MEMBER → canChangeRole false (chỉ OWNER đổi role), canRemove/canBan true (outrank)", () => {
      const target = makeRow({ userId: "u2", role: "MEMBER" });
      const actions = buildMemberActions("ADMIN", target, "u1");
      expect(actions).toMatchObject({ canChangeRole: false, canRemove: true, canBan: true });
    });

    it("ADMIN với target ADMIN khác (ngang bậc) → canRemove/canBan false", () => {
      const target = makeRow({ userId: "u2", role: "ADMIN" });
      const actions = buildMemberActions("ADMIN", target, "u1");
      expect(actions).toMatchObject({ canRemove: false, canBan: false });
    });

    it("MEMBER với target MEMBER khác → mọi hành động quản trị false", () => {
      const target = makeRow({ userId: "u2", role: "MEMBER" });
      const actions = buildMemberActions("MEMBER", target, "u1");
      expect(actions).toMatchObject({ canChangeRole: false, canRemove: false, canBan: false });
    });

    const roles: WorkspaceRoleValue[] = ["OWNER", "ADMIN", "MEMBER", "GUEST"];
    for (const viewerRole of roles) {
      for (const targetRole of roles) {
        it(`canRemove/canBan (${viewerRole} → ${targetRole}, không self) khớp outranks()`, () => {
          const target = makeRow({ userId: "u2", role: targetRole });
          const actions = buildMemberActions(viewerRole, target, "u1");
          const shouldOutrank =
            (viewerRole === "OWNER" && targetRole !== "OWNER") ||
            (viewerRole === "ADMIN" && (targetRole === "MEMBER" || targetRole === "GUEST")) ||
            (viewerRole === "MEMBER" && targetRole === "GUEST");
          expect(actions.canRemove).toBe(shouldOutrank);
          expect(actions.canBan).toBe(shouldOutrank);
        });
      }
    }
  });

  describe("toMemberCard", () => {
    it("kết hợp toMemberRow + actions", () => {
      const row = makeRow({ userId: "u2", role: "MEMBER" });
      const card = toMemberCard(row, "u1", "OWNER", "IDLE");
      expect(card.userId).toBe("u2");
      expect(card.presence).toBe("IDLE");
      expect(card.actions).toMatchObject({ canRemove: true, canBan: true });
    });
  });

  describe("toAdminMemberRow", () => {
    it("includeEmail=true → có field email", () => {
      const row = makeRow({ userId: "u2" }, { email: "u2@example.com" });
      const result = toAdminMemberRow(row, true);
      expect(result.user).toEqual({ id: "u2", name: "Nguyễn Văn A", email: "u2@example.com" });
    });

    it("includeEmail=false → KHÔNG có field email (be.md MB-07)", () => {
      const row = makeRow({ userId: "u2" }, { email: "u2@example.com" });
      const result = toAdminMemberRow(row, false);
      expect(result.user).toEqual({ id: "u2", name: "Nguyễn Văn A" });
      expect(result.user).not.toHaveProperty("email");
    });

    it("map đủ role/status/joinedAt/invitedBy/expiresAt/banReason", () => {
      const row = makeRow({
        userId: "u3",
        role: "MEMBER",
        status: "BANNED",
        invitedBy: "u1",
        expiresAt: null,
        banReason: "Spam",
      });
      const result = toAdminMemberRow(row, false);
      expect(result).toMatchObject({
        role: "MEMBER",
        status: "BANNED",
        invitedBy: "u1",
        expiresAt: null,
        banReason: "Spam",
      });
    });
  });
});
