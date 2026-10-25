import type { CodeLanguage } from "../types";
import { docxExtractor } from "./docx.extractor";
import type { TextExtractor, TextExtractorId } from "./extractor.types";
import { markdownExtractor } from "./markdown.extractor";
import { pdfExtractor } from "./pdf.extractor";
import { plainExtractor } from "./plain.extractor";

/**
 * Phân loại tệp theo đuôi (README §7): văn bản `.pdf .docx .txt .md`; mã nguồn `.js .jsx .ts .tsx .java .kt .swift .c .h
 * .cpp .cs .go .php .rb .py .sql .html .css`; mọi đuôi khác (`.doc`, `.pptx`, `.xlsx`, không đuôi…) → không hỗ trợ
 * (`UNSUPPORTED`). Dùng `Map` để đuôi như "constructor"/"__proto__" không trúng thuộc tính của Object.
 *
 * Ruby (`.rb`) xếp vào họ "python" vì chung chú thích `#` và chuỗi nháy; PHP xếp họ "c-like" (chú thích dòng `//` và chú thích khối kiểu C).
 * Đây mới là phần THUẦN của registry (đuôi → loại/họ/trình trích); phần ánh xạ `TextExtractorId` → cài đặt PDF/DOCX
 * nằm ở bước sau. Tệp mã luôn đọc bằng trình trích "plain".
 */
export type FileClassification =
  | { supported: true; kind: "TEXT"; extractor: TextExtractorId; language: null }
  | { supported: true; kind: "CODE"; extractor: "plain"; language: CodeLanguage }
  | { supported: false };

const TEXT_EXTENSIONS = new Map<string, TextExtractorId>([
  ["pdf", "pdf"],
  ["docx", "docx"],
  ["txt", "plain"],
  ["md", "markdown"],
]);

const CODE_EXTENSIONS = new Map<string, CodeLanguage>([
  ...(["js", "jsx", "ts", "tsx", "java", "kt", "swift", "c", "h", "cpp", "cs", "go", "php"] as const).map(
    (ext): [string, CodeLanguage] => [ext, "c-like"],
  ),
  ...(["py", "rb"] as const).map((ext): [string, CodeLanguage] => [ext, "python"]),
  ["sql", "sql"],
  ["html", "markup"],
  ["css", "markup"],
]);

/** Phân loại theo đuôi đứng riêng ("pdf", ".PDF" đều được — chữ hoa và dấu chấm đầu bị bỏ). */
export function classifyExtension(extension: string): FileClassification {
  const ext = extension.trim().replace(/^\./, "").toLowerCase();
  const extractor = TEXT_EXTENSIONS.get(ext);
  if (extractor) return { supported: true, kind: "TEXT", extractor, language: null };
  const language = CODE_EXTENSIONS.get(ext);
  if (language) return { supported: true, kind: "CODE", extractor: "plain", language };
  return { supported: false };
}

/** Phân loại theo tên tệp: lấy đuôi sau dấu chấm CUỐI; không có dấu chấm (hoặc chỉ ".gitignore"-kiểu) → không hỗ trợ. */
export function classifyFileName(fileName: string): FileClassification {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? classifyExtension(fileName.slice(dot + 1)) : { supported: false };
}

/** Ánh xạ `TextExtractorId` → cài đặt thật (be.md §1: "phần ánh xạ … cài đặt PDF/DOCX nằm ở bước sau"). */
const EXTRACTORS: Record<TextExtractorId, TextExtractor> = {
  pdf: pdfExtractor,
  docx: docxExtractor,
  plain: plainExtractor,
  markdown: markdownExtractor,
};

export function getTextExtractor(id: TextExtractorId): TextExtractor {
  return EXTRACTORS[id];
}
