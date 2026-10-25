import type { TextExtractionInput, TextExtractionResult, TextExtractor } from "./extractor.types";
import { capText, decodeTextBuffer } from "./plain.extractor";

/**
 * Bỏ chú thích HTML `<!-- … -->` bằng `indexOf` (tuyến tính) thay vì regex `<!--[\s\S]*?-->`: tệp cố ý chứa hàng trăm nghìn
 * `<!--` không đóng làm regex quét đến hết tệp ở MỖI lần khớp (O(n²)) — đủ treo worker. Chú thích không đóng được giữ nguyên.
 */
function stripHtmlComments(md: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const open = md.indexOf("<!--", from);
    const close = open < 0 ? -1 : md.indexOf("-->", open + 4);
    if (close < 0) return out + md.slice(from);
    out += `${md.slice(from, open)} `;
    from = close + 3;
  }
}

/**
 * Bỏ cú pháp Markdown, chỉ giữ chữ người viết (README §2: "TXT/MD (UTF-8, bỏ cú pháp Markdown)"). Điều quan trọng là bỏ
 * PHẦN ĐỊA CHỈ của link/ảnh, thẻ HTML và chú thích — nếu để lại, URL biến thành "từ" và hai bài có chung liên kết bị tính
 * là trùng chữ. Dấu nhấn mạnh/đầu dòng thì tokenizer vốn đã coi là dấu câu nên bỏ chỉ để văn bản hiển thị (đoạn đối chiếu)
 * sạch. Nội dung khối mã được GIỮ (chỉ bỏ hàng rào ```) vì mã dán vào báo cáo vẫn là nội dung cần so.
 *
 * Offset về sau (tô sáng, số dòng) tính trên CHUỖI ĐÃ BỎ CÚ PHÁP này — đây cũng là văn bản lưu ở tệp dẫn xuất.
 *
 * Đầu vào là tệp NGƯỜI DÙNG tải lên nên mọi regex phải tuyến tính: khoảng trắng viết `[ \t]` (không `\s`, để một luật không
 * ăn qua nhiều dòng), không đặt hai lượng từ kề nhau cùng khớp khoảng trắng, và phần trong ngoặc/thẻ có TRẦN ĐỘ DÀI
 * (300 ký tự chữ/thẻ, 1000 ký tự địa chỉ) — không thì một dòng 1 triệu ký tự toàn `![` hay `<a` làm mỗi lần khớp quét hết dòng
 * (O(n²)). Link/thẻ dài hơn trần chỉ bị để nguyên, không ảnh hưởng độ đúng của so khớp.
 */
export function stripMarkdown(md: string): string {
  return stripHtmlComments(md)
    .replace(/^ {0,3}(?:`{3,}|~{3,}).*$/gm, "")
    .replace(/^ {0,3}\[[^\]\n]{1,300}\]:[ \t]*\S.*$/gm, "")
    .replace(/!\[([^\]\n]{0,300})\]\([^)\n]{0,1000}\)/g, "$1")
    .replace(/\[([^\]\n]{0,300})\]\([^)\n]{0,1000}\)/g, "$1")
    .replace(/<\/?[A-Za-z][^>\n]{0,300}>/g, " ")
    .replace(/^[ \t]*(?:\|[ \t]*)?:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, "")
    .replace(/^ {0,3}(?:[-*_][ \t]*){3,}$/gm, "")
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^ {0,3}>+ ?/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\*(?=\S)([^*\n]+?)(?<=\S)\*/g, "$1")
    .replace(/(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/g, "$1");
}

export function extractMarkdownText(input: TextExtractionInput): TextExtractionResult {
  const { text, truncated } = capText(stripMarkdown(decodeTextBuffer(input.buffer)), input.charsMax);
  return text.trim() === "" ? { ok: false, reason: "NO_TEXT" } : { ok: true, text, truncated };
}

export const markdownExtractor: TextExtractor = {
  id: "markdown",
  extract: (input) => Promise.resolve(extractMarkdownText(input)),
};
