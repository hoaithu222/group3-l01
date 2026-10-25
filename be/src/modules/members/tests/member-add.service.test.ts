/**
 * Unit — `MemberAddService` (tra người theo email/SĐT + thêm thẳng vào nhóm): các nhánh KHÔNG chạm `withTransaction()` —
 * phân loại ô tìm (từ chối tên/chuỗi số dở dang), trạng thái từng kết quả, người bị chặn coi như không tồn tại, nhóm lưu trữ,
 * và các nhánh từ chối/idempotent của `add()`. Thêm THẬT (membership + kênh mặc định + thông báo + outbox) → integration
 * (`integration/member-add.routes.test.ts`).
 */
import { MemberAddService } from "../services/member-add.service";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { ContactMatch, UserContactLookupPort } from "../../../shared/ports/user-contact-lookup.port";
import { ADMIN, GUEST, MEMBER, OUTSIDER, OWNER, WS, buildHarness, makeMembership, makeWorkspace } from "./support/access-harness";

const actor: AuthUser = { id: ADMIN, email: "admin@e.com" };

function match(userId: string, overrides: Partial<ContactMatch> = {}): ContactMatch {
  return { userId, name: `Người ${userId.slice(0, 2)}`, avatarUrl: null, matchedBy: "EMAIL", hint: null, ...overrides };
}

function setup(opts: { matches?: ContactMatch[]; activeUsers?: string[]; blocked?: string[]; perUser?: number } = {}) {
  const h = buildHarness();
  const findByContact = jest.fn().mockResolvedValue(opts.matches ?? []);
  const contacts: UserContactLookupPort = {
    findByContact,
    findActiveUser: jest.fn(async (id: string) => ((opts.activeUsers ?? [OUTSIDER]).includes(id) ? { id, name: "Người dùng" } : null)),
  };
  const bootstrap: ChannelBootstrapPort = { createDefault: jest.fn(), joinDefault: jest.fn() };
  const blocks = { isBlockedEitherWay: jest.fn(async (_a: string, b: string) => (opts.blocked ?? []).includes(b)) };
  if (opts.perUser !== undefined) jest.spyOn(h.memberships, "countActiveByUser").mockResolvedValue(opts.perUser);
  const service = new MemberAddService(h.memberships, h.invitations, contacts, bootstrap, blocks);
  return { h, service, findByContact, blocks };
}

