/**
 * `PrismaContributionDirectory.getUsers` dựng `DirectoryUser.avatarUrl` bằng `avatarUrlOf(User.avatarAssetId)` (`shared/media`), gom cùng truy
 * vấn tên (không N+1). Người đã rời vẫn hiện ảnh; ẩn danh hoá luôn `null` — kể cả khi bản ghi cũ còn sót `avatarAssetId`.
 */
const mockUserFindMany = jest.fn();
const mockMembershipFindMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  ...jest.requireActual("../../../infrastructure/database"),
  prisma: {
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    workspaceMembership: { findMany: (...args: unknown[]) => mockMembershipFindMany(...args) },
  },
}));

import { PrismaContributionDirectory } from "../repositories/contribution-directory.repository.prisma";

const WS = "650000000000000000000b01";
const [AN, CHI, GONE, PLAIN] = ["650000000000000000000a01", "650000000000000000000a02", "650000000000000000000a03", "650000000000000000000a04"];
const signedThumb = (assetId: string): RegExp => new RegExp(`/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

describe("PrismaContributionDirectory.getUsers — avatar thành viên trong bảng đóng góp", () => {
  it("ACTIVE/LEFT có ảnh → URL ký sẵn (THUMB); chưa đặt ảnh → null; ANONYMIZED → null; một truy vấn user kèm avatarAssetId", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: AN, name: "Nguyễn Văn An", status: "ACTIVE", avatarAssetId: "65f0000000000000000000a1" },
      { id: CHI, name: "Đặng Thị Chi", status: "ACTIVE", avatarAssetId: "65f0000000000000000000a2" },
      { id: GONE, name: "Tài khoản đã xoá", status: "ANONYMIZED", avatarAssetId: "65f0000000000000000000a3" },
      { id: PLAIN, name: "Lê Bình", status: "ACTIVE", avatarAssetId: null },
    ]);
    mockMembershipFindMany.mockResolvedValue([
      { userId: AN, status: "ACTIVE", role: "MEMBER" },
      { userId: CHI, status: "LEFT", role: "MEMBER" },
      { userId: PLAIN, status: "ACTIVE", role: "MEMBER" },
    ]);

    const users = await new PrismaContributionDirectory().getUsers(WS, [AN, CHI, GONE, PLAIN, AN]);

    expect(users.get(AN)).toEqual({ id: AN, name: "Nguyễn Văn An", membership: "ACTIVE", avatarUrl: expect.stringMatching(signedThumb("65f0000000000000000000a1")) });
    expect(users.get(CHI)).toMatchObject({ membership: "LEFT", avatarUrl: expect.stringMatching(signedThumb("65f0000000000000000000a2")) });
    expect(users.get(GONE)).toEqual({ id: GONE, name: "Tài khoản đã xoá", membership: "ANONYMIZED", avatarUrl: null });
    expect(users.get(PLAIN)).toMatchObject({ membership: "ACTIVE", avatarUrl: null });
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledWith({ where: { id: { in: [AN, CHI, GONE, PLAIN] } }, select: { id: true, name: true, status: true, avatarAssetId: true } });
  });
});
