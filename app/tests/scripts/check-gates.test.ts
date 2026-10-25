import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Test cho ba CỔNG KIỂM tĩnh: `check-contrast.mjs`, `check-touch-targets.mjs`
 * và `check-file-size.mjs`.
 *
 * ── Vì sao test một script, không phải test component ────────────────────────
 * Ba script này tồn tại chính vì test runtime KHÔNG làm được việc của chúng:
 * NativeWind không biên dịch class trong Jest nên `style` luôn rỗng (xem
 * `docs/rules/testing.md`). Nhưng bản thân script thì lại rất dễ hỏng ÂM THẦM
 * theo đúng cái kiểu nó sinh ra để chặn: sửa một regex, sửa cách gom phạm vi,
 * và nó lặng lẽ ngừng tìm thấy gì — vẫn in "✅", vẫn thoát 0, cổng kiểm vẫn
 * xanh, chỉ là không còn bảo vệ ai nữa.
 *
 * Nên ở đây cho script chạy trên một cây nguồn GIẢ có lỗi cố ý, rồi đòi nó phải
 * đỏ. Cây giả nằm ở thư mục tạm của hệ điều hành ⛔ chứ không nằm trong repo:
 * `tsconfig.json` gom mọi file `.ts`/`.tsx` nên một file mồi đặt trong `tests/`
 * sẽ bị `tsc` và ESLint soi, còn file mồi trong `src/` thì lọt luôn vào chính
 * ba cổng kiểm này.
 */
const ROOT = path.join(__dirname, '..', '..');

/**
 * Dựng một thư mục nguồn giả, chạy script lên nó, dọn sạch.
 *
 * `files` và `env` nhận được đường dẫn thư mục tạm vì có trình soát cần biết nó:
 * manifest của `check-file-size.mjs` khoá nợ theo ĐƯỜNG DẪN, nên file mồi phải
 * tự khai đường dẫn của chính mình.
 */
