import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

// `registerJob(...)` chạy 1 lần lúc import (side-effect ở đầu file
// `asset.jobs.ts`) — KHÔNG dùng `jest.fn().mock.calls` vì `resetMocks: true`
// (jest.config.ts) xoá lịch sử gọi trước MỖI test, kể cả các lệnh gọi đã xảy
// ra trước đó lúc import module. Ghi trực tiếp vào mảng thường để giữ được.
const mockRegistered: Array<[string, string, Processor]> = [];
const mockCronDefs: Array<{ schedulerId: string; queue: string; jobName: string; pattern: string }> =
  [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
  defineCron: (def: { schedulerId: string; queue: string; jobName: string; pattern: string }) => {
    mockCronDefs.push(def);
  },
}));

jest.mock("../repositories", () => {
  const { InMemoryAssetRepository } = jest.requireActual("../repositories/asset.repository.inmemory");
  const { InMemoryAssetLinkRepository } = jest.requireActual(
    "../repositories/asset-link.repository.inmemory"
  );
  return {
    PrismaAssetRepository: InMemoryAssetRepository,
    PrismaAssetLinkRepository: InMemoryAssetLinkRepository,
  };
});

// PDF thật (magic bytes `%PDF-`) — asset-processor đọc lại "storage" để xác
// nhận nội dung, kind FILE không cần xử lý thêm (không đụng sharp/music-metadata).
const PDF_BYTES = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< >>\nendobj\n", "utf8");

const mockDeleteMany = jest.fn().mockResolvedValue(undefined);
const mockHead = jest.fn();
const mockReadRange = jest.fn();
jest.mock("../../../infrastructure/storage", () => ({
  storage: {
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    head: (...args: unknown[]) => mockHead(...args),
    readRange: (...args: unknown[]) => mockReadRange(...args),
    putObject: jest.fn(),
  },
  buildKey: (nodeEnv: string, scope: string, assetId: string, variant: string, ext: string) =>
    `${nodeEnv}/${scope.toLowerCase()}/2026/01/${assetId}/${variant.toLowerCase()}.${ext}`,
}));

