import { z } from "zod";
import { mimePolicy } from "./mime-policy";

describe("mimePolicy", () => {
  describe("resolve()", () => {
    it("trả ext + maxBytes khi kind/mime hợp lệ", () => {
      const result = mimePolicy.resolve({ kind: "IMAGE", mime: "image/png", size: 1024, scope: "RESOURCE" });
      expect(result.ext).toBe("png");
      expect(result.maxBytes).toBe(20 * 1024 * 1024);
    });

    it("ném ASSET_001 (415) khi mime không thuộc allowlist của kind", () => {
      expect(() =>
        mimePolicy.resolve({ kind: "IMAGE", mime: "application/pdf", size: 10, scope: "RESOURCE" })
      ).toThrow(expect.objectContaining({ statusCode: 415, errorCode: "ASSET_001" }));
    });

    it("ném ASSET_001 khi scope AVATAR nhưng kind khác IMAGE", () => {
      expect(() =>
        mimePolicy.resolve({ kind: "VIDEO", mime: "video/mp4", size: 10, scope: "AVATAR" })
      ).toThrow(expect.objectContaining({ statusCode: 415, errorCode: "ASSET_001" }));
    });

    it("ném ASSET_002 (413) khi size vượt maxBytes", () => {
      expect(() =>
        mimePolicy.resolve({ kind: "VOICE", mime: "audio/aac", size: 20 * 1024 * 1024, scope: "MESSAGE" })
      ).toThrow(expect.objectContaining({ statusCode: 413, errorCode: "ASSET_002" }));
    });

    it("scope AVATAR siết maxBytes xuống avatarMaxBytes (2 MiB) dù IMAGE cho phép 20 MiB", () => {
      expect(() =>
        mimePolicy.resolve({ kind: "IMAGE", mime: "image/png", size: 3 * 1024 * 1024, scope: "AVATAR" })
      ).toThrow(expect.objectContaining({ statusCode: 413, errorCode: "ASSET_002" }));
      const ok = mimePolicy.resolve({ kind: "IMAGE", mime: "image/png", size: 1024, scope: "AVATAR" });
      expect(ok.maxBytes).toBe(2 * 1024 * 1024);
    });
  });

  describe("kindForMime()", () => {
    it("tra ngược đúng kind từ MIME thật", () => {
      expect(mimePolicy.kindForMime("image/jpeg")).toBe("IMAGE");
      expect(mimePolicy.kindForMime("video/mp4")).toBe("VIDEO");
      expect(mimePolicy.kindForMime("application/pdf")).toBe("FILE");
    });

    it("trả undefined khi MIME lạ", () => {
      expect(mimePolicy.kindForMime("application/x-msdownload")).toBeUndefined();
    });
  });

  describe("allAllowedMimes()", () => {
    it("gộp mime của mọi kind, không rỗng", () => {
      const all = mimePolicy.allAllowedMimes();
      expect(all).toContain("image/png");
      expect(all).toContain("application/pdf");
      expect(all).toContain("audio/wav");
      expect(all.length).toBeGreaterThan(10);
    });
  });

  describe("validateDeclared() (superRefine)", () => {
    const schema = z
      .object({ kind: z.enum(["IMAGE", "VIDEO", "AUDIO", "VOICE", "FILE"]), mime: z.string(), size: z.number(), scope: z.string() })
      .superRefine((v, ctx) =>
        mimePolicy.validateDeclared(v as Parameters<typeof mimePolicy.validateDeclared>[0], ctx)
      );

    it("qua được khi hợp lệ", () => {
      const result = schema.safeParse({ kind: "IMAGE", mime: "image/png", size: 1024, scope: "RESOURCE" });
      expect(result.success).toBe(true);
    });

    it("gắn issue vào path 'mime' khi không khớp kind", () => {
      const result = schema.safeParse({ kind: "IMAGE", mime: "application/pdf", size: 10, scope: "RESOURCE" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(["mime"]);
      }
    });

    it("gắn issue vào path 'size' khi vượt maxBytes", () => {
      const result = schema.safeParse({
        kind: "IMAGE",
        mime: "image/png",
        size: 100 * 1024 * 1024,
        scope: "RESOURCE",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(["size"]);
      }
    });
  });

  describe("MIME bổ sung theo scope RESOURCE (p3-01)", () => {
    it("RESOURCE nhận text/markdown và application/json (kind FILE); scope khác thì KHÔNG", () => {
      for (const mime of ["text/markdown", "application/json"]) {
        expect(mimePolicy.resolve({ kind: "FILE", mime, size: 100, scope: "RESOURCE" })).toEqual({
          ext: mime === "text/markdown" ? "md" : "json",
          maxBytes: 25 * 1024 * 1024,
        });
        for (const scope of ["MESSAGE", "TASK", "TASK_COMMENT", "DOC"] as const) {
          expect(() => mimePolicy.resolve({ kind: "FILE", mime, size: 100, scope })).toThrow(
            expect.objectContaining({ statusCode: 415, errorCode: "ASSET_001" })
          );
        }
      }
    });

    it("MIME bổ sung chỉ thuộc đúng kind của nó (md/json = FILE, không nhận qua kind IMAGE/VIDEO)", () => {
      expect(mimePolicy.allowedMimes("FILE", "RESOURCE")).toEqual(
        expect.arrayContaining(["text/markdown", "application/json", "text/plain", "text/csv"])
      );
      expect(mimePolicy.allowedMimes("IMAGE", "RESOURCE")).not.toContain("application/json");
      expect(mimePolicy.allowedMimes("FILE", "MESSAGE")).not.toContain("text/markdown");
      expect(() => mimePolicy.resolve({ kind: "VIDEO", mime: "application/json", size: 1, scope: "RESOURCE" })).toThrow(
        expect.objectContaining({ errorCode: "ASSET_001" })
      );
    });

    it("KHÔNG nhận HTML/SVG/executable ở bất kỳ scope nào", () => {
      for (const mime of ["text/html", "image/svg+xml", "application/x-msdownload", "application/javascript"]) {
        expect(mimePolicy.allAllowedMimes()).not.toContain(mime);
        expect(() => mimePolicy.resolve({ kind: "FILE", mime, size: 1, scope: "RESOURCE" })).toThrow(
          expect.objectContaining({ errorCode: "ASSET_001" })
        );
      }
    });

    it("allAllowedMimes (preset multer API_PUT) gồm md/json; isTextMime nhận đúng 4 MIME văn bản", () => {
      expect(mimePolicy.allAllowedMimes()).toEqual(expect.arrayContaining(["text/markdown", "application/json"]));
      for (const t of ["text/plain", "text/csv", "text/markdown", "application/json"]) expect(mimePolicy.isTextMime(t)).toBe(true);
      for (const t of ["application/pdf", "image/png", "application/zip"]) expect(mimePolicy.isTextMime(t)).toBe(false);
      expect(mimePolicy.isTextualDetectedMime("application/xml")).toBe(true);
      expect(mimePolicy.isTextualDetectedMime("image/png")).toBe(false);
    });

    it("validateDeclared (DTO) theo scope: md qua ở RESOURCE, bị issue ở MESSAGE", () => {
      const schema = z
        .object({ kind: z.enum(["FILE"]), mime: z.string(), size: z.number(), scope: z.enum(["RESOURCE", "MESSAGE"]) })
        .superRefine((v, ctx) => mimePolicy.validateDeclared(v as Parameters<typeof mimePolicy.validateDeclared>[0], ctx));
      expect(schema.safeParse({ kind: "FILE", mime: "text/markdown", size: 10, scope: "RESOURCE" }).success).toBe(true);
      expect(schema.safeParse({ kind: "FILE", mime: "text/markdown", size: 10, scope: "MESSAGE" }).success).toBe(false);
    });
  });

  describe("scope STUDY siết chặt (p4-01 README §7)", () => {
    const MiB = 1024 * 1024;

    it("ảnh chỉ JPEG/PNG/WebP ≤ 5 MiB; GIF/HEIC bị từ chối dù kind IMAGE chung cho phép", () => {
      for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
        expect(mimePolicy.resolve({ kind: "IMAGE", mime, size: 5 * MiB, scope: "STUDY" }).maxBytes).toBe(5 * MiB);
      }
      for (const mime of ["image/gif", "image/heic"]) {
        expect(() => mimePolicy.resolve({ kind: "IMAGE", mime, size: 10, scope: "STUDY" })).toThrow(
          expect.objectContaining({ statusCode: 415, errorCode: "ASSET_001" })
        );
        // scope khác vẫn nhận (không ảnh hưởng hành vi cũ)
        expect(() => mimePolicy.resolve({ kind: "IMAGE", mime, size: 10, scope: "MESSAGE" })).not.toThrow();
      }
      expect(() => mimePolicy.resolve({ kind: "IMAGE", mime: "image/png", size: 5 * MiB + 1, scope: "STUDY" })).toThrow(
        expect.objectContaining({ statusCode: 413, errorCode: "ASSET_002" })
      );
    });

    it("âm thanh chỉ audio/mpeg và audio/mp4 ≤ 10 MiB; aac/ogg/wav bị từ chối", () => {
      for (const mime of ["audio/mpeg", "audio/mp4"]) {
        expect(mimePolicy.resolve({ kind: "AUDIO", mime, size: 10 * MiB, scope: "STUDY" }).maxBytes).toBe(10 * MiB);
      }
      for (const mime of ["audio/aac", "audio/ogg", "audio/wav"]) {
        expect(() => mimePolicy.resolve({ kind: "AUDIO", mime, size: 10, scope: "STUDY" })).toThrow(expect.objectContaining({ errorCode: "ASSET_001" }));
      }
      expect(() => mimePolicy.resolve({ kind: "AUDIO", mime: "audio/mpeg", size: 10 * MiB + 1, scope: "STUDY" })).toThrow(
        expect.objectContaining({ statusCode: 413, errorCode: "ASSET_002" })
      );
    });

    it("kind khác (VIDEO, VOICE, FILE) bị từ chối hoàn toàn ở scope STUDY", () => {
      expect(() => mimePolicy.resolve({ kind: "VIDEO", mime: "video/mp4", size: 10, scope: "STUDY" })).toThrow(expect.objectContaining({ errorCode: "ASSET_001" }));
      expect(() => mimePolicy.resolve({ kind: "VOICE", mime: "audio/mp4", size: 10, scope: "STUDY" })).toThrow(expect.objectContaining({ errorCode: "ASSET_001" }));
      expect(() => mimePolicy.resolve({ kind: "FILE", mime: "application/pdf", size: 10, scope: "STUDY" })).toThrow(expect.objectContaining({ errorCode: "ASSET_001" }));
      expect(mimePolicy.allowedMimes("FILE", "STUDY")).toEqual([]);
      expect(mimePolicy.allowedMimes("IMAGE", "STUDY")).toEqual(["image/jpeg", "image/png", "image/webp"]);
    });

    it("validateDeclared (DTO tạo asset) chặn sớm cùng luật", () => {
      const schema = z
        .object({ kind: z.enum(["IMAGE", "AUDIO"]), mime: z.string(), size: z.number(), scope: z.enum(["STUDY", "MESSAGE"]) })
        .superRefine((v, ctx) => mimePolicy.validateDeclared(v as Parameters<typeof mimePolicy.validateDeclared>[0], ctx));
      expect(schema.safeParse({ kind: "IMAGE", mime: "image/webp", size: MiB, scope: "STUDY" }).success).toBe(true);
      expect(schema.safeParse({ kind: "IMAGE", mime: "image/gif", size: MiB, scope: "STUDY" }).success).toBe(false);
      expect(schema.safeParse({ kind: "AUDIO", mime: "audio/mpeg", size: 11 * MiB, scope: "STUDY" }).success).toBe(false);
    });
  });

  describe("normalizeDetectedMime()", () => {
    it("quy đổi bí danh WAV và m4a của iOS (audio/x-m4a) về MIME chuẩn của allowlist", () => {
      expect(mimePolicy.normalizeDetectedMime("audio/vnd.wave")).toBe("audio/wav");
      expect(mimePolicy.normalizeDetectedMime("audio/x-wav")).toBe("audio/wav");
      expect(mimePolicy.normalizeDetectedMime("audio/x-m4a")).toBe("audio/mp4");
    });

    it("video/mp4 (m4a Android: brand isom/mp42) chỉ được coi là audio/mp4 khi KHAI BÁO audio/mp4", () => {
      expect(mimePolicy.normalizeDetectedMime("video/mp4", "audio/mp4")).toBe("audio/mp4");
      expect(mimePolicy.normalizeDetectedMime("video/mp4", "video/mp4")).toBe("video/mp4");
      expect(mimePolicy.normalizeDetectedMime("video/mp4", "image/png")).toBe("video/mp4");
      expect(mimePolicy.normalizeDetectedMime("video/mp4")).toBe("video/mp4");
    });

    it("MIME không có luật nào áp giữ nguyên", () => {
      expect(mimePolicy.normalizeDetectedMime("image/png", "audio/mp4")).toBe("image/png");
      expect(mimePolicy.normalizeDetectedMime("audio/mpeg", "audio/mp4")).toBe("audio/mpeg");
    });
  });
});
