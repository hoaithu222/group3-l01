import { readFileSync } from "fs";
import path from "path";
import { TtfFont } from "./ttf-font";

/**
 * Font nhúng vào PDF: Plus Jakarta Sans (cùng họ font của app, giấy phép OFL) có đủ glyph tiếng Việt. Tệp nằm ở `be/assets/fonts/` (image Docker
 * `COPY assets ./assets`) — đường dẫn tính từ vị trí file nên đúng cả ở `src/` (test) lẫn `dist/` (chạy thật), cùng độ sâu thư mục.
 */
export const FONT_DIR = path.resolve(__dirname, "../../../../../assets/fonts");

let cache: { regular: TtfFont; semiBold: TtfFont } | null = null;

export function loadReportFonts(): { regular: TtfFont; semiBold: TtfFont } {
  if (!cache) {
    cache = {
      regular: TtfFont.fromBuffer(readFileSync(path.join(FONT_DIR, "PlusJakartaSans-Regular.ttf"))),
      semiBold: TtfFont.fromBuffer(readFileSync(path.join(FONT_DIR, "PlusJakartaSans-SemiBold.ttf"))),
    };
  }
  return cache;
}
