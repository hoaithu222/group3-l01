import { z } from "zod";
import { LIMITS } from "../../../core/constants";
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AssetKind, AssetScope } from "../entities/asset.interface";

/**
 * Đuôi file suy từ MIME đã duyệt (KHÔNG lấy từ tên file client gửi — cùng lý
 * do `core/middlewares/upload.ts`/`local.storage.ts` đã áp dụng).
 */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "application/json": "json",
  "application/zip": "zip",
};

/**
 * MIME thuần văn bản — KHÔNG có magic bytes (`file-type` trả `undefined`): `asset-processor` kiểm bằng
 * `text-sniff.ts` (không NUL + UTF-8 hợp lệ) thay vì chữ ký nhị phân.
 */
const TEXT_MIMES: ReadonlySet<string> = new Set(["text/plain", "text/csv", "text/markdown", "application/json"]);

/** Chữ ký `file-type` trả về nhưng thực chất là văn bản (XML có prolog `<?xml`) — chấp nhận cho MIME văn bản. */
const TEXTUAL_DETECTED_MIMES: ReadonlySet<string> = new Set(["application/xml"]);

/**
 * `file-type` (magic bytes, `asset-processor.ts`) đôi khi trả MIME khác chuẩn
 * web dùng trong `LIMITS.upload.kinds` — vd RIFF/WAVE → `audio/vnd.wave` thay
 * vì `audio/wav` (xác nhận bằng thử thật với buffer WAV hợp lệ, không suy
 * đoán). Quy đổi trước khi so allowlist để không REJECTED nhầm tệp hợp lệ.
 */
const DETECTED_MIME_ALIASES: Record<string, string> = {
  "audio/vnd.wave": "audio/wav",
  "audio/x-wav": "audio/wav",
  // m4a do iOS (AVAudioRecorder) ghi có brand `M4A ` trong `ftyp` → `file-type` trả `audio/x-m4a`, không có trong allowlist.
  "audio/x-m4a": "audio/mp4",
};

/**
 * Tệp `.m4a` do `MediaRecorder` của Android ghi (tin nhắn thoại) có brand `isom`/`mp42` — `file-type` (16.x, đã thử thật) trả
 * `video/mp4` cho brand đó vì chữ ký `ftyp` KHÔNG phân biệt được container chỉ-có-âm-thanh với container có video. Nên khi tệp
 * khai báo `audio/mp4` (kind AUDIO/VOICE), `video/mp4` là CÙNG họ container MPEG-4 và được coi là `audio/mp4`; nếu không mọi tin
 * thoại Android bị `REJECTED` "Nội dung tệp không khớp loại khai báo". Chỉ áp cho khai báo `audio/mp4` — khai báo khác giữ nguyên.
 */
const MP4_AUDIO_DECLARED = "audio/mp4";
const MP4_CONTAINER_DETECTED = "video/mp4";

export interface DeclaredAssetInput {
  kind: AssetKind;
  mime: string;
  size: number;
  scope: AssetScope;
}

function kindPolicy(kind: AssetKind) {
  return LIMITS.upload.kinds[kind];
}

/** Kind của 1 MIME nằm ngoài `kinds.*.mime` (chỉ có ở `scopeMime`): mặc định FILE (md/json), trừ MIME đã thuộc kind khác. */
function baseKindOf(mime: string): AssetKind {
  return (Object.keys(LIMITS.upload.kinds) as AssetKind[]).find((k) => kindMimes(k).includes(mime)) ?? "FILE";
}

function kindMimes(kind: AssetKind): readonly string[] {
  return kindPolicy(kind).mime;
}

/** MIME bổ sung riêng của scope (`LIMITS.upload.scopeMime`, vd RESOURCE nhận thêm md/json) thuộc về `kind` này. */
function scopeExtraMimes(kind: AssetKind, scope: AssetScope): readonly string[] {
  const extra = (LIMITS.upload.scopeMime as Partial<Record<string, readonly string[]>>)[scope] ?? [];
  return extra.filter((m) => baseKindOf(m) === kind);
}

type ScopeRestrict = Partial<Record<AssetKind, { readonly maxBytes: number; readonly mime: readonly string[] }>>;

/** (p4-01) Scope siết chặt (`LIMITS.upload.scopeRestrict`, vd STUDY): chỉ kind/MIME liệt kê ở đó được nhận, kèm trần riêng. */
function restrictOf(scope: AssetScope): ScopeRestrict | undefined {
  return (LIMITS.upload.scopeRestrict as Partial<Record<string, ScopeRestrict>>)[scope];
}

/** Allowlist MIME của 1 kind trong 1 scope = `kinds[kind].mime` ⊕ MIME bổ sung theo scope (scope siết chặt: chỉ danh sách riêng). */
function mimesOf(kind: AssetKind, scope: AssetScope): readonly string[] {
  const restrict = restrictOf(scope);
  if (restrict) return restrict[kind]?.mime ?? [];
  return [...kindMimes(kind), ...scopeExtraMimes(kind, scope)];
}

