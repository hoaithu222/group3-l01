/**
 * Giới hạn độ dài file — `docs/rules/clean-code-standards.md §3`.
 *
 * Rule cho `src/shared/ui/**` (primitive của design system) vượt 200 dòng, vì
 * một primitive như `Table` gói trọn đổi bề rộng cột, đóng băng cột, kéo-thả và
 * phân trang trong MỘT hợp đồng API — xé ra chỉ bắt người đọc nhảy file.
 *
 * Ngoại lệ đó KHÔNG lan sang `app/`, `core/`, `features/`. Ba nơi này hiện đang
 * sạch, và bài kiểm này giữ cho chúng sạch: một rule chỉ nằm trong tài liệu là
 * một rule sẽ bị quên.
 *
 * Đọc file bằng `import.meta.glob` của Vite chứ KHÔNG dùng `fs`: `tsconfig.app`
 * cố ý không nạp type của Node (để code ứng dụng không với tới API máy chủ),
 * nên `import('fs')` sẽ đỏ ngay ở bước typecheck.
 */

import { describe, expect, it } from 'vitest';

/** Nạp sẵn nội dung mọi file nguồn dưới dạng chuỗi. */
const SOURCES = import.meta.glob('../src/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Vùng áp giới hạn cứng. `shared/ui` cố ý KHÔNG có trong danh sách. */
const STRICT_DIRS = ['../src/app/', '../src/core/', '../src/features/'];

const LIMITS: Record<string, number> = { tsx: 200, ts: 250 };

/** File sinh tự động — không sửa tay nên không tính. */
const GENERATED = /\.generated\.|\/assets\/(icons|image)\/index\./;

/**
 * Đếm dòng THẬT — khớp với `wc -l` và với con số ghi trong tài liệu.
 *
 * ⛔ KHÔNG dùng thẳng `text.split('\n').length`. Mọi file trong repo đều kết
 * thúc bằng ký tự xuống dòng (prettier ép), nên phép tách sinh thêm một phần tử
 * rỗng ở cuối và mọi file bị đếm DƯ ĐÚNG 1 dòng. Hệ quả: `clean-code-standards.md §3`
 * ghi giới hạn 200 nhưng cổng thật lại chặn ở 199 — người viết sửa file xuống
 * đúng 200 dòng, `wc -l` xác nhận 200, mà bài kiểm vẫn đỏ và không hiểu vì sao.
 */
const lineCount = (text: string) => {
  const normalized = text.endsWith('\n') ? text.slice(0, -1) : text;
  return normalized === '' ? 0 : normalized.split('\n').length;
};
const extOf = (p: string) => (p.endsWith('.tsx') ? 'tsx' : 'ts');
const short = (p: string) => p.replace('../', '');

describe('giới hạn độ dài file', () => {
  it('app/ · core/ · features/ không file nào vượt giới hạn', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => STRICT_DIRS.some((d) => path.startsWith(d)) && !GENERATED.test(path))
      .map(([path, text]) => [path, lineCount(text), LIMITS[extOf(path)]] as const)
      .filter(([, lines, limit]) => lines > limit)
      .map(([path, lines, limit]) => `${short(path)} — ${lines}/${limit}`);

    expect(offenders, `Vượt giới hạn:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('kit2 dùng ngoại lệ có kiểm soát, không phải vô hạn', () => {
    // Chặn trên mềm: file kit2 nào vượt mốc này thì gần như chắc chắn đang ôm
    // nhiều hơn một component — lúc đó luật §1 (1 file = 1 component) mới là
    // thứ bị vi phạm, chứ không phải luật độ dài.
    const CEILING = 1000;
    const over = Object.entries(SOURCES)
      .filter(([path]) => path.startsWith('../src/shared/ui/') && !GENERATED.test(path))
      .map(([path, text]) => [path, lineCount(text)] as const)
      .filter(([, lines]) => lines > CEILING)
      .map(([path, lines]) => `${short(path)} — ${lines}`);

    expect(over, `Vượt trần mềm ${CEILING} dòng:\n  ${over.join('\n  ')}`).toEqual([]);
  });
});
