/**
 * Unit — `AssetService.createFromBuffer` (đồng bộ chéo #3, p4-06): tệp do SERVER sinh (PDF báo cáo đóng góp, scope `REPORT`) đi thẳng lên storage và
 * thành `Asset READY`, không qua 2 bước của client; client không tạo được scope này qua `POST /assets`.
 */
import { AssetService } from "../services/asset.service";
import { AssetAccessService } from "../services/asset-access.service";
import { AssetProcessor } from "../services/asset-processor";
import { InMemoryAssetRepository } from "../repositories/asset.repository.inmemory";
import { InMemoryAssetLinkRepository } from "../repositories/asset-link.repository.inmemory";
import { createAssetSchema } from "../dtos/create-asset.dto";
import { CLIENT_ASSET_SCOPES, SERVER_ASSET_SCOPES } from "../entities/asset.interface";
import { mimePolicy } from "../services/mime-policy";

const mockPutObject = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock("../../../infrastructure/storage", () => ({
  storage: {
    putObject: (...args: unknown[]) => mockPutObject(...args),
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
  },
  buildKey: (nodeEnv: string, scope: string, assetId: string, variant: string, ext: string) => `${nodeEnv}/${scope.toLowerCase()}/2026/09/${assetId}/${variant.toLowerCase()}.${ext}`,
  LocalStorage: jest.fn(),
}));

const pdf = (size = 2048): Buffer => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size, 0x20)]);

describe("AssetService.createFromBuffer", () => {
  let service: AssetService;
  let repo: InMemoryAssetRepository;

  beforeEach(() => {
    InMemoryAssetRepository.clearStore();
    InMemoryAssetLinkRepository.clearStore();
    repo = new InMemoryAssetRepository();
    const linkRepo = new InMemoryAssetLinkRepository();
    service = new AssetService(repo, linkRepo, new AssetAccessService(linkRepo), new AssetProcessor(repo));
    mockPutObject.mockReset().mockResolvedValue({ key: "k", size: 1 });
    mockDeleteMany.mockReset().mockResolvedValue(undefined);
  });

  const input = (over: Partial<Parameters<AssetService["createFromBuffer"]>[0]> = {}) => ({
    scope: "REPORT" as const,
    ownerId: "owner-1",
    workspaceId: "0000000000000000000000a1",
    mime: "application/pdf",
    fileName: "dong-gop-sprint-1-all.pdf",
    buffer: pdf(),
    ...over,
  });

  it("ghi storage rồi tạo asset READY (kind FILE, checksum sha256, readyAt) — không qua UPLOADING/PROCESSING", async () => {
    const dto = await service.createFromBuffer(input());
    expect(dto).toMatchObject({ scope: "REPORT", kind: "FILE", status: "READY", mime: "application/pdf", size: 2048 + 9, originalName: "dong-gop-sprint-1-all.pdf" });
    expect(dto.readyAt).toBeInstanceOf(Date);
    expect(mockPutObject).toHaveBeenCalledTimes(1);
    const [key, buffer, mime] = mockPutObject.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(/\/report\/2026\/09\/[0-9a-f]{24}\/original\.pdf$/);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(mime).toBe("application/pdf");
    const stored = await repo.findById(dto.id);
    expect(stored).toMatchObject({ ownerId: "owner-1", workspaceId: "0000000000000000000000a1", uploadMethod: "API_PUT", status: "READY" });
    expect(stored?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("từ chối tệp rỗng, MIME ngoài allowlist của REPORT (chỉ PDF), nội dung không phải PDF, vượt 20 MiB", async () => {
    await expect(service.createFromBuffer(input({ buffer: Buffer.alloc(0) }))).rejects.toMatchObject({ errorCode: "ASSET_001" });
    await expect(service.createFromBuffer(input({ mime: "image/png" }))).rejects.toMatchObject({ errorCode: "ASSET_001" });
    await expect(service.createFromBuffer(input({ buffer: Buffer.from("<html>không phải pdf</html>") }))).rejects.toMatchObject({ errorCode: "ASSET_001" });
    await expect(service.createFromBuffer(input({ buffer: pdf(20 * 1024 * 1024) }))).rejects.toMatchObject({ errorCode: "ASSET_002", statusCode: 413 });
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("ghi DB lỗi sau khi đã ghi storage → dọn object vừa ghi rồi ném lỗi (không để tệp mồ côi)", async () => {
    jest.spyOn(repo, "create").mockRejectedValueOnce(new Error("mongo down"));
    await expect(service.createFromBuffer(input())).rejects.toThrow("mongo down");
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
  });
});

describe("scope REPORT — chỉ server tạo", () => {
  it("REPORT nằm trong ASSET_SCOPES nhưng KHÔNG trong scope client; POST /assets từ chối, scope thường vẫn nhận", () => {
    expect(SERVER_ASSET_SCOPES).toEqual(["REPORT"]);
    expect(CLIENT_ASSET_SCOPES as readonly string[]).not.toContain("REPORT");
    const body = { kind: "FILE", fileName: "x.pdf", mime: "application/pdf", size: 1024 };
    expect(createAssetSchema.safeParse({ ...body, scope: "REPORT" }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...body, scope: "TASK" }).success).toBe(true);
  });

  it("mime-policy: REPORT chỉ nhận FILE application/pdf ≤ 20 MiB", () => {
    expect(mimePolicy.allowedMimes("FILE", "REPORT")).toEqual(["application/pdf"]);
    expect(mimePolicy.allowedMimes("IMAGE", "REPORT")).toEqual([]);
    expect(mimePolicy.resolve({ kind: "FILE", mime: "application/pdf", size: 20 * 1024 * 1024, scope: "REPORT" }).maxBytes).toBe(20 * 1024 * 1024);
    expect(() => mimePolicy.resolve({ kind: "FILE", mime: "text/plain", size: 10, scope: "REPORT" })).toThrow(expect.objectContaining({ errorCode: "ASSET_001" }));
  });
});
