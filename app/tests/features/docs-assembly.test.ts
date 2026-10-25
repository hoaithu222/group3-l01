import fs from 'node:fs';
import path from 'node:path';

import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * app.md p6-01 §1, §6: nơi LẮP RÁP Real-time Docs vào cây route — lỗi ở đây "im lặng" (tsc/eslint xanh, tính năng chỉ không xuất hiện). Thư mục route mới PHẢI có `_layout.tsx` (thiếu thì Expo Router
 * hoist từng file thành TAB ngang hàng) và mang `FeatureRouteGuard flag="collab"`; mỗi route mỏng (chỉ import + return); bundle soạn thảo `assets/collab/editor.html` PHẢI có mặt (thiếu file là Metro
 * đỏ cả bundle vì `require` tĩnh) và đúng là bản build của `collab/editor-web` (CSP ghim hash, không mạng ngoài).
 */
const ROOT = path.join(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'app', '(app)', 'workspaces', '[wsId]', 'docs');
const read = (file: string): string => fs.readFileSync(file, 'utf8');
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');

describe('cây route workspaces/[wsId]/docs', () => {
  it('có _layout.tsx: Stack ẩn header, bọc FeatureRouteGuard cờ "collab"', () => {
    const layout = strip(read(path.join(DOCS, '_layout.tsx')));
    expect(layout).toMatch(/<FeatureRouteGuard flag="collab">/);
    // Stack dùng `screenOptions` CHUNG của app (ẩn header + trượt ngang) — xem `shell/navigation/stack-screen-options.ts`.
    expect(layout).toContain(
      "import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';",
    );
    expect(layout).toMatch(/<Stack screenOptions=\{STACK_SCREEN_OPTIONS\} \/>/);
    expect(STACK_SCREEN_OPTIONS.headerShown).toBe(false);
  });

  it.each([
    ['index.tsx', 'DocumentListScreen'],
    ['[docId].tsx', 'DocumentEditorScreen'],
    [path.join('[docId]', 'history.tsx'), 'DocumentHistoryScreen'],
    [path.join('[docId]', 'share.tsx'), 'DocumentShareScreen'],
  ])('%s là route MỎNG trỏ tới %s', (file, screenName) => {
    const code = strip(read(path.join(DOCS, file)));
    expect(code).toContain(
      `import { ${screenName} } from '@/features/docs/screens/${screenName}';`,
    );
    expect(code).toContain(`<${screenName} />`);
    expect(code).not.toMatch(/\buse[A-Z]\w+\(/);
  });

  it('barrel feature xuất đủ 4 màn', () => {
    const barrel = read(path.join(ROOT, 'src', 'features', 'docs', 'index.ts'));
    for (const name of [
      'DocumentListScreen',
      'DocumentEditorScreen',
      'DocumentHistoryScreen',
      'DocumentShareScreen',
    ]) {
      expect(barrel).toContain(name);
    }
  });
});

describe('bundle soạn thảo trong app', () => {
  const html = path.join(ROOT, 'assets', 'collab', 'editor.html');

  it('assets/collab/editor.html có mặt, là bản build một-file với CSP ghim hash', () => {
    expect(fs.existsSync(html)).toBe(true);
    const content = read(html);
    expect(content).toContain("script-src 'sha256-");
    expect(content).toContain('id="editor-root"');
    expect(content).toContain("default-src 'none'");
    expect(content).toContain('connect-src ws: wss:');
  });

  it('utils/editor-asset.ts require đúng đường dẫn tới file đó (đổi tên/di chuyển file là đỏ ở đây)', () => {
    const utils = path.join(ROOT, 'src', 'features', 'docs', 'utils');
    const target =
      /require\('([^']+editor\.html)'\)/.exec(read(path.join(utils, 'editor-asset.ts')))?.[1] ?? '';
    expect(fs.existsSync(path.resolve(utils, target))).toBe(true);
  });
});
