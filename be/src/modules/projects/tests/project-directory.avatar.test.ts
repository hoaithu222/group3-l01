/**
 * `PrismaProjectDirectory` dựng `UserSummary.avatarUrl` bằng `avatarUrlOf(User.avatarAssetId)` (`shared/media`) — Prisma giả để khoá việc
 * `avatarAssetId` đi CÙNG truy vấn tên (không N+1). Luồng HTTP thật: `tests/integration/user-avatars.routes.test.ts`.
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

import { PrismaProjectDirectory } from "../repositories/project-directory.repository.prisma";

const WS = "650000000000000000000b01";
const LAN = "650000000000000000000a01";
const MINH = "650000000000000000000a02";
const AVATAR = "65f0000000000000000000ab";
const signedThumb = new RegExp(`/api/v1/assets/${AVATAR}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

const ROWS = [
  { id: LAN, name: "Nguyễn Lan Anh", normalizedName: "nguyen lan anh", avatarAssetId: AVATAR },
  { id: MINH, name: "Trần Minh", normalizedName: "tran minh", avatarAssetId: null },
];

describe("PrismaProjectDirectory — avatar người làm/người nhắc tên", () => {
  beforeEach(() => {
    mockUserFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(ROWS.filter((r) => where.id.in.includes(r.id))));
    mockMembershipFindMany.mockResolvedValue([{ userId: LAN }, { userId: MINH }]);
  });

  it("userSummaries: assignee có ảnh → avatarUrl chứa /api/v1/assets/<id>/image (THUMB ký sẵn); chưa đặt ảnh → null; MỘT truy vấn", async () => {
    const users = await new PrismaProjectDirectory().userSummaries([LAN, MINH]);

    expect(users.get(LAN)).toEqual({ id: LAN, name: "Nguyễn Lan Anh", avatarUrl: expect.stringMatching(signedThumb) });
    expect(users.get(MINH)).toEqual({ id: MINH, name: "Trần Minh", avatarUrl: null });
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledWith({ where: { id: { in: [LAN, MINH] } }, select: { id: true, name: true, avatarAssetId: true } });
  });

  it("searchMentionables: gợi ý nhắc tên cũng mang avatar (select kèm avatarAssetId), đúng 3 khoá, không email", async () => {
    const found = await new PrismaProjectDirectory().searchMentionables(WS, "lan", 20);

    expect(found).toEqual([{ id: LAN, name: "Nguyễn Lan Anh", avatarUrl: expect.stringMatching(signedThumb) }]);
    expect(mockUserFindMany.mock.calls[0]![0]).toMatchObject({ select: { id: true, name: true, normalizedName: true, avatarAssetId: true } });
  });
});
