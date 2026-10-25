/**
 * Component công khai nào cũng phải xuất kiểu `XxxProps` đi kèm.
 *
 * ── Vì sao là bài kiểm chứ không phải dòng nhắc trong tài liệu ───────────────
 * `kit2-architecture.md §1` đã yêu cầu điều này, nhưng khi rà thì 57/120
 * interface đang thiếu `export` — và thiếu KHÔNG đều: cùng thư mục `actions/`,
 * `ContextMenuProps` có xuất còn `ButtonProps` thì không. Kiểu quên rải rác như
 * vậy không ai phát hiện bằng mắt.
 *
 * Hậu quả rất cụ thể: không viết nổi
 *
 *     function SubmitButton(props: ButtonProps) { … }
 *
 * hay bọc lại `TextField` mà vẫn giữ kiểu — tức chặn đúng việc mà người dùng
 * một bộ kit làm hằng ngày.
 *
 * Bài kiểm đọc chính các file barrel: component nào được barrel xuất ra thì
 * `XxxProps` cũng phải có mặt ở đó. Helper nội bộ (`picker-trigger`,
 * `table-parts`, `calendar-panel`…) cố ý không đi qua barrel nên tự động nằm
 * ngoài phạm vi — đúng như §8 quy định.
 */

import { describe, expect, it } from 'vitest';

/** Nội dung mọi file barrel của kit2. */
const BARRELS = import.meta.glob('../../src/shared/ui/**/index.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Tên component mà một barrel xuất ra (`export { default as X } from './X'`). */
function componentsOf(src: string): string[] {
  return [...src.matchAll(/export \{ default as (\w+) \} from '\.\/[\w.-]+'/g)].map((m) => m[1]);
}

/** Mọi tên kiểu mà một barrel xuất ra. */
function typesOf(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/export type \{([^}]+)\} from '[^']+';/g)) {
    for (const raw of m[1].split(',')) {
      const nm = raw.trim();
      if (nm) out.add(nm);
    }
  }
  return out;
}

/**
 * Ba component cố ý KHÔNG có `XxxProps` riêng vì chúng nhận trọn hợp đồng của
 * Radix (`React.ComponentProps<typeof Primitive>`) — bịa ra một interface rỗng
 * chỉ để thoả bài kiểm thì tệ hơn là không có.
 */
const NO_OWN_PROPS = new Set([
  'ToastProvider',
  'ToastViewport',
  'RadioGroup',
  // `AppShell` KHÔNG nhận prop nào — nó chỉ dựng khung nền quanh `<Outlet/>`.
  // Bịa ra một interface rỗng chỉ để thoả bài kiểm là làm xấu API đi.
  'AppShell',
]);

describe('kit2 — kiểu Props đi cùng component', () => {
  it('mọi component đi qua barrel đều xuất kèm XxxProps', () => {
    const missing: string[] = [];

    for (const [path, src] of Object.entries(BARRELS)) {
      const types = typesOf(src);
      for (const name of componentsOf(src)) {
        if (NO_OWN_PROPS.has(name)) continue;
        if (!types.has(name + 'Props')) {
          missing.push(`${path.replace('../../', '')} — thiếu ${name}Props`);
        }
      }
    }

    expect(missing, `Chưa xuất kiểu Props:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});
