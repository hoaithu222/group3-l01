/**
 * Unit — `services/eligibility.service.ts` (be.md §5.1, 5 nhánh: self, blocked,
 * no-shared-workspace, có DM sẵn dù không đủ điều kiện nhắn — nhánh này thuộc
 * tầng gọi `checkDirectEligibility` + `findByDirectKey` riêng biệt, không thuộc
 * hàm thuần ở đây — và đủ điều kiện). Mock `prisma.userBlock.findFirst`
 * (`../../../infrastructure/database`) và `sharesActiveWorkspace`
 * (`../../../core/permission`) — cả 2 side thật đều cần Mongo/Redis thật nên
 * tách khỏi phạm vi unit (đã có tầng integration `conversations-direct.test.ts`
 * xác nhận hành vi thật CV-02/CV-03).
 */
const mockUserBlockFindFirst = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { userBlock: { findFirst: (...args: unknown[]) => mockUserBlockFindFirst(...args) } },
}));

const mockSharesActiveWorkspace = jest.fn();
const mockGuestDirectAllowed = jest.fn();
jest.mock("../../../core/permission", () => ({
  sharesActiveWorkspace: (...args: unknown[]) => mockSharesActiveWorkspace(...args),
  guestDirectAllowed: (...args: unknown[]) => mockGuestDirectAllowed(...args),
}));

import { checkDirectEligibility, isBlockedEitherWay } from "../services/eligibility.service";

describe("eligibility.service#checkDirectEligibility (be.md §5.1 — 5 nhánh)", () => {
  beforeEach(() => {
    mockGuestDirectAllowed.mockResolvedValue(true); // mặc định: không ai là khách (hoặc khách có phạm vi chung)
  });

  afterEach(() => {
    mockUserBlockFindFirst.mockReset();
    mockSharesActiveWorkspace.mockReset();
    mockGuestDirectAllowed.mockReset();
  });

  it("p3-04 — chung workspace nhưng KHÁCH không chung kênh chỉ định/nhóm chat → canMessage false (cùng reason NO_SHARED_WORKSPACE, không lộ \"là khách\")", async () => {
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockSharesActiveWorkspace.mockResolvedValue(true);
    mockGuestDirectAllowed.mockResolvedValue(false);
    const result = await checkDirectEligibility("u1", "u2");
    expect(result).toEqual({ canMessage: false, reason: "NO_SHARED_WORKSPACE" });
    expect(mockGuestDirectAllowed).toHaveBeenCalledWith("u1", "u2");
  });

  it("p3-04 — KHÔNG kiểm phạm vi khách khi đã bị chặn hoặc chưa chung workspace (không tốn truy vấn)", async () => {
    mockUserBlockFindFirst.mockResolvedValue({ id: "block1" });
    mockSharesActiveWorkspace.mockResolvedValue(true);
    await checkDirectEligibility("u1", "u2");
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockSharesActiveWorkspace.mockResolvedValue(false);
    await checkDirectEligibility("u1", "u2");
    expect(mockGuestDirectAllowed).not.toHaveBeenCalled();
  });

  it("nhánh 1 — SELF: meId === otherId → canMessage false, reason SELF, KHÔNG gọi block/shares", async () => {
    const result = await checkDirectEligibility("u1", "u1");
    expect(result).toEqual({ canMessage: false, reason: "SELF" });
    expect(mockUserBlockFindFirst).not.toHaveBeenCalled();
    expect(mockSharesActiveWorkspace).not.toHaveBeenCalled();
  });

  it("nhánh 2 — BLOCKED: có block 1 chiều bất kỳ (dù có chung workspace) → canMessage false, reason BLOCKED", async () => {
    mockUserBlockFindFirst.mockResolvedValue({ id: "block1" });
    mockSharesActiveWorkspace.mockResolvedValue(true);
    const result = await checkDirectEligibility("u1", "u2");
    expect(result).toEqual({ canMessage: false, reason: "BLOCKED" });
  });

  it("nhánh 3 — NO_SHARED_WORKSPACE: không block, không chung workspace ACTIVE → canMessage false", async () => {
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockSharesActiveWorkspace.mockResolvedValue(false);
    const result = await checkDirectEligibility("u1", "u2");
    expect(result).toEqual({ canMessage: false, reason: "NO_SHARED_WORKSPACE" });
  });

  it("nhánh 4 — BLOCKED ưu tiên hơn NO_SHARED_WORKSPACE khi cả 2 đều đúng", async () => {
    mockUserBlockFindFirst.mockResolvedValue({ id: "block1" });
    mockSharesActiveWorkspace.mockResolvedValue(false);
    const result = await checkDirectEligibility("u1", "u2");
    expect(result.reason).toBe("BLOCKED");
  });

  it("nhánh 5 — đủ điều kiện: không block, chung workspace ACTIVE → canMessage true, reason null", async () => {
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockSharesActiveWorkspace.mockResolvedValue(true);
    const result = await checkDirectEligibility("u1", "u2");
    expect(result).toEqual({ canMessage: true, reason: null });
  });

  it("gọi block-check + shares-check SONG SONG (Promise.all) với đúng cặp userId", async () => {
    mockUserBlockFindFirst.mockResolvedValue(null);
    mockSharesActiveWorkspace.mockResolvedValue(true);
    await checkDirectEligibility("u1", "u2");
    expect(mockSharesActiveWorkspace).toHaveBeenCalledWith("u1", "u2");
    expect(mockUserBlockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ blockerId: "u1", blockedId: "u2" }, { blockerId: "u2", blockedId: "u1" }] } })
    );
  });
});

describe("eligibility.service#isBlockedEitherWay", () => {
  afterEach(() => mockUserBlockFindFirst.mockReset());

  it("không có bản ghi UserBlock nào → false", async () => {
    mockUserBlockFindFirst.mockResolvedValue(null);
    expect(await isBlockedEitherWay("a", "b")).toBe(false);
  });

  it("có bản ghi (bất kể chiều nào) → true", async () => {
    mockUserBlockFindFirst.mockResolvedValue({ id: "x" });
    expect(await isBlockedEitherWay("a", "b")).toBe(true);
  });

  it("query OR cả 2 chiều blocker/blocked", async () => {
    mockUserBlockFindFirst.mockResolvedValue(null);
    await isBlockedEitherWay("a", "b");
    expect(mockUserBlockFindFirst).toHaveBeenCalledWith({
      where: { OR: [{ blockerId: "a", blockedId: "b" }, { blockerId: "b", blockedId: "a" }] },
      select: { id: true },
    });
  });
});
