/**
 * Unit — `AdminAccessService` (be.md p3-04 admin §3): `access-summary` (chính sách hiệu lực + số đếm, CHỈ số lượng kênh riêng tư) và bảng
 * lời mời của admin (email CHE ở server, không token/lời nhắn, phân trang page/limit, nhóm lạ → 404).
 */
import { AdminAccessService } from "../services/admin-access.service";
import { StaticGuestConfig } from "../services/guest-config";
import type { IAccessSummaryRepository, AccessCounts } from "../repositories/access-summary.repository.interface";
import { WS, buildHarness, makeInvitation, makeWorkspace } from "./support/access-harness";

function setup(counts: Partial<AccessCounts> = {}) {
  const h = buildHarness();
  const spy = jest.fn().mockResolvedValue({
    activeMembers: 12,
    bannedMembers: 1,
    activeInviteLinks: 2,
    activeGuests: 3,
    guestsExpiringSoon: 1,
    pendingRequests: 2,
    pendingInvitations: 4,
    privateChannels: 5,
    privateChannelsWithRoleGrant: 2,
    ...counts,
  } satisfies AccessCounts);
  const summaries: IAccessSummaryRepository = { counts: spy };
  return { h, spy, service: new AdminAccessService(h.invitations, summaries, new StaticGuestConfig()) };
}

describe("AdminAccessService.summary", () => {
  it("gộp chính sách hiệu lực + số đếm; cửa sổ 'sắp hết hạn' = expiringNoticeHours (48 giờ)", async () => {
    const { h, service, spy } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ joinPolicy: "APPROVAL" }));
    const now = new Date("2026-09-21T00:00:00Z");
    const summary = await service.summary(WS, now);
    expect(summary).toEqual({
      joinPolicy: "APPROVAL",
      guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: false },
      members: { active: 12, banned: 1 },
      inviteLinks: { active: 2 },
      guests: { active: 3, expiringIn48h: 1 },
      pendingRequests: 2,
      pendingInvitations: 4,
      privateChannels: { total: 5, withRoleGrant: 2 },
    });
    expect(spy).toHaveBeenCalledWith(WS, now, new Date("2026-09-23T00:00:00Z"));
  });

  it("nhóm chưa thiết lập guestPolicy → mặc định nền tảng (tắt); nhóm không tồn tại → 404", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ guestPolicy: null }));
    expect((await service.summary(WS)).guestPolicy).toEqual({ enabled: false, maxGuests: 20, maxDays: 90, memberCanInvite: false });
    await expect(service.summary("ff".repeat(12))).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("AdminAccessService.listInvitations", () => {
  it("email CHE, không lộ token/hash/pendingKey/lời nhắn/người nhận thật; phân trang + lọc trạng thái", async () => {
    const { h, service } = setup();
    h.invitations.seed(makeInvitation({ id: "a", email: "Lan.Nguyen@example.com", message: "Bí mật", createdAt: new Date("2026-09-20T02:00:00Z") }));
    h.invitations.seed(makeInvitation({ id: "b", email: "khach@x.io", role: "GUEST", status: "ACCEPTED", createdAt: new Date("2026-09-20T01:00:00Z") }));
    h.invitations.seed(makeInvitation({ id: "c", email: "c@x.io", createdAt: new Date("2026-09-20T00:00:00Z") }));

    const page1 = await service.listInvitations(WS, { page: 1, limit: 2 });
    expect(page1.total).toBe(3);
    expect(page1.data.map((r) => r.id)).toEqual(["a", "b"]); // mới nhất trước
    expect(page1.data[0].email).toBe("L***@example.com");
    expect(JSON.stringify(page1.data)).not.toMatch(/Nguyen|Bí mật|tokenHash|pendingKey|normalizedEmail|message/);

    const page2 = await service.listInvitations(WS, { page: 2, limit: 2 });
    expect(page2.data.map((r) => r.id)).toEqual(["c"]);
    const accepted = await service.listInvitations(WS, { status: "ACCEPTED", page: 1, limit: 10 });
    expect(accepted.data.map((r) => r.id)).toEqual(["b"]);
    expect(accepted.data[0]).toMatchObject({ role: "GUEST", status: "ACCEPTED", invitedBy: expect.any(String) });
  });

  it("nhóm không tồn tại → 404", async () => {
    const { service } = setup();
    await expect(service.listInvitations("ff".repeat(12), { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 404 });
  });
});
