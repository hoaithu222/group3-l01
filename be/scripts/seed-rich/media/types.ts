import type { PersonKey } from "../types";

/** Bảng màu cho ảnh poster/bìa. */
export type Theme = "violet" | "amber" | "ocean" | "forest" | "sunset" | "rose" | "slate";

/** Ảnh "poster" dựng bằng SVG→PNG: tiêu đề + lưới thẻ (mỗi thẻ có đầu đề và vài dòng) — dùng cho cheat sheet, ERD, lộ trình, sơ đồ. */
export interface PosterSpec {
  title: string;
  subtitle?: string;
  /** 2–8 thẻ; mỗi thẻ ≤ 6 dòng ngắn (≤ 48 ký tự/dòng). */
  sections: Array<{ head: string; lines: string[] }>;
  theme: Theme;
}

export type ResourceFileSpec = {
  /** Tên thư mục (phải khai trong `folders`); bỏ trống = gốc kho. */
  folder?: string;
  by: PersonKey;
  description: string;
  tags: string[];
} & (
  | { kind: "text"; /** có đuôi: .md .txt .csv .json */ name: string; body: string }
  | { kind: "code"; /** có đuôi: .js .ts .py .sql .css .java .sh ... */ name: string; body: string }
  | { kind: "slides"; /** .pdf */ name: string; theme: Theme; slides: Array<{ title: string; bullets: string[] }> }
  | { kind: "doc"; /** .docx */ name: string; title: string; sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }> }
  | { kind: "sheet"; /** .xlsx */ name: string; sheetName: string; rows: string[][] }
  | { kind: "poster"; /** .png */ name: string; poster: PosterSpec }
);

export interface WorkspaceResources {
  folders: Array<{ name: string; parent?: string }>;
  files: ResourceFileSpec[];
}

/** Ảnh gửi kèm một tin nhắn mới trong kênh (đăng sau các tin đã seed). */
export interface ChatImageSpec {
  /** Khoá nhóm làm việc (`WorkspaceSpec.key`). */
  ws: string;
  /** Tên kênh TEXT đã có trong nhóm. */
  channel: string;
  by: PersonKey;
  text: string;
  poster: PosterSpec;
}
