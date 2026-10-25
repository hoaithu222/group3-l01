/**
 * Chữ trong `src/` phải đi qua thang token, KHÔNG dùng utility thô của Tailwind.
 *
 * ── Vì sao đây là lỗi CHỨC NĂNG, không phải chuyện thẩm mỹ ───────────────────
 * Chế độ TV (`docs/rules/tv-display-mode.md`) phóng chữ bằng cách nhân
 * `--ui-scale` vào RIÊNG các token do `generate-font.mjs` sinh ra. Đối chiếu
 * CSS đã build:
 *
 *   .text-body-14 { font-size: calc(var(--fs-body-14) * var(--ui-scale,1)) }
 *   .text-sm      { font-size: var(--text-sm) }        ← KHÔNG có --ui-scale
 *
 * Nên một `text-sm` lọt vào giữa đám token sẽ ĐỨNG YÊN ở 14px trong khi mọi thứ
 * quanh nó nở ra 15.4–18.2px. Trước khi có bài kiểm này, 48 chỗ như vậy nằm rải
 * trong kit2 — gồm `Button`, `Menu`, `Table`, `Dropdown` và toàn bộ picker, tức
 * đúng những component có mặt trên mọi màn hình.
 *
 * Ba utility hay bị dùng nhất trùng KHÍT với token có sẵn nên thay là xong,
 * không phải cân lại thiết kế:
 *   text-sm (14/20) ≡ text-body-14 · text-xs (12/16) ≡ text-caption-12
 *   text-base (16/24) ≡ text-body-16
 *
 * Đọc file bằng `import.meta.glob` chứ không `fs`: `tsconfig.app` cố ý không nạp
 * type của Node (xem `tests/file-size.test.ts`).
 */

import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const GENERATED = /\.generated\.|\/assets\/(icons|image)\/index\./;

/** `text-sm`, `text-xl`, `text-2xl`… — thang mặc định của Tailwind. */
const RAW_FONT_SIZE = /\btext-(xs|sm|base|lg|[2-9]?xl)\b/;

/** Bất kỳ token cỡ chữ nào của hệ: `text-body-14`, `text-caption-10-bold`, `text-h3`… */
const TOKEN_SIZE = /\btext-(h[1-4]|body|caption)[a-z0-9-]*\b/;

/**
 * `font-normal` / `font-medium` — HAI bậc duy nhất thật sự lệch.
 *
 * `:root.tv` nâng `--fw-regular` 450→500 và `--fw-medium` 500→600, nhưng KHÔNG
 * đụng semibold/bold. Mà utility weight của Tailwind lại đứng SAU token trong
 * stylesheet nên nó thắng, khoá cứng nét ở bậc thường — token có `-medium` cũng
 * thành vô nghĩa. Ngược lại `font-semibold`/`font-bold` cho ra ĐÚNG giá trị của
 * token ở cả hai chế độ, nên cấm chúng chỉ tạo việc chứ không sửa được lỗi nào.
 */
const RAW_WEIGHT_LOW = /\bfont-(normal|medium)\b/;

/**
 * Dòng cố ý TRÍCH DẪN một class bị cấm để DẠY (trang thư viện giao diện in ra
 * "đừng viết thế này"), chứ không phải chỗ dùng thật.
 *
 * Vì sao cần cờ riêng thay vì dựa vào việc bỏ chú thích: chuỗi dạy nằm trong
 * VĂN BẢN JSX, không phải chú thích, nên `stripComments` không chạm tới nó.
 * Thiếu lối thoát này thì một trang thư viện giao diện KHÔNG THỂ gọi tên thứ
 * mà chính nó đang cấm.
 *
 * Đặt cờ ở CÙNG DÒNG với chuỗi. Grep `font-guard-quote` để soát lại toàn bộ —
 * mỗi lần xuất hiện phải là một trích dẫn thật, không phải chỗ né luật.
 */
const QUOTED_ON_PURPOSE = /font-guard-quote/;
/**
 * Bỏ chú thích trước khi soi — nếu không, chính dòng văn bản dạy "KHÔNG dùng
 * `text-2xl`" trong `HomePage.tsx` sẽ bị bắt là vi phạm.
 *
 * Thay ký tự bằng dấu cách chứ KHÔNG xoá hẳn: xoá cả ký tự xuống dòng của một
 * chú thích khối làm lệch số dòng của mọi dòng phía sau, và báo lỗi chỉ sai chỗ.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const short = (p: string) => p.replace('../', '');

/** Duyệt từng dòng mã thật (đã bỏ chú thích) của mọi file nguồn. */
function scan(check: (line: string) => boolean): string[] {
  const hits: string[] = [];
  for (const [path, text] of Object.entries(SOURCES)) {
    if (GENERATED.test(path)) continue;
    const rawLines = text.split('\n');
    stripComments(text)
      .split('\n')
      .forEach((line, i) => {
        if (QUOTED_ON_PURPOSE.test(rawLines[i] ?? '')) return;
        if (check(line)) hits.push(`${short(path)}:${i + 1} — ${line.trim().slice(0, 100)}`);
      });
  }
  return hits;
}

describe('thang chữ', () => {
  it('không dùng cỡ chữ thô của Tailwind — chúng KHÔNG nhân --ui-scale ở chế độ TV', () => {
    const hits = scan((l) => RAW_FONT_SIZE.test(l));
    expect(hits, `Thay bằng token text-{scale}-{weight}:\n  ${hits.join('\n  ')}`).toEqual([]);
  });

  it('không đặt font-normal/font-medium cạnh token cỡ chữ — utility sẽ đè nét của token', () => {
    // Chỉ soi khi CÓ token cỡ chữ đi kèm: một `font-medium` đứng một mình (nhãn
    // `SegmentToggle` biến thể `subtle` kế thừa cỡ chữ từ cha) không có token
    // nào để gắn hậu tố vào — đó là cách diễn đạt đúng duy nhất.
    const hits = scan((l) => TOKEN_SIZE.test(l) && RAW_WEIGHT_LOW.test(l));
    expect(hits, `Chuyển nét vào hậu tố của token:\n  ${hits.join('\n  ')}`).toEqual([]);
  });
});