function runOn(
  script: string,
  files: Record<string, string> | ((dir: string) => Record<string, string>),
  env?: (dir: string) => Record<string, string>,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-android-gate-'));
  try {
    for (const [name, content] of Object.entries(
      typeof files === 'function' ? files(dir) : files,
    )) {
      const target = path.join(dir, name);
      // Tên có thư mục (`features/a/x.ts`) — cần cho trình soát ranh giới feature.
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }

    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), dir], {
      encoding: 'utf8',
      env: { ...process.env, ...env?.(dir) },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Ghi một manifest giả có đúng một mục `mutedText.allow` cho `name` trong `dir`, trả đường dẫn.
 * Khoá theo ĐƯỜNG DẪN TỪ GỐC REPO — đúng phép tính script làm — nên file mồi tự khai đường dẫn của mình.
 */
function writeMutedManifest(dir: string, name: string, max: number, withWhy = true): string {
  const file = path.relative(ROOT, path.join(dir, name)).replaceAll('\\', '/');
  const target = path.join(dir, 'manifest.json');
  fs.writeFileSync(
    target,
    JSON.stringify({
      mutedText: { allow: [{ file, max, ...(withWhy ? { why: 'nợ cũ, cần đổi fg-2' } : {}) }] },
    }),
    'utf8',
  );
  return target;
}

describe('check-contrast.mjs', () => {
  it('đỏ khi chữ mờ đặt lên nền sáng — cặp cùng MỘT chuỗi class', () => {
    const { status, output } = runOn('check-contrast.mjs', {
      'Bad.tsx': 'export const A = () => <View className="bg-bg-1 text-fg-4">x</View>;\n',
    });

    expect(status).toBe(1);
    // 1.73:1 là đúng con số đo tay đang nằm trong `Divider.tsx` — nếu công thức
    // WCAG ở script bị sửa hỏng thì số này lệch ngay.
    expect(output).toContain('bg-bg-1 + text-fg-4');
    expect(output).toContain('1.73:1');
  });

  it('đỏ khi nền và màu chữ nằm ở hai slot của CÙNG một object tv()', () => {
    const { status, output } = runOn('check-contrast.mjs', {
      'Bad.tsx': "const s = { root: 'bg-bg-1', label: 'text-fg-4' };\nexport default s;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain('bg-bg-1 + text-fg-4');
  });

  it('⛔ KHÔNG ghép nền của biến thể này với màu chữ của biến thể kia', () => {
    const { status } = runOn('check-contrast.mjs', {
      'Ok.tsx':
        'const s = {\n' +
        "  selected: { root: 'bg-bg-1', label: 'text-fg-1' },\n" +
        // ⚠️ Màu chữ "hỏng nếu ghép" là `text-warning` (4.06:1 trên `bg-bg-1`), KHÔNG còn là `text-fg-4`: từ khi
        // có phần CHỮ MỜ (mục dưới), bản thân `text-fg-4` bị chặn ở MỌI chỗ dùng — fixture dùng nó sẽ đỏ vì luật
        // KHÁC, làm test này không còn kiểm được điều nó nhằm kiểm (ghép chéo hai biến thể).
        "  ghost: { label: 'text-warning' },\n" +
        '};\nexport default s;\n',
    });

    // `bg-bg-1` (biến thể `selected`) + `text-warning` (biến thể `ghost`) là một
    // cặp KHÔNG bao giờ xuất hiện trên màn hình. Ghép nó là báo nhầm.
    expect(status).toBe(0);
  });

  it('bỏ qua trạng thái vô hiệu — WCAG 1.4.3 loại trừ thành phần không hoạt động', () => {
    const { status } = runOn('check-contrast.mjs', {
      'Ok.tsx':
        'export const A = () => <View className="bg-action-disabled text-action-disabled-fg">x</View>;\n',
    });

    expect(status).toBe(0);
  });

  /**
   * ── Phần CHỮ MỜ ────────────────────────────────────────────────────────────
   * Chỗ hổng của phần ghép cặp: `<Text className="text-fg-3">` nằm trong `<View>` khác,
   * ở file khác ⇒ nền không ghép được ⇒ cặp bị BỎ SÓT — và đó chính là cách 125 chỗ chữ
   * chú thích 2.96:1 lọt vào repo. Phần này chặn thẳng token, không cần biết nền.
   */
  describe('chữ mờ (text-fg-3/4/5)', () => {
    it('đỏ khi `text-fg-3` là màu chữ mà KHÔNG có nền nào cùng chuỗi để ghép cặp', () => {
      const { status, output } = runOn('check-contrast.mjs', {
        'Bad.tsx':
          'export const A = () => <Text className="text-caption-sm text-fg-3">Hạn 05/04</Text>;\n',
      });

      expect(status).toBe(1);
      expect(output).toContain('CHỮ MỜ');
      expect(output).toContain('text-fg-3');
      // 2.96:1 là đúng con số đo tay trong `src/shared/ui/AGENTS.md` — công thức WCAG hỏng thì số này lệch.
      expect(output).toContain('2.96:1');
    });

    it('bắt được cả `text-fg-4` nằm trong nhánh điều kiện của template literal', () => {
      const { status, output } = runOn('check-contrast.mjs', {
        'Bad.tsx':
          'export const A = ({ ok }: { ok: boolean }) => (\n' +
          '  <Text className={`text-caption-sm ${ok ? "text-fg-1" : "text-fg-4"}`}>x</Text>\n' +
          ');\n',
      });

      expect(status).toBe(1);
      expect(output).toContain('text-fg-4');
    });

    it('xanh khi dùng `text-fg-2` — bậc phụ đạt ≥ 5:1', () => {
      const { status } = runOn('check-contrast.mjs', {
        'Ok.tsx':
          'export const A = () => <Text className="text-caption-sm text-fg-2">Hạn 05/04</Text>;\n',
      });

      expect(status).toBe(0);
    });

    it('⛔ KHÔNG đếm chú thích và prop khác — `color="fg-3"` của Icon là hình trang trí, không phải chữ', () => {
      const { status } = runOn('check-contrast.mjs', {
        'Ok.tsx':
          '// text-fg-3 chỉ 2.96:1 — chú thích không phải mã\n' +
          'export const A = () => <Icon color="fg-3" name="lock" />;\n',
      });

      expect(status).toBe(0);
    });

    it('bỏ qua class có biến thể (`dark:`) — chỉ áp trong một điều kiện, không phán được', () => {
      const { status } = runOn('check-contrast.mjs', {
        'Ok.tsx': 'export const A = () => <Text className="text-fg-1 dark:text-fg-3">x</Text>;\n',
      });

      expect(status).toBe(0);
    });

    /**
     * Manifest chỉ tha chữ GIỮ CHỖ thật và nợ đã khai. `max` khoá mức nợ: khai 1 chỗ xong
     * lặng lẽ thành 5 là đúng kiểu mục hỏng âm thầm mà trình soát này sinh ra để chặn.
     */
    it('tha chỗ đã khai trong `mutedText.allow`, chừng nào chưa vượt `max`', () => {
      const { status, output } = runOn(
        'check-contrast.mjs',
        {
          'Legacy.tsx':
            'export const A = () => <Text className="text-caption-sm text-fg-3">a</Text>;\n',
        },
        (dir) => ({ CONTRAST_MANIFEST: writeMutedManifest(dir, 'Legacy.tsx', 1) }),
      );

      expect(status).toBe(0);
      expect(output).toContain('Không có chữ mờ');
    });

    it('đỏ lại khi file đã khai còn PHÌNH quá `max` — báo toàn bộ chỗ dùng của file', () => {
      const { status, output } = runOn(
        'check-contrast.mjs',
        {
          'Legacy.tsx':
            'export const A = () => <Text className="text-fg-3">a</Text>;\n' +
            'export const B = () => <Text className="text-fg-3">b</Text>;\n',
        },
        (dir) => ({ CONTRAST_MANIFEST: writeMutedManifest(dir, 'Legacy.tsx', 1) }),
      );

      expect(status).toBe(1);
      expect(output).toContain('hạn mức khai 1');
    });

    it('đỏ khi mục khai không nói vì sao', () => {
      const { status, output } = runOn(
        'check-contrast.mjs',
        {
          'Legacy.tsx': 'export const A = () => <Text className="text-fg-3">a</Text>;\n',
        },
        (dir) => ({ CONTRAST_MANIFEST: writeMutedManifest(dir, 'Legacy.tsx', 1, false) }),
      );

      expect(status).toBe(1);
      expect(output).toContain('thiếu "why"');
    });
  });
});

describe('check-touch-targets.mjs', () => {
  it('đỏ khi thẻ bấm được cao 40dp mà không có hitSlop', () => {
    const { status, output } = runOn('check-touch-targets.mjs', {
      'Bad.tsx': 'export const A = () => <Pressable className="h-10 w-10" onPress={f} />;\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('40dp');
  });

  it('đỏ khi hitSlop chỉ nới NGANG — không giúp gì cho chiều cao', () => {
    const { status } = runOn('check-touch-targets.mjs', {
      'Bad.tsx':
        'export const A = () => <Pressable className="h-control-xs" hitSlop={{ left: 8, right: 8 }} onPress={f} />;\n',
    });

    expect(status).toBe(1);
  });

  it('xanh khi hitSlop bù đủ, ở cả dạng số lẫn dạng object', () => {
    const { status } = runOn('check-touch-targets.mjs', {
      'Ok.tsx':
        'export const A = () => <Pressable className="h-10" hitSlop={8} onPress={f} />;\n' +
        'export const B = () => <Pressable className="h-8" hitSlop={{ bottom: 12, top: 12 }} onPress={f} />;\n' +
        'export const C = () => <Pressable className="h-11" onPress={f} />;\n',
    });

    expect(status).toBe(0);
  });

  it('đọc được chiều cao đến từ slot tv() của file bên cạnh', () => {
    const { status, output } = runOn('check-touch-targets.mjs', {
      'thing.styles.ts': "export const s = { slots: { chip: 'h-control-xs px-md' } };\n",
      'Thing.tsx':
        "import { s } from './thing.styles';\n" +
        'export const A = () => <Pressable className={s.chip()} onPress={f} />;\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('32dp');
  });

  /**
   * ── Nút CHỈ-ICON ───────────────────────────────────────────────────────────
   * Ca hay hỏng nhất và phần soát theo `className` không thấy: không có class chiều cao nào để đọc, người ta viết
   * `hitSlop={8}` theo phản xạ — icon 18 + 16 = **34dp**, thiếu 10. Đã có 3 chỗ như vậy trong repo (EditStrip, ReplyStrip,
   * SelectedChips) trước khi có phần này.
   */
  describe('nút chỉ có icon', () => {
    it('đỏ khi icon 18dp chỉ được bù hitSlop={8} — ra 34dp, thiếu 10', () => {
      const { status, output } = runOn('check-touch-targets.mjs', {
        'Bad.tsx':
          'export const A = () => <Pressable hitSlop={8} onPress={f}><Icon name="cancel" size={18} /></Pressable>;\n',
      });

      expect(status).toBe(1);
      expect(output).toContain('chỉ có icon');
      expect(output).toContain('34dp');
    });

    it('đỏ khi bỏ trống `size` (mặc định 24dp) mà không có hitSlop', () => {
      const { status, output } = runOn('check-touch-targets.mjs', {
        'Bad.tsx':
          'export const A = () => <Pressable onPress={f}><Icon name="cancel" /></Pressable>;\n',
      });

      expect(status).toBe(1);
      expect(output).toContain('icon 24dp, KHÔNG có hitSlop');
    });

    it('xanh khi icon + hitSlop đủ 44dp — số lẫn tên bậc (`size="md"` = 24dp)', () => {
      const { status } = runOn('check-touch-targets.mjs', {
        'Ok.tsx':
          'export const A = () => <Pressable hitSlop={14} onPress={f}><Icon name="cancel" size={18} /></Pressable>;\n' +
          'export const B = () => <Pressable hitSlop={10} onPress={f}><Icon name="cancel" size="md" /></Pressable>;\n' +
          'export const C = () => <Pressable hitSlop={{ bottom: 10, left: 6, right: 6, top: 10 }} onPress={f}><Icon name="cancel" /></Pressable>;\n',
      });

      expect(status).toBe(0);
    });

    it('đệm trong class được cộng vào: `p-3` (12) hai phía + icon 24 = 48dp ⇒ xanh', () => {
      const { status } = runOn('check-touch-targets.mjs', {
        'Ok.tsx':
          'export const A = () => <Pressable className="p-3" onPress={f}><Icon name="cancel" /></Pressable>;\n',
      });

      expect(status).toBe(0);
    });

    it('⛔ KHÔNG đo lại khi đã có chiều cao khai trong class (phần soát theo class lo)', () => {
      const { status } = runOn('check-touch-targets.mjs', {
        'Ok.tsx':
          'export const A = () => <Pressable className="h-11 w-11" onPress={f}><Icon name="cancel" size={18} /></Pressable>;\n',
      });

      expect(status).toBe(0);
    });

    it('bỏ qua ca không đọc tĩnh được (cỡ icon là biến) và Pressable có chữ', () => {
      const { status } = runOn('check-touch-targets.mjs', {
        'Ok.tsx':
          'export const A = ({ n }: { n: number }) => <Pressable onPress={f}><Icon name="cancel" size={n} /></Pressable>;\n' +
          'export const B = () => <Pressable onPress={f}><Icon name="cancel" size={18} /><Text>Đóng</Text></Pressable>;\n',
      });

      expect(status).toBe(0);
    });
  });
});

describe('check-file-size.mjs', () => {
  /**
   * File dài đúng `n` dòng: `n−1` dòng chú thích + một dòng mã. Nội dung không
   * quan trọng — trình soát này chỉ ĐẾM DÒNG, ⛔ không phân tích cú pháp.
   */
  const lines = (n: number) => `${'// x\n'.repeat(n - 1)}export const a = 1;\n`;

  /** Khoá mà manifest dùng để nhận ra một file — đúng phép tính script làm. */
  const key = (dir: string, name: string) =>
    path.relative(ROOT, path.join(dir, name)).replaceAll('\\', '/');

  it('đỏ khi .tsx vượt 200 dòng, và nói rõ số dòng đo được', () => {
    const { status, output } = runOn('check-file-size.mjs', { 'Big.tsx': lines(201) });

    expect(status).toBe(1);
    expect(output).toContain('201 dòng');
  });

  it('đỏ khi hook/util .ts vượt 150 dòng', () => {
    const { status, output } = runOn('check-file-size.mjs', { 'use-thing.ts': lines(151) });

    expect(status).toBe(1);
    expect(output).toContain('151 dòng');
  });

  it('xanh ở ĐÚNG trần — 200 với .tsx, 150 với .ts', () => {
    const { status } = runOn('check-file-size.mjs', {
      'Ok.tsx': lines(200),
      'use-ok.ts': lines(150),
    });

    expect(status).toBe(0);
  });

  /**
   * ⚠️ Đây là nửa dễ hỏng nhất của trình soát: siết `.ts` lên MỌI file là
   * `button.styles.ts` (485 dòng vì 5 kiểu × 3 cỡ × 4 trạng thái) đỏ vĩnh viễn,
   * và người ta sẽ tắt cổng kiểm chứ không chẻ bảng công thức làm đôi.
   */
  it('miễn trừ file công thức/khai báo theo hậu tố, và file sinh tự động', () => {
    const { status } = runOn('check-file-size.mjs', {
      'a.styles.ts': lines(400),
      'b.types.ts': lines(400),
      'c.constants.ts': lines(400),
      'icons.generated.ts': lines(400),
    });

    expect(status).toBe(0);
  });

  it('tha file đã khai nợ, chừng nào nó không dài quá `max`', () => {
    const { status, output } = runOn(
      'check-file-size.mjs',
      (dir) => ({
        'debt.json': JSON.stringify({
          debt: [{ file: key(dir, 'Legacy.tsx'), max: 208, why: 'nợ cũ, cần tách' }],
        }),
        'Legacy.tsx': lines(208),
      }),
      (dir) => ({ FILE_SIZE_MANIFEST: path.join(dir, 'debt.json') }),
    );

    expect(status).toBe(0);
    expect(output).toContain('nợ đã khai: 1');
  });

  /**
   * ⛔ Không có ca này thì manifest thành một cái van xả: khai nợ ở 208 dòng
   * xong file lặng lẽ lên 400, y như một ngoại lệ tương phản khai cho 4.45:1 mà
   * tha luôn cho 1.2:1. `max` là để KHOÁ mức nợ, không phải để miễn trừ file.
   */
  it('đỏ lại khi file đã khai nợ còn PHÌNH quá `max`', () => {
    const { status, output } = runOn(
      'check-file-size.mjs',
      (dir) => ({
        'debt.json': JSON.stringify({
          debt: [{ file: key(dir, 'Legacy.tsx'), max: 208, why: 'nợ cũ, cần tách' }],
        }),
        'Legacy.tsx': lines(209),
      }),
      (dir) => ({ FILE_SIZE_MANIFEST: path.join(dir, 'debt.json') }),
    );

    expect(status).toBe(1);
    expect(output).toContain('PHÌNH');
  });

  it('đỏ khi mục nợ không nói vì sao — nợ không có lý do là nợ không ai trả', () => {
    const { status, output } = runOn(
      'check-file-size.mjs',
      (dir) => ({
        'debt.json': JSON.stringify({ debt: [{ file: key(dir, 'Legacy.tsx'), max: 300 }] }),
        'Legacy.tsx': lines(208),
      }),
      (dir) => ({ FILE_SIZE_MANIFEST: path.join(dir, 'debt.json') }),
    );

    expect(status).toBe(1);
    expect(output).toContain('thiếu "why"');
  });

  it('nhắc khi nợ đã trả xong mà mục khai còn nằm lại — nhưng KHÔNG làm đỏ', () => {
    const { status, output } = runOn(
      'check-file-size.mjs',
      (dir) => ({
        'debt.json': JSON.stringify({
          debt: [{ file: key(dir, 'Fixed.tsx'), max: 208, why: 'nợ cũ, cần tách' }],
        }),
        'Fixed.tsx': lines(120),
      }),
      (dir) => ({ FILE_SIZE_MANIFEST: path.join(dir, 'debt.json') }),
    );

    // Trả nợ xong mà cổng kiểm đỏ là dạy người ta rằng dọn dẹp thì bị phạt.
    expect(status).toBe(0);
    expect(output).toContain('Mục THỪA');
  });
});

describe('check-imports.mjs — ranh giới feature', () => {
  /** Manifest giả khai đúng các cặp `[from, to]`, có/không `why`. */
  const manifestFor =
    (pairs: [string, string][], withWhy = true) =>
    (dir: string) => {
      const target = path.join(dir, 'boundaries.json');
      fs.writeFileSync(
        target,
        JSON.stringify({
          allow: pairs.map(([from, to]) => ({
            from,
            to,
            ...(withWhy ? { why: 'feature nền' } : {}),
          })),
        }),
        'utf8',
      );
      return { FEATURE_BOUNDARIES_MANIFEST: target };
    };

  const boundaries = (
    files: Record<string, string>,
    env?: (dir: string) => Record<string, string>,
  ) => runOn('check-imports.mjs', files, env ?? manifestFor([]));

  it('đỏ khi feature A import thẳng `@/features/B/…` — và nói rõ cặp + chỗ import', () => {
    const { status, output } = boundaries({
      'features/boards/BoardCard.tsx':
        "import { MemberRow } from '@/features/members/components/MemberRow';\nexport const A = MemberRow;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain('boards → members');
    expect(output).toContain('BoardCard.tsx:1');
  });

  it('đỏ khi đường TƯƠNG ĐỐI chui sang thư mục feature khác', () => {
    const { status, output } = boundaries({
      'features/boards/BoardCard.tsx':
        "import { helper } from '../members/helper';\nexport const A = helper;\n",
      'features/members/helper.ts': 'export const helper = 1;\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('boards → members');
  });

  it('đỏ với cả `export … from` (barrel re-export) và `import()` nạp lười', () => {
    const reexport = boundaries({
      'features/boards/index.ts': "export { MemberRow } from '@/features/members';\n",
    });
    const lazy = boundaries({
      'features/boards/lazy.ts': "export const load = () => import('@/features/members/screen');\n",
    });

    expect(reexport.status).toBe(1);
    expect(lazy.status).toBe(1);
  });

  it('xanh khi import cùng feature, và khi import ra `@/shared` · `@/core` · `@/shell`', () => {
    const { status } = boundaries({
      'features/boards/BoardCard.tsx':
        "import { Button } from '@/shared/ui/button';\nimport { api } from '@/core/api';\nimport { local } from './local';\nimport { sibling } from './utils/sibling';\nexport const A = [Button, api, local, sibling];\n",
      'features/boards/local.ts': 'export const local = 1;\n',
      // `../local` từ `features/boards/utils/` vẫn nằm TRONG feature `boards` — leo cấp không tự nó là import chéo.
      'features/boards/utils/sibling.ts':
        "import { local } from '../local';\nexport const sibling = local;\n",
    });

    expect(status).toBe(0);
  });

  /**
   * ⛔ JSDoc hay nhắc `import … from '@/features/…'` để giải thích vì sao KHÔNG được nhập — đã xảy ra thật ở
   * `me/constants/biometric.messages.ts`. Đọc chú thích như mã là báo nhầm hàng loạt và người ta sẽ tắt cổng kiểm.
   */
  it('KHÔNG đếm import nằm trong chú thích', () => {
    const { status } = boundaries({
      'features/me/messages.ts':
        "/**\n * Tách khỏi auth: gộp chung sẽ buộc `import x from '@/features/auth/messages'`.\n */\n// import y from '@/features/auth/y';\nexport const a = 1;\n",
    });

    expect(status).toBe(0);
  });

  it('miễn file test — chúng dựng dữ liệu giả, không phải mã chạy trong app', () => {
    const { status } = boundaries({
      'features/boards/tests/fixtures.ts':
        "import { makeMember } from '@/features/members/tests/fixtures';\nexport const a = makeMember;\n",
      'features/boards/Board.test.tsx':
        "import { makeMember } from '@/features/members';\nexport const b = makeMember;\n",
    });

    expect(status).toBe(0);
  });

  it('tha cặp đã khai trong manifest — và chỉ cặp đó, đúng CHIỀU', () => {
    const allowed = boundaries(
      {
        'features/threads/Thread.tsx':
          "import { ChatRoom } from '@/features/chat';\nexport const A = ChatRoom;\n",
      },
      manifestFor([['threads', 'chat']]),
    );
    // Khai `threads → chat` KHÔNG tha chiều ngược `chat → threads` — feature nền không được biết feature dùng nó.
    const reverse = boundaries(
      {
        'features/chat/Room.tsx':
          "import { Thread } from '@/features/threads';\nexport const A = Thread;\n",
      },
      manifestFor([['threads', 'chat']]),
    );

    expect(allowed.status).toBe(0);
    expect(reverse.status).toBe(1);
    expect(reverse.output).toContain('chat → threads');
  });

  it('đỏ khi mục manifest không nói vì sao — ngoại lệ không lý do là ngoại lệ không ai xét lại', () => {
    const { status, output } = boundaries(
      {
        'features/threads/Thread.tsx':
          "import { ChatRoom } from '@/features/chat';\nexport const A = ChatRoom;\n",
      },
      manifestFor([['threads', 'chat']], false),
    );

    expect(status).toBe(1);
    expect(output).toContain('thiếu "why"');
  });

  it('nhắc khi cặp đã khai không còn import nào — nhưng KHÔNG làm đỏ', () => {
    const { status, output } = boundaries(
      { 'features/threads/Thread.tsx': 'export const A = 1;\n' },
      manifestFor([['threads', 'chat']]),
    );

    expect(status).toBe(0);
    expect(output).toContain('THỪA');
  });

  it('phần cũ vẫn sống: gói không có trong package.json thì vẫn đỏ', () => {
    const { status, output } = boundaries({
      'features/boards/Board.tsx': "import x from 'goi-khong-ton-tai-xyz';\nexport const A = x;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain('goi-khong-ton-tai-xyz');
  });
});