/** `scope AVATAR` chỉ nhận `IMAGE`, và trần dung lượng bị siết thêm bởi `avatarMaxBytes` (be.md §5.1 bước 1); scope siết chặt có trần theo kind. */
function maxBytesFor(kind: AssetKind, scope: AssetScope): number {
  const base = kindPolicy(kind).maxBytes;
  const restricted = restrictOf(scope)?.[kind]?.maxBytes;
  if (restricted !== undefined) return Math.min(base, restricted);
  return scope === "AVATAR" ? Math.min(base, LIMITS.upload.avatarMaxBytes) : base;
}

export const mimePolicy = {
  kindPolicy,

  /** Union toàn bộ MIME hợp lệ (mọi kind + MIME bổ sung theo scope) — dùng cho preset `uploadSingle` (fallback API_PUT). */
  allAllowedMimes(): string[] {
    const base = Object.values(LIMITS.upload.kinds).flatMap((p) => [...p.mime]);
    const extra = Object.values(LIMITS.upload.scopeMime).flatMap((list) => [...list]);
    return Array.from(new Set<string>([...base, ...extra]));
  },

  /** Allowlist MIME của `kind` trong `scope` (gồm MIME bổ sung theo scope) — nguồn cho `asset-processor.ts`. */
  allowedMimes(kind: AssetKind, scope: AssetScope): readonly string[] {
    return mimesOf(kind, scope);
  },

  /** MIME thuần văn bản (không có magic bytes) — `asset-processor` kiểm nội dung bằng `text-sniff.ts`. */
  isTextMime(mime: string): boolean {
    return TEXT_MIMES.has(mime);
  },

  /** `file-type` nhận ra "văn bản có cấu trúc" (XML) — chấp nhận cho MIME văn bản, khác mọi chữ ký nhị phân khác. */
  isTextualDetectedMime(mime: string): boolean {
    return TEXTUAL_DETECTED_MIMES.has(mime);
  },

  /** Tra ngược kind từ 1 MIME thật (magic bytes) — dùng bởi `asset-processor.ts`. */
  kindForMime(mime: string): AssetKind | undefined {
    return (Object.keys(LIMITS.upload.kinds) as AssetKind[]).find((kind) => kindMimes(kind).includes(mime));
  },

  extFor(mime: string): string {
    return EXT_BY_MIME[mime] ?? "bin";
  },

  /**
   * Quy đổi MIME "lạ" mà `file-type` trả về (magic bytes) sang MIME chuẩn dùng trong `LIMITS.upload.kinds`.
   * `declaredMime` = MIME client khai báo — cần để phân giải `video/mp4` vs `audio/mp4` (cùng container MPEG-4, xem trên).
   */
  normalizeDetectedMime(mime: string, declaredMime?: string): string {
    if (declaredMime === MP4_AUDIO_DECLARED && mime === MP4_CONTAINER_DETECTED) return MP4_AUDIO_DECLARED;
    return DETECTED_MIME_ALIASES[mime] ?? mime;
  },

  /**
   * Xác thực kind ↔ mime ↔ scope ↔ size + trả `{ext, maxBytes}` — nguồn sự
   * thật DUY NHẤT dùng ở service (`AssetService.create`), ném đúng mã lỗi
   * (`ASSET_001` mime, `ASSET_002` size).
   */
  resolve(input: DeclaredAssetInput): { ext: string; maxBytes: number } {
    if (input.scope === "AVATAR" && input.kind !== "IMAGE") {
      throw new AppError("Ảnh đại diện chỉ nhận tệp ảnh (kind IMAGE)", 415, ErrorCode.ASSET_001);
    }
    if (!mimesOf(input.kind, input.scope).includes(input.mime)) {
      throw new AppError("Định dạng tệp không được hỗ trợ", 415, ErrorCode.ASSET_001);
    }
    const maxBytes = maxBytesFor(input.kind, input.scope);
    if (input.size > maxBytes) {
      throw new AppError("Tệp vượt quá dung lượng cho phép", 413, ErrorCode.ASSET_002, { max: maxBytes });
    }
    return { ext: this.extFor(input.mime), maxBytes };
  },

  /**
   * `superRefine` dùng trong `createAssetSchema` (be.md §3) — gate "fail
   * fast" ở tầng DTO (map ra `VAL_001` qua `validateBody`, KHÔNG có mã riêng
   * ASSET_001/002 vì `validateBody` luôn bọc `ZodError` thành `ValidationError`
   * chung). Mã lỗi CHÍNH XÁC (`ASSET_001`/`ASSET_002`) do `resolve()` ở
   * service đảm nhiệm — 2 lớp không thay thế nhau, đây chỉ là phòng vệ sớm.
   */
  validateDeclared(v: DeclaredAssetInput, ctx: z.RefinementCtx): void {
    if (v.scope === "AVATAR" && v.kind !== "IMAGE") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["kind"], message: "Ảnh đại diện chỉ nhận kind IMAGE" });
      return;
    }
    if (!mimesOf(v.kind, v.scope).includes(v.mime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mime"],
        message: `MIME "${v.mime}" không hợp lệ cho kind ${v.kind}`,
      });
      return;
    }
    const maxBytes = maxBytesFor(v.kind, v.scope);
    if (v.size > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["size"],
        message: `Tệp vượt quá ${maxBytes} byte cho phép`,
      });
    }
  },
};