import "../jobs/asset.jobs";
import { InMemoryAssetRepository } from "../repositories/asset.repository.inmemory";
import { InMemoryAssetLinkRepository } from "../repositories/asset-link.repository.inmemory";

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("asset.jobs", () => {
  beforeEach(() => {
    InMemoryAssetRepository.clearStore();
    InMemoryAssetLinkRepository.clearStore();
    mockDeleteMany.mockClear().mockResolvedValue(undefined);
    mockHead.mockReset().mockResolvedValue({ size: PDF_BYTES.length });
    mockReadRange.mockReset().mockResolvedValue(PDF_BYTES);
  });

  it("đăng ký đúng 2 job: media/asset.process và cron/assets.cleanup", () => {
    expect(mockRegistered).toContainEqual(["media", "asset.process", expect.any(Function)]);
    expect(mockRegistered).toContainEqual(["cron", "assets.cleanup", expect.any(Function)]);
  });

  it("khai lịch chạy assets.cleanup mỗi giờ", () => {
    expect(mockCronDefs).toContainEqual({
      schedulerId: "assets.cleanup",
      queue: "cron",
      jobName: "assets.cleanup",
      pattern: "0 * * * *",
    });
  });

  it("asset.process chuyển PROCESSING → READY (magic bytes khớp kind FILE)", async () => {
    const repo = new InMemoryAssetRepository();
    const asset = await repo.create({
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      ownerId: "owner-1",
      scope: "RESOURCE",
      kind: "FILE",
      uploadMethod: "API_PUT",
      originalName: "a.pdf",
      declaredSize: PDF_BYTES.length,
      size: PDF_BYTES.length,
      mime: "application/pdf",
      status: "PROCESSING",
      storageKey: "resource/owner-1/x.pdf",
    });

    const processor = getProcessor("media", "asset.process");
    await processor({ data: { assetId: asset.id } } as Job);

    const updated = await repo.findById(asset.id);
    expect(updated?.status).toBe("READY");
    expect(updated?.readyAt).toBeInstanceOf(Date);
  });

  it("asset.process bỏ qua khi asset không ở trạng thái PROCESSING", async () => {
    const repo = new InMemoryAssetRepository();
    const asset = await repo.create({
      id: "bbbbbbbbbbbbbbbbbbbbbbbb",
      ownerId: "owner-1",
      scope: "RESOURCE",
      kind: "FILE",
      uploadMethod: "API_PUT",
      originalName: "a.pdf",
      declaredSize: 10,
      mime: "application/pdf",
      status: "UPLOADING",
      storageKey: "",
    });

    const processor = getProcessor("media", "asset.process");
    await processor({ data: { assetId: asset.id } } as Job);

    const updated = await repo.findById(asset.id);
    expect(updated?.status).toBe("UPLOADING");
  });

  it("assets.cleanup KHÔNG xoá asset vừa tạo (chưa quá ASSET_ORPHAN_TTL_HOURS)", async () => {
    const repo = new InMemoryAssetRepository();
    const fresh = await repo.create({
      id: "cccccccccccccccccccccccc",
      ownerId: "owner-1",
      scope: "RESOURCE",
      kind: "FILE",
      uploadMethod: "API_PUT",
      originalName: "fresh.pdf",
      declaredSize: 10,
      mime: "application/pdf",
      status: "UPLOADING",
      storageKey: "",
    });

    const processor = getProcessor("cron", "assets.cleanup");
    await processor({} as Job);

    const reloaded = await repo.findById(fresh.id);
    expect(reloaded?.status).toBe("UPLOADING");
  });

  it("assets.cleanup xoá asset mồ côi quá hạn (giả lập bằng fake timer, +25h)", async () => {
    const repo = new InMemoryAssetRepository();
    const orphan = await repo.create({
      id: "dddddddddddddddddddddddd",
      ownerId: "owner-1",
      scope: "RESOURCE",
      kind: "FILE",
      uploadMethod: "API_PUT",
      originalName: "orphan.pdf",
      declaredSize: 10,
      mime: "application/pdf",
      status: "UPLOADING",
      storageKey: "resource/owner-1/orphan.pdf",
    });

    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    jest.setSystemTime(Date.now() + 25 * 3600_000); // ASSET_ORPHAN_TTL_HOURS mặc định = 24

    const processor = getProcessor("cron", "assets.cleanup");
    await processor({} as Job);

    const reloaded = await repo.findById(orphan.id);
    expect(reloaded?.status).toBe("DELETED");
    expect(mockDeleteMany).toHaveBeenCalledWith(["resource/owner-1/orphan.pdf"]);
    jest.useRealTimers();
  });

  it("assets.cleanup KHÔNG xoá asset còn AssetLink dù đã quá hạn", async () => {
    const repo = new InMemoryAssetRepository();
    const linked = await repo.create({
      id: "eeeeeeeeeeeeeeeeeeeeeeee",
      ownerId: "owner-1",
      scope: "RESOURCE",
      kind: "FILE",
      uploadMethod: "API_PUT",
      originalName: "linked.pdf",
      declaredSize: 10,
      mime: "application/pdf",
      status: "READY",
      storageKey: "resource/owner-1/linked.pdf",
    });
    InMemoryAssetLinkRepository.seed({
      assetId: linked.id,
      targetType: "RESOURCE",
      targetId: "res-1",
      scopeType: "NONE",
      scopeId: null,
      createdBy: "owner-1",
    });

    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    jest.setSystemTime(Date.now() + 25 * 3600_000);

    const processor = getProcessor("cron", "assets.cleanup");
    await processor({} as Job);

    const reloaded = await repo.findById(linked.id);
    expect(reloaded?.status).toBe("READY");
    jest.useRealTimers();
  });
});
