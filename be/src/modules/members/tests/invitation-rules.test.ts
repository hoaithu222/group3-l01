/**
 * Unit — quy tắc THUẦN của lời mời email/khách (p3-04): chuẩn hoá + che email, khoá `pendingKey`, kiểm email khớp
 * (INV_008 `details.reason`), hạn dùng được, chính sách khách mặc định/ghi đè/bị chặn bởi trần nền tảng.
 */
import {
  DEFAULT_GUEST_CONFIG,
  checkEmailAccess,
  doneKeyFor,
  guestExpiryFrom,
  invitationExpiryFrom,
  isInvitationUsable,
  maskEmail,
  normalizeEmail,
  pendingKeyFor,
  resolveGuestPolicy,
} from "../services/invitation-rules";

describe("invitation-rules", () => {
  describe("normalizeEmail / maskEmail", () => {
    it("lowercase + trim, KHÔNG bỏ dấu chấm gmail", () => {
      expect(normalizeEmail("  Lan.Tran@Gmail.COM ")).toBe("lan.tran@gmail.com");
    });

    it("che phần trước @ chỉ giữ ký tự đầu; email lạ → ***", () => {
      expect(maskEmail("lan@gmail.com")).toBe("l***@gmail.com");
      expect(maskEmail("l***@gmail.com")).toBe("l***@gmail.com"); // idempotent
      expect(maskEmail("khong-co-a-cong")).toBe("***");
      expect(maskEmail("@x.com")).toBe("***");
    });
  });

  describe("pendingKey / doneKey", () => {
    it("PENDING → <workspaceId>:<email>; rời PENDING → done:<id> (không bao giờ null)", () => {
      expect(pendingKeyFor("ws1", "a@b.c")).toBe("ws1:a@b.c");
      expect(doneKeyFor("inv1")).toBe("done:inv1");
    });
  });

  describe("checkEmailAccess (be.md §5.3 bước 2 — RB-06)", () => {
    const invitation = { normalizedEmail: "khach@example.com" };

    it("email khớp (khác hoa/thường) + đã xác minh → null (được chấp nhận)", () => {
      expect(checkEmailAccess({ email: "Khach@Example.COM", emailVerified: true }, invitation)).toBeNull();
    });

    it("email khác → EMAIL_MISMATCH, kể cả khi chưa xác minh", () => {
      expect(checkEmailAccess({ email: "khac@example.com", emailVerified: true }, invitation)).toBe("EMAIL_MISMATCH");
      expect(checkEmailAccess({ email: "khac@example.com", emailVerified: false }, invitation)).toBe("EMAIL_MISMATCH");
    });

    it("đúng email nhưng CHƯA xác minh → EMAIL_NOT_VERIFIED", () => {
      expect(checkEmailAccess({ email: "khach@example.com", emailVerified: false }, invitation)).toBe("EMAIL_NOT_VERIFIED");
    });
  });

  describe("isInvitationUsable", () => {
    const now = new Date("2026-09-21T00:00:00Z");
    it("chỉ PENDING và chưa quá hạn", () => {
      const future = new Date(now.getTime() + 1000);
      expect(isInvitationUsable({ status: "PENDING", expiresAt: future }, now)).toBe(true);
      expect(isInvitationUsable({ status: "PENDING", expiresAt: now }, now)).toBe(false); // <= now là hết hạn
      for (const status of ["ACCEPTED", "REVOKED", "EXPIRED"] as const) {
        expect(isInvitationUsable({ status, expiresAt: future }, now)).toBe(false);
      }
    });
  });

  describe("hạn", () => {
    it("guestExpiryFrom = now + days; invitationExpiryFrom = now + 7 ngày (LIMITS.invitation.expiresDays)", () => {
      const now = new Date("2026-09-21T00:00:00Z");
      expect(guestExpiryFrom(now, 30).toISOString()).toBe("2026-10-21T00:00:00.000Z");
      expect(invitationExpiryFrom(now).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    });
  });

  describe("resolveGuestPolicy", () => {
    it("null/thiếu trường → mặc định nền tảng (khách TẮT, memberCanInvite false)", () => {
      expect(resolveGuestPolicy(null, DEFAULT_GUEST_CONFIG)).toEqual({
        enabled: false,
        maxGuests: 20,
        maxDays: 90,
        memberCanInvite: false,
      });
    });

    it("nhóm đã thiết lập: lấy giá trị của nhóm", () => {
      const raw = { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: true };
      expect(resolveGuestPolicy(raw, DEFAULT_GUEST_CONFIG)).toEqual(raw);
    });

    it("`enabledByDefault` của nền tảng chỉ áp cho nhóm CHƯA thiết lập `enabled`", () => {
      const on = { ...DEFAULT_GUEST_CONFIG, enabledByDefault: true };
      expect(resolveGuestPolicy(null, on).enabled).toBe(true);
      expect(resolveGuestPolicy({ enabled: false }, on).enabled).toBe(false);
    });

    it("trần nền tảng hạ xuống sau khi nhóm đã lưu → giá trị của nhóm bị chặn theo trần", () => {
      const lowered = { ...DEFAULT_GUEST_CONFIG, maxDays: 14, maxPerWorkspace: 3 };
      const policy = resolveGuestPolicy({ enabled: true, maxGuests: 20, maxDays: 90, memberCanInvite: false }, lowered);
      expect(policy).toMatchObject({ maxGuests: 3, maxDays: 14 });
    });

    it("JSON rác (sai kiểu) không làm hỏng — rơi về mặc định", () => {
      expect(resolveGuestPolicy({ enabled: "yes", maxGuests: "many", maxDays: NaN }, DEFAULT_GUEST_CONFIG)).toEqual({
        enabled: false,
        maxGuests: 20,
        maxDays: 90,
        memberCanInvite: false,
      });
      expect(resolveGuestPolicy("chuỗi", DEFAULT_GUEST_CONFIG).enabled).toBe(false);
    });
  });
});
