/**
 * Unit — `JoinRequestService` (be.md p3-04 §5.5): các nhánh TRƯỚC `withTransaction()` — RB-08 (đang PENDING: trả trạng thái chờ,
 * KHÔNG tiêu lượt link), WS_019 (vừa bị từ chối < 24 giờ, kèm retryAfterSeconds), duyệt/từ chối yêu cầu không còn PENDING → 409,
 * nhóm lưu trữ, danh sách yêu cầu (dòng không lộ email). Tạo PENDING thật, duyệt/từ chối/huỷ (CAS) → integration.
 */
import { JoinRequestService } from "../services/join-request.service";
import { InMemoryMembershipRepository } from "../repositories/membership.repository.inmemory";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { InviteLink } from "../entities/invite.interface";
import { ADMIN, OUTSIDER, OWNER, WS, buildHarness, makeMembership, makeUser, makeWorkspace } from "./support/access-harness";

const link: InviteLink = {
  id: "link1",
  workspaceId: WS,
  tokenHash: "h",
  tokenPrefix: "abc123",
  role: "MEMBER",
  maxUses: 10,
  remainingUses: 10,
  usesCount: 0,
  expiresAt: new Date(Date.now() + 3600_000),
  revokedAt: null,
  revokedBy: null,
  createdBy: OWNER,
  createdAt: new Date(),
  lastUsedAt: null,
};

function setup() {
  const h = buildHarness();
  const bootstrap: ChannelBootstrapPort = { createDefault: jest.fn(), joinDefault: jest.fn() };
  const service = new JoinRequestService(h.memberships, h.invitations, bootstrap);
  const workspace = makeWorkspace({ joinPolicy: "APPROVAL" });
  h.invitations.workspaces.set(WS, workspace);
  return { h, service, workspace };
}

describe("JoinRequestService.requestFromLink", () => {
  it("RB-08 — đang PENDING: trả trạng thái chờ, created=false, KHÔNG gọi consumeLink (không tiêu lượt)", async () => {
    const { h, service, workspace } = setup();
    const existing = makeMembership({ id: "m-p", userId: OUTSIDER, status: "PENDING", requestedAt: new Date() });
    h.memberships.seedMembership(existing);
    const consume = jest.fn();
    await expect(service.requestFromLink(OUTSIDER, link, workspace, existing, consume)).resolves.toEqual({ status: "PENDING", created: false });
    expect(consume).not.toHaveBeenCalled();
  });

  it("WS_019 — vừa bị từ chối (< 24 giờ) → 429 kèm retryAfterSeconds; không tiêu lượt link", async () => {
    const { h, service, workspace } = setup();
    const rejected = makeMembership({
      id: "m-r",
      userId: OUTSIDER,
      status: "REMOVED",
      leftReason: "REJECTED",
      decidedAt: new Date(Date.now() - 2 * 3600_000),
    });
    h.memberships.seedMembership(rejected);
    const consume = jest.fn();
    const error = await service.requestFromLink(OUTSIDER, link, workspace, rejected, consume).catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 429, errorCode: ErrorCode.WS_019 });
    const retry = (error as { details: { retryAfterSeconds: number } }).details.retryAfterSeconds;
    expect(retry).toBeGreaterThan(21 * 3600);
    expect(retry).toBeLessThanOrEqual(22 * 3600);
    expect(consume).not.toHaveBeenCalled();
  });
});

describe("JoinRequestService — duyệt / từ chối / danh sách", () => {
  it("duyệt/từ chối yêu cầu không còn PENDING (người khác đã xử lý / không có) → 409", async () => {
    const { h, service } = setup();
    h.memberships.seedMembership(makeMembership({ id: "m-a", userId: OUTSIDER, status: "ACTIVE" }));
    await expect(service.approve(ADMIN, "ADMIN", WS, OUTSIDER)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.reject(ADMIN, "ADMIN", WS, OUTSIDER, undefined)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.approve(ADMIN, "ADMIN", WS, "ff".repeat(12))).rejects.toMatchObject({ statusCode: 409 });
  });

  it("nhóm đã lưu trữ → 409 WS_002; nhóm không tồn tại → 404", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ status: "ARCHIVED", joinPolicy: "APPROVAL" }));
    await expect(service.approve(ADMIN, "ADMIN", WS, OUTSIDER)).rejects.toMatchObject({ errorCode: ErrorCode.WS_002 });
    await expect(service.approve(ADMIN, "ADMIN", "ee".repeat(12), OUTSIDER)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("list(): trả người xin, lời nhắn, thời điểm, via=INVITE_LINK; KHÔNG có email", async () => {
    const { h, service } = setup();
    const requestedAt = new Date("2026-09-20T08:00:00Z");
    (h.memberships as InMemoryMembershipRepository).seedUser({
      id: OUTSIDER,
      name: "Người xin vào",
      normalizedName: "nguoi xin vao",
      email: "bi-mat@example.com",
      avatarAssetId: null,
    });
    h.memberships.seedMembership(makeMembership({ id: "m-p", userId: OUTSIDER, status: "PENDING", requestedAt, requestMessage: "Cho em vào nhé" }));
    h.invitations.users.set(OUTSIDER, makeUser(OUTSIDER));

    const { data, hasMore, nextCursor } = await service.list(WS, { limit: 20 });
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
    expect(data).toEqual([
      { user: { id: OUTSIDER, name: "Người xin vào", avatarUrl: null }, requestMessage: "Cho em vào nhé", requestedAt, via: "INVITE_LINK" },
    ]);
    expect(JSON.stringify(data)).not.toContain("bi-mat@example.com");
  });

  it("list(): người xin có ảnh → user.avatarUrl là URL ký sẵn của đúng asset (lấy từ cùng bản ghi user)", async () => {
    const { h, service } = setup();
    const assetId = "65f0000000000000000000cd";
    h.memberships.seedUser({ id: OUTSIDER, name: "Có ảnh", normalizedName: "co anh", email: "x@example.com", avatarAssetId: assetId });
    h.memberships.seedMembership(makeMembership({ id: "m-p", userId: OUTSIDER, status: "PENDING", requestedAt: new Date() }));

    const { data } = await service.list(WS, { limit: 20 });
    expect(data[0].user.avatarUrl).toContain(`/api/v1/assets/${assetId}/image?v=THUMB`);
  });
});
