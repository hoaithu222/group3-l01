/**
 * Định dạng khối nội dung buổi học (be.md §5.1) — dựng từ `bodyMd` bằng `marked` lexer (services/content/md-to-blocks.ts),
 * lưu ở `RoadmapLesson.blocks`. App chỉ đọc trường này để render native — KHÔNG parse markdown ở client.
 */

export type SpanType = "text" | "bold" | "italic" | "strike" | "code" | "link";

export interface Span {
  t: SpanType;
  v: string;
  /** Chỉ có ở t = "link" — luôn http(s) (link khác giao thức đã bị hạ thành text ở lúc dựng). */
  href?: string;
}

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { type: "heading"; level: 2 | 3 | 4; spans: Span[]; anchor: string }
  | { type: "paragraph"; spans: Span[] }
  | { type: "list"; ordered: boolean; start?: number; items: Block[][] }
  | { type: "checklist"; items: { id: string; spans: Span[]; checked: boolean }[] }
  | { type: "code"; lang: string | null; code: string }
  | { type: "table"; align: Align[]; header: Span[][]; rows: Span[][][] }
  | { type: "quote"; blocks: Block[] }
  | { type: "details"; summary: Span[]; blocks: Block[] }
  /** `mediaId` = null khi chưa khớp được `RoadmapMedia.sourcePath` lúc dựng (build-lesson-content.ts) — app bỏ qua, báo cáo import liệt kê cảnh báo. */
  | { type: "image"; mediaId: string | null; alt: string }
  | { type: "divider" };

/**
 * Phiên bản CÁCH DỰNG `blocks` (không phải hình dạng kiểu — kiểu ở trên không đổi):
 *  · 1 — bản đầu: chữ còn thực thể HTML của `marked` (`&lt;img&gt;`, `&amp;`), link ảnh mockup trong trích dẫn/mục danh
 *        sách hạ thành CHỮ đường dẫn ("code/x.svg — mở trong trình duyệt để xem…"), mục danh sách "lỏng" in markdown thô.
 *  · 2 — giải mã thực thể; link tới ảnh của buổi thành khối `image` ngay tại chỗ (`media-refs.ts`); mục danh sách dựng
 *        đủ khối con.
 * Buổi lưu ở bản cũ được dựng lại từ `bodyMd` lúc ĐỌC (`upgrade-blocks.ts`) — không cần chạy lại import mới hiện đúng.
 */
export const BLOCKS_FORMAT_VERSION = 2;
