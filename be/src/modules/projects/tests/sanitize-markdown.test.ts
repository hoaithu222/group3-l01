import type { NextFunction, Request, Response } from "express";
import { sanitizeInput } from "../../../core/middlewares/sanitize";

/**
 * `description` (mô tả thẻ) và `content` (bình luận) đã nằm trong `RICH_TEXT_FIELDS` (foundation D-28). Bài kiểm này chốt điều
 * p3-03 be.md §5 yêu cầu ("kiểm không phá markdown code") bằng HÀNH VI THẬT của sanitizer, và ghi lại điểm lệch:
 * markdown giữ nguyên, marker mention nguyên vẹn, XSS bị vô hiệu — NHƯNG `<`, `>`, `&` trong CHỮ THƯỜNG/code bị đổi thành
 * thực thể HTML (`&lt;` `&gt;` `&amp;`) ở lúc lưu; app hiện không giải mã lại (xem "Điểm lệch" ở be.md p3-03).
 */
function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const req = { body } as unknown as Request;
  sanitizeInput(req, {} as Response, (() => undefined) as NextFunction);
  return req.body as Record<string, unknown>;
}

describe("sanitizeInput — markdown của mô tả thẻ / bình luận", () => {
  it("giữ nguyên cấu trúc markdown (tiêu đề, rào code, danh sách, nhấn mạnh, liên kết) và marker mention @{u:<id>}", () => {
    const md = "# Việc cần làm\n```ts\nconst total = items.length;\n```\n- [ ] gọi @{u:6a6a6a6a6a6a6a6a6a6a6a6a}\n**quan trọng** `code` [liên kết](https://example.com)";
    const out = sanitize({ description: md, content: md });
    expect(out.description).toBe(md);
    expect(out.content).toBe(md);
  });

  it("ĐIỂM LỆCH ĐÃ BIẾT: `<`, `>`, `&` trong code/chữ thường bị escape thành thực thể HTML khi lưu (client phải giải mã khi hiển thị)", () => {
    const out = sanitize({ description: "```ts\nif (a < b && c > d) {}\n```\n> trích dẫn" });
    // Kể cả `>` đầu dòng của khối trích dẫn markdown.
    expect(out.description).toBe("```ts\nif (a &lt; b &amp;&amp; c &gt; d) {}\n```\n&gt; trích dẫn");
  });

  it("vô hiệu XSS: thẻ script, thuộc tính sự kiện và javascript: bị loại khỏi mô tả/bình luận", () => {
    const out = sanitize({
      description: "an toàn <script>alert(1)</script> <img src=x onerror=alert(2)> hết",
      content: 'chào <a href="javascript:alert(3)" onclick="x()">bấm</a>',
    });
    for (const value of [out.description, out.content] as string[]) {
      expect(value).not.toMatch(/<script/i);
      expect(value).not.toMatch(/onerror|onclick/i);
      expect(value).not.toMatch(/javascript:/i);
    }
    expect(out.description).toContain("an toàn");
  });

  it("tiêu đề thẻ (trường thường) bị strip HTML; `text` (checklist) là RAW_FIELDS nên middleware KHÔNG đụng → DTO tự stripHtml", () => {
    expect(sanitize({ title: "Tên <b>đậm</b><script>x</script>" }).title).toBe("Tên đậm");
    expect(sanitize({ text: "Việc <i>nhỏ</i>" }).text).toBe("Việc <i>nhỏ</i>");
  });
});
