/**
 * Unit — `GuestService.update` (be.md p3-04 §4 `PATCH …/members/:userId/guest`): CHỈ các nhánh throw TRƯỚC `withTransaction()` —
 * không phải khách/không còn ACTIVE, nhóm lưu trữ, `expectedVersion` lệch (409 RES_003, RB-05 phía API), hạn mới ở quá khứ hoặc
 * vượt trần, CH_013 khi THÊM kênh riêng tư mình không quản lý. Ghi thật (CAS version, đổi lịch hết hạn, grant kênh) → integration.
 */
import { GuestService } from "../services/guest.service";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { ChannelGrantPort } from "../../../shared/ports/channel-grant.port";
import { CH_PRIVATE, CH_PUBLIC, GUEST, MEMBER, OWNER, WS, buildHarness, makeMembership, makeWorkspace } from "./support/access-harness";

const actor: AuthUser = { id: OWNER, email: "o@e.com" };
const noGrant = {} as unknown as ChannelGrantPort;

function setup(canManage: (actor: AuthUser, channelId: string) => Promise<boolean> = async () => true) {
  const h = buildHarness();
  const expiresAt = new Date(Date.now() + 10 * 24 * 3600_000);
  h.memberships.seedMembership(makeMembership({ id: "m-guest", userId: GUEST, role: "GUEST", expiresAt, expiryVersion: 3 }));
  h.memberships.guestChannels.set(`${WS}:${GUEST}`, [CH_PUBLIC]);
  const service = new GuestService(h.memberships, h.invitations, noGrant, h.config, canManage);
  return { h, service };
}

const days = (n: number) => new Date(Date.now() + n * 24 * 3600_000);

describe("GuestService.update — nhánh chặn trước transaction", () => {
  it("người không còn là thành viên ACTIVE → 409 WS_013; thành viên không phải khách → 400", async () => {
    const { h, service } = setup();
    await expect(service.update(actor, WS, "ff".repeat(12), { expectedVersion: 1, expiresAt: days(5) })).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ErrorCode.WS_013,
    });
    await expect(service.update(actor, WS, MEMBER, { expectedVersion: 1, expiresAt: days(5) })).rejects.toMatchObject({ statusCode: 400 });

    h.memberships.seedMembership(makeMembership({ id: "m-gone", userId: GUEST, role: "GUEST", status: "REMOVED", expiryVersion: 3 }));
    await expect(service.update(actor, WS, GUEST, { expectedVersion: 3, expiresAt: days(5) })).rejects.toMatchObject({
      errorCode: ErrorCode.WS_013,
    });
  });

  it("nhóm đã lưu trữ → 409 WS_002", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ status: "ARCHIVED" }));
    await expect(service.update(actor, WS, GUEST, { expectedVersion: 3, expiresAt: days(5) })).rejects.toMatchObject({
      errorCode: ErrorCode.WS_002,
    });
  });

  it("expectedVersion lệch (đã có người sửa) → 409 RES_003 kèm currentVersion", async () => {
    const { service } = setup();
    const error = await service.update(actor, WS, GUEST, { expectedVersion: 2, expiresAt: days(5) }).catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 409, errorCode: ErrorCode.RES_003, details: { currentVersion: 3 } });
  });

  it("hạn mới ở quá khứ (dùng \"loại khỏi nhóm\" để thu hồi ngay) hoặc vượt maxDays của nhóm (30) → 400", async () => {
    const { service } = setup();
    await expect(service.update(actor, WS, GUEST, { expectedVersion: 3, expiresAt: days(-1) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.update(actor, WS, GUEST, { expectedVersion: 3, expiresAt: days(31) })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("THÊM kênh riêng tư mình không quản lý → 403 CH_013; kênh lạ → 400", async () => {
    const { service } = setup(async () => false);
    await expect(
      service.update(actor, WS, GUEST, { expectedVersion: 3, channelIds: [CH_PUBLIC, CH_PRIVATE] })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.CH_013 });
    await expect(service.update(actor, WS, GUEST, { expectedVersion: 3, channelIds: ["ee".repeat(12)] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
