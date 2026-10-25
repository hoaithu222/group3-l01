/**
 * `AssetProcessor` — sharp/file-type THẬT (không mock), chỉ mock `storage`
 * (đọc/ghi object) + dùng `InMemoryAssetRepository` thật để quan sát
 * side-effect (status/width/height/thumbnailAssetId/durationMs).
 *
 * `music-metadata` (ESM-only, nạp qua `import()` động — xem
 * `asset-processor.ts`) KHÔNG tải được trong Jest: Jest chạy test trong 1 VM
 * context (`jest-environment-node`) và Node chặn `import()` động trong VM
 * context với `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` trừ khi chạy với
 * cờ `--experimental-vm-modules` (không bật trong `npm test` của repo này) —
 * xác nhận bằng thử trực tiếp, không phải suy đoán. Cơ chế nạp thật đã được
 * xác minh hoạt động đúng NGOÀI Jest (`ts-node`/production — xem README §10:
 * build thử `import()` giữ nguyên qua `tsc` + chạy `node` thật thành công).
 * Ở đây dùng `loadMusicMetadata` GIẢ (đọc thẳng header WAV — cùng công thức
 * `buildWav()` dùng để tạo file) để test ĐÚNG logic của `AssetProcessor`
 * (so sánh thời lượng, REJECTED/READY, gọi `repo.update`) mà không phụ thuộc
 * giới hạn nền tảng Jest kể trên.
 */
const mockReadRange = jest.fn();
const mockPutObject = jest.fn();
const mockDeleteMany = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../infrastructure/storage", () => ({
  storage: {
    readRange: (...args: unknown[]) => mockReadRange(...args),
    putObject: (...args: unknown[]) => mockPutObject(...args),
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
  },
  buildKey: (nodeEnv: string, scope: string, assetId: string, variant: string, ext: string) =>
    `${nodeEnv}/${scope.toLowerCase()}/2026/01/${assetId}/${variant.toLowerCase()}.${ext}`,
}));

// Chỉ VOICE.mime/maxSeconds bị nới cho test (thêm "audio/wav", siết maxSeconds
// xuống 1s) — tránh phải tạo bytes AAC/MP3/OGG thật hợp lệ chỉ để test logic
// so sánh thời lượng; phần "đúng allowlist thật của VOICE" đã có ở
// `mime-policy.test.ts`/`create()` (AssetService).
jest.mock("../../../core/constants", () => {
  const actual = jest.requireActual("../../../core/constants");
  return {
    ...actual,
    LIMITS: {
      ...actual.LIMITS,
      upload: {
        ...actual.LIMITS.upload,
        kinds: {
          ...actual.LIMITS.upload.kinds,
          VOICE: { ...actual.LIMITS.upload.kinds.VOICE, mime: [...actual.LIMITS.upload.kinds.VOICE.mime, "audio/wav"], maxSeconds: 1 },
        },
      },
    },
  };
});

import sharp from "sharp";
import * as fs from "fs";
import { AssetProcessor, type MusicMetadataLoader } from "./asset-processor";
import { InMemoryAssetRepository } from "../repositories/asset.repository.inmemory";
import type { AssetCreateInput } from "../entities/asset.interface";

/** Đọc header WAV thật (cùng công thức `buildWav()`) — xem giải thích ở đầu file. */
function fakeMusicMetadataLoader(): MusicMetadataLoader {
  return async () =>
    ({
      parseFile: async (filePath: string) => {
        const buf = await fs.promises.readFile(filePath);
        const sampleRate = buf.readUInt32LE(24);
        const blockAlign = buf.readUInt16LE(32);
        const dataSize = buf.readUInt32LE(40);
        return { format: { duration: dataSize / (sampleRate * blockAlign) } };
      },
    }) as unknown as Awaited<ReturnType<MusicMetadataLoader>>;
}

// Nội dung PDF thật (magic bytes `%PDF-`) — dùng để giả lập ".exe đổi tên .jpg".
const PDF_BYTES = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< >>\nendobj\n", "utf8");

