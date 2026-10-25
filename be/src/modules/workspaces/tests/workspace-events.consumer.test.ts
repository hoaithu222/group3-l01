/**
 * Unit — relay `workspace.events` → socket (`jobs/workspace-events.consumer.ts`): payload `workspace:updated` (sự kiện `created`/`updated`)
 * mang đủ ảnh nhóm (`avatarUrl`/`coverUrl`/`coverThumbUrl`/`coverPreset`) để màn đang mở vá cache, không phải tải lại chi tiết nhóm.
 */
type JobHandler = (job: { data: unknown }) => Promise<void>;
let mockHandler: JobHandler | undefined;
const mockFindUnique = jest.fn();
const mockEmitToScope = jest.fn();
const mockEmitToUsers = jest.fn();

jest.mock("../../../infrastructure/queue", () => ({
  // Giữ handler vào biến thường — `resetMocks: true` xoá `mock.calls` trước mỗi test nên không đọc lại được từ jest.fn.
  registerJob: (_queue: string, _name: string, handler: JobHandler) => {
    mockHandler = handler;
  },
}));
jest.mock("../../../infrastructure/database", () => ({
  prisma: { workspace: { findUnique: (...args: unknown[]) => mockFindUnique(...args) }, workspaceMembership: { findMany: jest.fn() } },
}));
jest.mock("../../../infrastructure/socket/socket.emit", () => ({
  emitToScope: (...args: unknown[]) => mockEmitToScope(...args),
  emitToUsers: (...args: unknown[]) => mockEmitToUsers(...args),
}));

import "../jobs/workspace-events.consumer";

const WS = "65f00000000000000000ff01";
const OWNER = "65f00000000000000000ff02";
const AVATAR = "65f00000000000000000ff03";
const COVER = "65f00000000000000000ff04";

const row = (over: Record<string, unknown> = {}) => ({
  id: WS,
  name: "Nhóm",
  description: "Mô tả",
  avatarAssetId: AVATAR,
  coverAssetId: COVER,
  coverPreset: "amber",
  version: 7,
  ownerId: OWNER,
  ...over,
});

async function run(data: Record<string, unknown>): Promise<void> {
  if (!mockHandler) throw new Error("workspace.events chưa đăng ký handler");
  await mockHandler({ data });
}

const imageUrl = (assetId: string, variant: "THUMB" | "ORIGINAL") =>
  expect.stringMatching(new RegExp(`/api/v1/assets/${assetId}/image\\?v=${variant}&e=\\d+&s=[0-9a-f]{64}$`));

beforeEach(() => {
  mockEmitToScope.mockResolvedValue(undefined);
});

describe("workspace.events — ảnh nhóm trong payload socket", () => {
  it("updated → workspace:updated tới scope WORKSPACE kèm avatarUrl/coverUrl/coverThumbUrl/coverPreset + version", async () => {
    mockFindUnique.mockResolvedValue(row());
    await run({ event: "updated", workspaceId: WS });

    expect(mockEmitToScope).toHaveBeenCalledWith({ type: "WORKSPACE", id: WS }, "workspace:updated", {
      id: WS,
      name: "Nhóm",
      description: "Mô tả",
      avatarUrl: imageUrl(AVATAR, "THUMB"),
      coverUrl: imageUrl(COVER, "ORIGINAL"),
      coverThumbUrl: imageUrl(COVER, "THUMB"),
      coverPreset: "amber",
      version: 7,
    });
  });

  it("ảnh vừa bị gỡ (cột null) → URL null, preset lạ → null (client quay về nền mặc định)", async () => {
    mockFindUnique.mockResolvedValue(row({ avatarAssetId: null, coverAssetId: null, coverPreset: "khong-ton-tai" }));
    await run({ event: "updated", workspaceId: WS });

    expect(mockEmitToScope).toHaveBeenCalledWith(
      { type: "WORKSPACE", id: WS },
      "workspace:updated",
      expect.objectContaining({ avatarUrl: null, coverUrl: null, coverThumbUrl: null, coverPreset: null, version: 7 })
    );
  });

  it("created → chỉ gửi cho chủ nhóm, cùng bộ trường ảnh", async () => {
    mockFindUnique.mockResolvedValue(row());
    await run({ event: "created", workspaceId: WS, ownerId: OWNER });

    expect(mockEmitToUsers).toHaveBeenCalledWith(
      [OWNER],
      "workspace:updated",
      expect.objectContaining({ avatarUrl: imageUrl(AVATAR, "THUMB"), coverUrl: imageUrl(COVER, "ORIGINAL"), coverPreset: "amber" })
    );
    expect(mockEmitToScope).not.toHaveBeenCalled();
  });

  it("nhóm không còn → không phát gì", async () => {
    mockFindUnique.mockResolvedValue(null);
    await run({ event: "updated", workspaceId: WS });
    expect(mockEmitToScope).not.toHaveBeenCalled();
    expect(mockEmitToUsers).not.toHaveBeenCalled();
  });
});
