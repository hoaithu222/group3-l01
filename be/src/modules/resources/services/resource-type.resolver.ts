import { LIMITS } from "../../../core/constants";
import type { PreviewStatusValue, ResourceTypeValue } from "../entities/resource.interface";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Đuôi → tên ngôn ngữ tô màu (`prism-react-renderer` phía client). Chỉ đuôi thuộc `LIMITS.resource.codeExtensions`. */
const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  swift: "swift",
  sql: "sql",
  md: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "markup",
  sh: "bash",
  css: "css",
  scss: "scss",
};

export interface ResolvedResourceType {
  type: ResourceTypeValue;
  /** Chỉ `CODE`. */
  language: string | null;
  /** `NATIVE` = client xem thẳng file gốc; `NONE` = Office (chờ chuyển PDF ở P1); `UNSUPPORTED` = chỉ tải về. */
  previewStatus: PreviewStatusValue;
}

/** Đuôi tệp (chữ thường, ≤ 10 ký tự chữ-số) hoặc `null` — KHÔNG tin tuyệt đối, chỉ để gợi ý ngôn ngữ/hiển thị. */
export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : null;
}

function isCodeExtension(ext: string | null): ext is string {
  return ext !== null && (LIMITS.resource.codeExtensions as readonly string[]).includes(ext);
}

/**
 * `type` hiển thị suy ở SERVER từ MIME (đã được `asset-processor` kiểm chữ ký thật) + đuôi — client không tự đoán
 * (p3-01 README §2). `text/plain` + đuôi thuộc `codeExtensions` → CODE; còn lại → TEXT. CSV là SHEET nhưng xem thẳng
 * dạng văn bản (`NATIVE`); Office chưa có bản xem trước (`NONE`) cho tới khi P1 chuyển PDF.
 */
export function resolveResourceType(mime: string, extension: string | null): ResolvedResourceType {
  const code = (language: string | null): ResolvedResourceType => ({ type: "CODE", language, previewStatus: "NATIVE" });
  const native = (type: ResourceTypeValue): ResolvedResourceType => ({ type, language: null, previewStatus: "NATIVE" });
  const office = (type: ResourceTypeValue): ResolvedResourceType => ({ type, language: null, previewStatus: "NONE" });

  if (mime === "application/pdf") return native("PDF");
  if (mime.startsWith("image/")) return native("IMAGE");
  if (mime.startsWith("video/")) return native("VIDEO");
  if (mime.startsWith("audio/")) return native("AUDIO");
  if (mime === DOCX) return office("DOC");
  if (mime === PPTX) return office("SLIDE");
  if (mime === XLSX) return office("SHEET");
  if (mime === "text/csv") return native("SHEET");
  if (mime === "text/markdown") return code("markdown");
  if (mime === "application/json") return code("json");
  if (mime === "text/plain") {
    return isCodeExtension(extension) ? code(LANGUAGE_BY_EXTENSION[extension] ?? null) : native("TEXT");
  }
  return { type: "OTHER", language: null, previewStatus: "UNSUPPORTED" };
}

/** Loại Office có thể chuyển PDF ở P1 — trả `details.convertible` cho `RSC_005`. */
export function isConvertible(type: ResourceTypeValue): boolean {
  return type === "DOC" || type === "SHEET" || type === "SLIDE";
}