function buildWav({
  sampleRate,
  durationSeconds,
  channels = 1,
  bitsPerSample = 16,
}: {
  sampleRate: number;
  durationSeconds: number;
  channels?: number;
  bitsPerSample?: number;
}): Buffer {
  const numSamples = Math.round(sampleRate * durationSeconds);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

const BASE: Omit<AssetCreateInput, "id" | "kind" | "mime" | "originalName" | "status"> = {
  ownerId: "owner-1",
  scope: "RESOURCE",
  uploadMethod: "API_PUT",
  declaredSize: 10_000_000,
  storageKey: "resource/owner-1/x",
};

describe("AssetProcessor", () => {
  let repo: InMemoryAssetRepository;
  let processor: AssetProcessor;

  beforeEach(() => {
    InMemoryAssetRepository.clearStore();
    repo = new InMemoryAssetRepository();
    processor = new AssetProcessor(repo);
    mockReadRange.mockReset();
    mockPutObject.mockReset().mockResolvedValue({ key: "thumb-key", size: 100 });
    mockDeleteMany.mockClear().mockResolvedValue(undefined);
  });

  it("IMAGE: sinh thumbnail (asset con) + width/height thật từ nội dung → READY", async () => {
    const pngBuffer = await sharp({
      create: { width: 50, height: 40, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    mockReadRange.mockResolvedValue(pngBuffer);

    const asset = await repo.create({
      ...BASE,
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      kind: "IMAGE",
      mime: "image/png",
      originalName: "photo.png",
      status: "PROCESSING",
      size: pngBuffer.length,
    });

    await processor.process(asset.id);

    const updated = await repo.findById(asset.id);
    expect(updated?.status).toBe("READY");
    expect(updated?.width).toBe(50);
    expect(updated?.height).toBe(40);
    expect(updated?.thumbnailAssetId).not.toBeNull();
    expect(mockPutObject).toHaveBeenCalledTimes(1);

    const thumb = await repo.findById(updated!.thumbnailAssetId!);
    expect(thumb?.variant).toBe("THUMB");
    expect(thumb?.parentAssetId).toBe(asset.id);
    expect(thumb?.status).toBe("READY");
    expect(thumb?.mime).toBe("image/webp");
  });

  it("AST-02: nội dung PDF nhưng khai IMAGE/image/png → REJECTED ASSET_001, không tạo thumb, xoá object gốc", async () => {
    mockReadRange.mockResolvedValue(PDF_BYTES);

    const asset = await repo.create({
      ...BASE,
      id: "bbbbbbbbbbbbbbbbbbbbbbbb",
      kind: "IMAGE",
      mime: "image/png",
      originalName: "fake.png",
      status: "PROCESSING",
      size: PDF_BYTES.length,
    });

    await processor.process(asset.id);

    const updated = await repo.findById(asset.id);
    expect(updated?.status).toBe("REJECTED");
    expect(updated?.thumbnailAssetId).toBeNull();
    expect(mockDeleteMany).toHaveBeenCalledWith([BASE.storageKey]);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it("AUDIO: đọc durationMs thật từ WAV, không có trần thời lượng → READY", async () => {
    const audioProcessor = new AssetProcessor(repo, { loadMusicMetadata: fakeMusicMetadataLoader() });
    const wav = buildWav({ sampleRate: 8000, durationSeconds: 2 });
    mockReadRange.mockResolvedValue(wav);

    const asset = await repo.create({
      ...BASE,
      id: "cccccccccccccccccccccccc",
      kind: "AUDIO",
      mime: "audio/wav",
      originalName: "note.wav",
      status: "PROCESSING",
      size: wav.length,
    });

    await audioProcessor.process(asset.id);

    const updated = await repo.findById(asset.id);
    expect(updated?.status).toBe("READY");
    expect(updated?.durationMs).toBeGreaterThanOrEqual(1900);
    expect(updated?.durationMs).toBeLessThanOrEqual(2100);
  });

  it("AST-06: VOICE vượt maxSeconds (mock 1s) → REJECTED ASSET_006, xoá object gốc", async () => {
    const audioProcessor = new AssetProcessor(repo, { loadMusicMetadata: fakeMusicMetadataLoader() });
    const wav = buildWav({ sampleRate: 8000, durationSeconds: 2 });
    mockReadRange.mockResolvedValue(wav);

    const asset = await repo.create({
      ...BASE,
      id: "dddddddddddddddddddddddd",
      kind: "VOICE",
      mime: "audio/wav",
      originalName: "voice.wav",
      status: "PROCESSING",
      size: wav.length,
    });

    await audioProcessor.process(asset.id);

    const updated = await repo.findById(asset.id);
    expect(updated?.status).toBe("REJECTED");
    expect(updated?.rejectReason).toContain("Ghi âm");
    expect(mockDeleteMany).toHaveBeenCalledWith([BASE.storageKey]);
  });

  it("bỏ qua khi asset không ở PROCESSING (idempotent)", async () => {
    const asset = await repo.create({
      ...BASE,
      id: "eeeeeeeeeeeeeeeeeeeeeeee",
      kind: "IMAGE",
      mime: "image/png",
      originalName: "a.png",
      status: "READY",
    });
    await processor.process(asset.id);
    expect(mockReadRange).not.toHaveBeenCalled();
  });

  describe("MIME văn bản (không có magic bytes) — p3-01", () => {
    const create = (id: string, mime: string, size: number) =>
      repo.create({ ...BASE, id, kind: "FILE", mime, originalName: "x", status: "PROCESSING", size });

    it("text/markdown, application/json, text/csv, text/plain UTF-8 hợp lệ → READY", async () => {
      const cases: Array<[string, string, string]> = [
        ["a1a1a1a1a1a1a1a1a1a1a1a1", "text/markdown", "# Tiêu đề\n\nNội dung tiếng Việt có dấu\n"],
        ["a2a2a2a2a2a2a2a2a2a2a2a2", "application/json", '{"tên":"Việt","n":1}'],
        ["a3a3a3a3a3a3a3a3a3a3a3a3", "text/csv", "ten,diem\nAn,9\n"],
        ["a4a4a4a4a4a4a4a4a4a4a4a4", "text/plain", "console.log('xin chào');"],
      ];
      for (const [id, mime, text] of cases) {
        const buf = Buffer.from(text, "utf8");
        mockReadRange.mockResolvedValue(buf);
        const asset = await create(id, mime, buf.length);
        await processor.process(asset.id);
        expect((await repo.findById(asset.id))?.status).toBe("READY");
      }
    });

    it("PNG khai text/plain (đổi đuôi) → REJECTED; nhị phân có byte NUL / UTF-8 hỏng → REJECTED", async () => {
      const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ffffff" } }).png().toBuffer();
      const bad: Array<[string, Buffer]> = [
        ["b1b1b1b1b1b1b1b1b1b1b1b1", png],
        ["b2b2b2b2b2b2b2b2b2b2b2b2", Buffer.from([0x68, 0x00, 0x69])],
        ["b3b3b3b3b3b3b3b3b3b3b3b3", Buffer.from([0xff, 0xfe, 0xfd, 0x80])],
      ];
      for (const [id, buf] of bad) {
        mockReadRange.mockResolvedValue(buf);
        const asset = await create(id, "text/plain", buf.length);
        await processor.process(asset.id);
        const done = await repo.findById(asset.id);
        expect(done?.status).toBe("REJECTED");
        expect(done?.rejectReason).toBe("Nội dung tệp không khớp loại khai báo");
      }
      expect(mockDeleteMany).toHaveBeenCalledTimes(3);
    });

    it("XML có prolog (file-type nhận là application/xml) vẫn được nhận khi khai text/plain", async () => {
      const buf = Buffer.from('<?xml version="1.0"?><a>b</a>', "utf8");
      mockReadRange.mockResolvedValue(buf);
      const asset = await create("c1c1c1c1c1c1c1c1c1c1c1c1", "text/plain", buf.length);
      await processor.process(asset.id);
      expect((await repo.findById(asset.id))?.status).toBe("READY");
    });

    it("chữ ký lạ (zip) khai text/csv → REJECTED", async () => {
      const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00]);
      mockReadRange.mockResolvedValue(zip);
      const asset = await create("d1d1d1d1d1d1d1d1d1d1d1d1", "text/csv", zip.length);
      await processor.process(asset.id);
      expect((await repo.findById(asset.id))?.status).toBe("REJECTED");
    });
  });

  /**
   * Tin nhắn thoại/âm thanh `.m4a` THẬT: `file-type` chỉ đọc brand trong hộp `ftyp` — Android (`MediaRecorder`, brand `isom`/`mp42`)
   * ra `video/mp4`, iOS (brand `M4A `) ra `audio/x-m4a`. Cả hai từng bị `REJECTED` "không khớp loại khai báo" vì không nằm trong
   * allowlist `audio/mp4` (xác nhận bằng chạy thật `file-type`, không suy đoán).
   */
  describe("m4a thật (container MPEG-4 âm thanh)", () => {
    /** Hộp `ftyp` tối thiểu của một tệp ISO BMFF: `size|'ftyp'|majorBrand|minorVersion|compatibleBrands…`. */
    function buildFtyp(majorBrand: string, compatibleBrands: string[]): Buffer {
      const buf = Buffer.alloc(16 + compatibleBrands.length * 4);
      buf.writeUInt32BE(buf.length, 0);
      buf.write("ftyp", 4, "ascii");
      buf.write(majorBrand, 8, "ascii");
      compatibleBrands.forEach((brand, i) => buf.write(brand, 16 + i * 4, "ascii"));
      return buf;
    }

    const halfSecondLoader: MusicMetadataLoader = async () =>
      ({ parseFile: async () => ({ format: { duration: 0.5 } }) }) as unknown as Awaited<ReturnType<MusicMetadataLoader>>;

    async function processVoice(id: string, kind: "VOICE" | "AUDIO", declaredMime: string, content: Buffer) {
      mockReadRange.mockResolvedValue(content);
      const asset = await repo.create({
        ...BASE,
        id,
        scope: "MESSAGE",
        kind,
        mime: declaredMime,
        originalName: "voice-note.m4a",
        status: "PROCESSING",
        size: content.length,
      });
      await new AssetProcessor(repo, { loadMusicMetadata: halfSecondLoader }).process(asset.id);
      return repo.findById(asset.id);
    }

    it.each([
      ["Android MediaRecorder (isom)", "e1e1e1e1e1e1e1e1e1e1e1e1", buildFtyp("isom", ["isom", "mp42"])],
      ["Android (mp42)", "e2e2e2e2e2e2e2e2e2e2e2e2", buildFtyp("mp42", ["isom", "mp42"])],
      ["iOS AVAudioRecorder (M4A )", "e3e3e3e3e3e3e3e3e3e3e3e3", buildFtyp("M4A ", ["M4A ", "mp42", "isom"])],
    ])("VOICE khai audio/mp4 + nội dung %s → READY (không REJECTED nhầm)", async (_name, id, content) => {
      const done = await processVoice(id, "VOICE", "audio/mp4", content);
      expect(done?.status).toBe("READY");
      expect(done?.durationMs).toBe(500);
    });

    it("AUDIO khai audio/mp4 + m4a của Android → READY", async () => {
      const done = await processVoice("e4e4e4e4e4e4e4e4e4e4e4e4", "AUDIO", "audio/mp4", buildFtyp("isom", ["isom", "mp42"]));
      expect(done?.status).toBe("READY");
    });

    it("KHÔNG nới cho khai báo khác: nội dung MP4 (video/mp4) khai IMAGE/image/png vẫn REJECTED", async () => {
      mockReadRange.mockResolvedValue(buildFtyp("isom", ["isom", "mp42"]));
      const asset = await repo.create({
        ...BASE,
        id: "e5e5e5e5e5e5e5e5e5e5e5e5",
        scope: "MESSAGE",
        kind: "IMAGE",
        mime: "image/png",
        originalName: "fake.png",
        status: "PROCESSING",
        size: 32,
      });
      await processor.process(asset.id);
      expect((await repo.findById(asset.id))?.status).toBe("REJECTED");
    });

    it("KHÔNG nới cho nội dung không phải MPEG-4: PNG khai VOICE/audio/mp4 vẫn REJECTED", async () => {
      const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ffffff" } }).png().toBuffer();
      const done = await processVoice("e6e6e6e6e6e6e6e6e6e6e6e6", "VOICE", "audio/mp4", png);
      expect(done?.status).toBe("REJECTED");
    });
  });
});