describe("MemberAddService.lookup()", () => {
  it("tên hoặc chuỗi số dở dang → 400, KHÔNG gọi tra cứu (chống dò danh bạ)", async () => {
    const { service, findByContact } = setup();
    for (const q of ["Nguyễn Văn A", "0912", "lan@"]) {
      await expect(service.lookup(actor, WS, q)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(findByContact).not.toHaveBeenCalled();
  });

  it("email → tra kiểu EMAIL đã chuẩn hoá; SĐT → tra kiểu PHONE dạng E.164", async () => {
    const { service, findByContact } = setup();
    await service.lookup(actor, WS, "  Lan@Gmail.COM ");
    await service.lookup(actor, WS, "0912 345 678");
    expect(findByContact).toHaveBeenNthCalledWith(1, { kind: "EMAIL", email: "lan@gmail.com" }, ADMIN);
    expect(findByContact).toHaveBeenNthCalledWith(2, { kind: "PHONE", phone: "+84912345678" }, ADMIN);
  });

  it("gán trạng thái: chưa vào → AVAILABLE, đang ACTIVE → ALREADY_MEMBER, đang bị chặn khỏi nhóm → BANNED", async () => {
    const { h, service } = setup({ matches: [match(OUTSIDER), match(MEMBER), match(GUEST)] });
    h.memberships.seedMembership(makeMembership({ id: "m-guest", userId: GUEST, status: "BANNED" }));
    const items = await service.lookup(actor, WS, "lan@gmail.com");
    expect(items.map((i) => [i.userId, i.state])).toEqual([
      [OUTSIDER, "AVAILABLE"],
      [MEMBER, "ALREADY_MEMBER"],
      [GUEST, "BANNED"],
    ]);
  });

  it("người đã chặn / bị chặn với người tra coi như KHÔNG tồn tại (trung tính)", async () => {
    const { service } = setup({ matches: [match(OUTSIDER)], blocked: [OUTSIDER] });
    await expect(service.lookup(actor, WS, "lan@gmail.com")).resolves.toEqual([]);
  });

  it("không có ai khớp → mảng rỗng (không phân biệt 'chưa đăng ký' với 'không cho tìm')", async () => {
    const { service } = setup({ matches: [] });
    await expect(service.lookup(actor, WS, "0912345678")).resolves.toEqual([]);
  });

  it("giữ nguyên gợi ý che của cổng tra cứu, không thêm email/SĐT đầy đủ", async () => {
    const { service } = setup({ matches: [match(OUTSIDER, { matchedBy: "PHONE", hint: "l***@gmail.com" })] });
    const [item] = await service.lookup(actor, WS, "0912345678");
    expect(item).toMatchObject({ matchedBy: "PHONE", hint: "l***@gmail.com", state: "AVAILABLE" });
    // Chỉ những trường này — không có email/SĐT đầy đủ nào lọt vào kết quả.
    expect(Object.keys(item).sort()).toEqual(["avatarUrl", "hint", "matchedBy", "name", "state", "userId"]);
  });

  it("nhóm đã lưu trữ → 409 WS_002; nhóm không tồn tại → 404", async () => {
    const archived = setup();
    archived.h.invitations.workspaces.set(WS, makeWorkspace({ status: "ARCHIVED" }));
    await expect(archived.service.lookup(actor, WS, "lan@gmail.com")).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.WS_002 });
    await expect(setup().service.lookup(actor, "ff".repeat(12), "lan@gmail.com")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("MemberAddService.add() — các nhánh không ghi", () => {
  it("người dùng không tồn tại / không ACTIVE → 404 trung tính", async () => {
    const { service } = setup({ activeUsers: [] });
    await expect(service.add(actor, WS, OUTSIDER)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("đã là thành viên ACTIVE → ALREADY_MEMBER, không ghi gì (idempotent)", async () => {
    const { service } = setup({ activeUsers: [MEMBER] });
    await expect(service.add(actor, WS, MEMBER)).resolves.toEqual({ userId: MEMBER, state: "ALREADY_MEMBER" });
  });

  it("đang bị chặn khỏi nhóm → 403 INV_004 (phải bỏ chặn trước)", async () => {
    const { h, service } = setup({ activeUsers: [GUEST] });
    h.memberships.seedMembership(makeMembership({ id: "m-guest", userId: GUEST, status: "BANNED" }));
    await expect(service.add(actor, WS, GUEST)).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.INV_004 });
  });

  it("chặn nhau với người thêm → 403 BLOCK_003", async () => {
    const { service } = setup({ blocked: [OUTSIDER] });
    await expect(service.add(actor, WS, OUTSIDER)).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.BLOCK_003 });
  });

  it("người được thêm đã đủ số nhóm tối đa → 409 WS_006 (câu nói về NGƯỜI ĐÓ, không phải người thêm)", async () => {
    const { service } = setup({ perUser: LIMITS.workspace.perUserMax });
    await expect(service.add(actor, WS, OUTSIDER)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: ErrorCode.WS_006,
      message: expect.stringContaining("Người này"),
    });
  });

  it("nhóm đã lưu trữ → 409 WS_002", async () => {
    const { h, service } = setup();
    h.invitations.workspaces.set(WS, makeWorkspace({ status: "ARCHIVED" }));
    await expect(service.add(actor, WS, OUTSIDER)).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.WS_002 });
  });
});

/** OWNER là người thêm hợp lệ như ADMIN — vai trò do route (`requireWorkspaceRole`) kiểm, service không tự so vai trò. */
describe("MemberAddService — vai trò", () => {
  it("service không tự kiểm vai trò (route lo) nên OWNER tra được như ADMIN", async () => {
    const { service } = setup({ matches: [match(OUTSIDER)] });
    await expect(service.lookup({ id: OWNER, email: "o@e.com" }, WS, "lan@gmail.com")).resolves.toHaveLength(1);
  });
});
