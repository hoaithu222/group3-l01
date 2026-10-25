/**
 * Loại tài nguyên cộng tác mà service phục vụ. MỘT service dùng cho nhiều loại (p6-01 tài liệu, p6-02 bảng trắng):
 * thêm loại mới = thêm một dòng vào `KIND_SPECS` + bật trong `COLLAB_KINDS` — không sửa logic xác thực/lưu.
 *
 * Tên document (Hocuspocus `documentName`) = `<prefix>:<resourceId>` (`doc:` cho tài liệu, `wb:` cho bảng trắng).
 */
export const ALL_KINDS = ["document", "whiteboard"] as const;
export type ResourceKind = (typeof ALL_KINDS)[number];

export interface KindSpec {
  kind: ResourceKind;
  /** Tiền tố tên document. */
  prefix: string;
  /** Đoạn path ở BE: `/api/internal/<bePath>/:id/(access|state)`. */
  bePath: string;
  /** Trần dung lượng state (byte) — BE cũng kiểm; collab dùng để báo sớm `TOO_LARGE` và không gửi PUT chắc chắn bị từ chối. */
  stateMaxBytes: number;
  /** Khoá được phép có trong awareness state của client (ngoài các khoá này → đóng kết nối). */
  awarenessKeys: readonly string[];
}

const MiB = 1024 * 1024;

export const KIND_SPECS: Record<ResourceKind, KindSpec> = {
  document: { kind: "document", prefix: "doc", bePath: "documents", stateMaxBytes: 5 * MiB, awarenessKeys: ["user", "cursor"] },
  whiteboard: {
    kind: "whiteboard",
    prefix: "wb",
    bePath: "whiteboards",
    stateMaxBytes: 9 * MiB,
    awarenessKeys: ["user", "pointer", "selection", "viewport"],
  },
};

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_RE.test(value);
}

export interface ParsedDocumentName {
  kind: ResourceKind;
  id: string;
  spec: KindSpec;
}

/** `doc:<24 hex>` / `wb:<24 hex>` → loại + id; sai dạng → `null`. */
export function parseDocumentName(name: string): ParsedDocumentName | null {
  const sep = name.indexOf(":");
  if (sep <= 0) return null;
  const prefix = name.slice(0, sep);
  const id = name.slice(sep + 1);
  if (!isObjectId(id)) return null;
  const spec = ALL_KINDS.map((k) => KIND_SPECS[k]).find((s) => s.prefix === prefix);
  return spec ? { kind: spec.kind, id: id.toLowerCase(), spec } : null;
}

export function buildDocumentName(kind: ResourceKind, id: string): string {
  return `${KIND_SPECS[kind].prefix}:${id.toLowerCase()}`;
}

export function isResourceKind(value: unknown): value is ResourceKind {
  return typeof value === "string" && (ALL_KINDS as readonly string[]).includes(value);
}
