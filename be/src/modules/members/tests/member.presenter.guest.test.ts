/**
 * Unit — phần KHÁCH của `member.presenter` (p3-04): hạn/`version`/kênh chỉ định chỉ hiện cho OWNER/ADMIN, `requestedAt` ở dòng admin,
 * `MemberQueryService.getCard` chỉ tra kênh chỉ định khi người xem là OWNER/ADMIN và mục tiêu là khách.
 */
import { toMemberRow, toMemberCard, toAdminMemberRow } from "../services/member.presenter";
import { MemberQueryService } from "../services/member-query.service";
import { InMemoryMembershipRepository } from "../repositories/membership.repository.inmemory";
import type { MembershipWithUser } from "../repositories/membership.repository.interface";
import type { WorkspaceMembership } from "../entities/member.interface";
import { WS, makeMembership } from "./support/access-harness";

jest.mock("../../presence/presence.service", () => ({ getStates: jest.fn() }));
import { getStates } from "../../presence/presence.service";

const EXPIRES = new Date("2026-10-01T00:00:00Z");

function row(overrides: Partial<WorkspaceMembership> = {}): MembershipWithUser {
  const membership = makeMembership({ userId: "guest1", role: "GUEST", expiresAt: EXPIRES, expiryVersion: 3, ...overrides });
  return { membership, user: { id: membership.userId, name: "Khách", normalizedName: "khach", email: "k@e.com", avatarAssetId: null } };
}

describe("member.presenter — khách", () => {
  it("toMemberRow: OWNER/ADMIN thấy expiresAt của khách; MEMBER/GUEST/không rõ vai trò người xem thì KHÔNG", () => {
    expect(toMemberRow(row(), "v", "OFFLINE", "OWNER").expiresAt).toEqual(EXPIRES);
    expect(toMemberRow(row(), "v", "OFFLINE", "ADMIN").expiresAt).toEqual(EXPIRES);
    for (const viewer of ["MEMBER", "GUEST", undefined] as const) {
      expect("expiresAt" in toMemberRow(row(), "v", "OFFLINE", viewer)).toBe(false);
    }
  });

  it("chỉ hàng của KHÁCH mới có expiresAt (thành viên thường không, dù dữ liệu có expiresAt)", () => {
    expect("expiresAt" in toMemberRow(row({ role: "MEMBER" }), "v", "OFFLINE", "OWNER")).toBe(false);
  });

  it("toMemberCard: thẻ khách cho OWNER/ADMIN có version (= expiryVersion) + guestChannelIds; cho MEMBER thì không", () => {
    const forAdmin = toMemberCard(row(), "v", "ADMIN", "OFFLINE", ["c1", "c2"]);
    expect(forAdmin).toMatchObject({ role: "GUEST", version: 3, guestChannelIds: ["c1", "c2"], expiresAt: EXPIRES });
    const forMember = toMemberCard(row(), "v", "MEMBER", "OFFLINE", ["c1"]);
    expect("version" in forMember).toBe(false);
    expect("guestChannelIds" in forMember).toBe(false);
    expect("expiresAt" in forMember).toBe(false);
  });

  it("toMemberCard: khách chưa có expiryVersion → version 0; guestChannelIds mặc định []", () => {
    const card = toMemberCard(row({ expiryVersion: undefined }), "v", "OWNER", "OFFLINE");
    expect(card).toMatchObject({ version: 0, guestChannelIds: [] });
  });

  it("toAdminMemberRow: có requestedAt (yêu cầu tham gia) và expiresAt", () => {
    const requestedAt = new Date("2026-09-20T00:00:00Z");
    const pending = toAdminMemberRow(row({ role: "MEMBER", status: "PENDING", requestedAt, expiresAt: null }), false);
    expect(pending).toMatchObject({ status: "PENDING", requestedAt, expiresAt: null });
    expect(toAdminMemberRow(row(), false)).toMatchObject({ role: "GUEST", expiresAt: EXPIRES, requestedAt: null });
  });
});

describe("MemberQueryService.getCard — kênh chỉ định của khách", () => {
  // `resetMocks: true` xoá implementation của factory trước mỗi test → gán lại.
  beforeEach(() => (getStates as jest.Mock).mockResolvedValue({}));

  function setup() {
    const repo = new InMemoryMembershipRepository();
    repo.seedUser({ id: "guest1", name: "Khách", normalizedName: "khach", email: "k@e.com", avatarAssetId: null });
    repo.seedUser({ id: "member1", name: "Thành viên", normalizedName: "thanh vien", email: "m@e.com", avatarAssetId: null });
    repo.seedMembership(makeMembership({ id: "m-g", userId: "guest1", role: "GUEST", expiresAt: EXPIRES, expiryVersion: 2 }));
    repo.seedMembership(makeMembership({ id: "m-m", userId: "member1", role: "MEMBER" }));
    repo.guestChannels.set(`${WS}:guest1`, ["c9"]);
    const spy = jest.spyOn(repo, "listGuestChannelIds");
    return { service: new MemberQueryService(repo), spy };
  }

  it("OWNER/ADMIN xem khách → tra kênh chỉ định và trả version/guestChannelIds", async () => {
    const { service, spy } = setup();
    const card = await service.getCard("owner", "OWNER", WS, "guest1");
    expect(spy).toHaveBeenCalledWith(WS, "guest1");
    expect(card).toMatchObject({ role: "GUEST", version: 2, guestChannelIds: ["c9"] });
  });

  it("MEMBER xem khách, hoặc OWNER xem thành viên thường → KHÔNG tra kênh (không tốn truy vấn, không lộ)", async () => {
    const { service, spy } = setup();
    const asMember = await service.getCard("someone", "MEMBER", WS, "guest1");
    expect("guestChannelIds" in asMember).toBe(false);
    await service.getCard("owner", "OWNER", WS, "member1");
    expect(spy).not.toHaveBeenCalled();
  });
});
