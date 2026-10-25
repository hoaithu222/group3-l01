/**
 * Unit — vòng đời hết hạn KHÁCH (be.md p3-04 §5.4): `GuestExpiryService` (job `guest.expire`, cron quét bù, thông báo trước hạn) và
 * `MembershipLifecycleService.expireGuest` — CHỈ nhánh SKIP/idempotent TRƯỚC `withTransaction()`: không phải khách ACTIVE, version job
 * cũ (RB-05: đã gia hạn), chưa tới hạn (chỉ sớm ≤ 5 giây được xử lý). Gỡ thật (status REMOVED + EXPIRED, revokeScope) → integration.
 */
import { GuestExpiryService } from "../services/guest-expiry.service";
import { MembershipLifecycleService } from "../services/membership-lifecycle.service";
import { InMemoryMembershipRepository } from "../repositories/membership.repository.inmemory";
import { GUEST, WS, makeMembership } from "./support/access-harness";

const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 3600_000);

function guestRow(overrides: Parameters<typeof makeMembership>[0] = {}) {
  return makeMembership({ id: "m-guest", userId: GUEST, role: "GUEST", expiresAt: PAST, expiryVersion: 2, ...overrides });
}

describe("MembershipLifecycleService.expireGuest — nhánh SKIPPED (idempotent)", () => {
  function lifecycle(row?: ReturnType<typeof guestRow>) {
    const repo = new InMemoryMembershipRepository();
    if (row) repo.seedMembership(row);
    return new MembershipLifecycleService(repo);
  }

  it("không có membership / không phải GUEST / không ACTIVE / thiếu expiresAt → SKIPPED", async () => {
    await expect(lifecycle().expireGuest(WS, GUEST)).resolves.toBe("SKIPPED");
    await expect(lifecycle(guestRow({ role: "MEMBER" })).expireGuest(WS, GUEST)).resolves.toBe("SKIPPED");
    await expect(lifecycle(guestRow({ status: "REMOVED" })).expireGuest(WS, GUEST)).resolves.toBe("SKIPPED");
    await expect(lifecycle(guestRow({ expiresAt: null })).expireGuest(WS, GUEST)).resolves.toBe("SKIPPED");
  });

  it("RB-05 — job của version cũ (đã gia hạn: expiryVersion khác) → SKIPPED, khách vẫn ACTIVE", async () => {
    await expect(lifecycle(guestRow({ expiryVersion: 3 })).expireGuest(WS, GUEST, { expectedVersion: 2 })).resolves.toBe("SKIPPED");
  });

  it("chưa tới hạn (còn > 5 giây) → SKIPPED", async () => {
    await expect(lifecycle(guestRow({ expiresAt: FUTURE })).expireGuest(WS, GUEST, { expectedVersion: 2 })).resolves.toBe("SKIPPED");
  });
});

describe("GuestExpiryService", () => {
  const noticeHours = 48;

  it("expire() uỷ quyền cho lifecycle với expectedVersion của job", async () => {
    const lifecycle = { expireGuest: jest.fn().mockResolvedValue("EXPIRED") };
    const service = new GuestExpiryService(new InMemoryMembershipRepository(), lifecycle, noticeHours);
    await expect(service.expire(WS, GUEST, 2)).resolves.toBe("EXPIRED");
    expect(lifecycle.expireGuest).toHaveBeenCalledWith(WS, GUEST, { expectedVersion: 2 });
  });

  it("sweep(): quét khách quá hạn, hết hạn từng người (không truyền expectedVersion), đếm đúng; lỗi một người không chặn phần còn lại", async () => {
    const repo = new InMemoryMembershipRepository();
    for (const [userId, expiresAt] of [["u1", PAST], ["u2", PAST], ["u3", PAST], ["u4", FUTURE]] as const) {
      repo.seedMembership(guestRow({ id: `m-${userId}`, userId, expiresAt }));
    }
    const lifecycle = {
      expireGuest: jest
        .fn()
        .mockResolvedValueOnce("EXPIRED")
        .mockRejectedValueOnce(new Error("Mongo tạm lỗi"))
        .mockResolvedValueOnce("SKIPPED"),
    };
    const service = new GuestExpiryService(repo, lifecycle, noticeHours);
    const now = new Date();
    const result = await service.sweep(now);

    expect(result).toEqual({ scanned: 3, expired: 1 }); // u4 chưa tới hạn → không quét
    expect(lifecycle.expireGuest).toHaveBeenCalledTimes(3);
    for (const call of lifecycle.expireGuest.mock.calls) {
      expect(call[2]).toEqual({ now }); // quét bù KHÔNG khoá theo version
    }
  });

  it("sweep(): không có khách quá hạn → không làm gì", async () => {
    const lifecycle = { expireGuest: jest.fn() };
    const service = new GuestExpiryService(new InMemoryMembershipRepository(), lifecycle, noticeHours);
    await expect(service.sweep()).resolves.toEqual({ scanned: 0, expired: 0 });
    expect(lifecycle.expireGuest).not.toHaveBeenCalled();
  });

  it("notify(): bỏ qua khi không còn là khách ACTIVE, đã gia hạn (version lệch) hoặc đã quá hạn", async () => {
    const repo = new InMemoryMembershipRepository();
    const service = new GuestExpiryService(repo, { expireGuest: jest.fn() }, noticeHours);
    const input = { workspaceId: WS, userId: GUEST, expiryVersion: 2 };

    await expect(service.notify(input)).resolves.toBe("SKIPPED"); // không có membership

    repo.seedMembership(guestRow({ role: "MEMBER", expiresAt: FUTURE }));
    await expect(service.notify(input)).resolves.toBe("SKIPPED"); // không phải khách

    repo.seedMembership(guestRow({ expiresAt: FUTURE, expiryVersion: 3 }));
    await expect(service.notify(input)).resolves.toBe("SKIPPED"); // version cũ (đã gia hạn)

    repo.seedMembership(guestRow({ expiresAt: PAST }));
    await expect(service.notify(input)).resolves.toBe("SKIPPED"); // đã quá hạn
  });
});
