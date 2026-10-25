import fs from 'node:fs';
import path from 'node:path';

import { hostMessage } from '../webview/doc-editor-bridge';
import type { CommandBody, HostMessage } from '../webview/doc-editor-bridge.types';

/**
 * Chiều NGƯỢC LẠI của kiểm chéo: MỌI tin app → trang mà app có thể gửi phải được `parseHostMessage` THẬT của editor-web (`collab/editor-web/src/bridge-validate.ts`) NHẬN — nếu không, trang
 * im lặng bỏ tin (chỉ báo `INVALID_MESSAGE` không nghiêm trọng) và người dùng thấy "bấm nút không có gì xảy ra". Gồm cả từng lệnh của toolbar. Không có thư mục `collab/` → SKIP.
 */
const VALIDATE = path.resolve(
  process.cwd(),
  '..',
  'collab',
  'editor-web',
  'src',
  'bridge-validate.ts',
);
const suite = fs.existsSync(VALIDATE) ? describe : describe.skip;

type Verdict = { ok: boolean; reason?: string };
type WebValidator = { parseHostMessage: (raw: unknown) => Verdict };

function loadWebValidator(): WebValidator {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp file TS của package collab để kiểm chéo
  return require('../../../../../collab/editor-web/src/bridge-validate') as WebValidator;
}
const web = (raw: string): Verdict => loadWebValidator().parseHostMessage(raw);

const USER = { color: '#175CD3', id: 'u1', name: 'Nguyễn An' };
const DOC = '0123456789abcdef01234567';
const ASSET = 'a1b2c3d4e5f6a1b2c3d4e5f6';

const TOOLBAR: CommandBody[] = [
  { name: 'bold' },
  { name: 'italic' },
  { name: 'strike' },
  { attrs: { level: 1 }, name: 'heading' },
  { attrs: { level: 2 }, name: 'heading' },
  { attrs: { level: 3 }, name: 'heading' },
  { name: 'bulletList' },
  { name: 'orderedList' },
  { name: 'taskList' },
  { name: 'blockquote' },
  { name: 'codeBlock' },
  { attrs: { cols: 3, rows: 3 }, name: 'insertTable' },
  { attrs: { href: 'https://example.com' }, name: 'link' },
  { attrs: { href: null }, name: 'link' },
  { name: 'undo' },
  { name: 'redo' },
  { attrs: { position: 'end' }, name: 'focus' },
];

const OTHERS: [string, HostMessage][] = [
  [
    'init live',
    hostMessage('init', {
      documentName: `doc:${DOC}`,
      expiresAt: Date.now() + 300_000,
      locale: 'vi',
      mode: 'edit',
      stateMaxBytes: 5_242_880,
      theme: 'dark',
      token: 'a.b.c',
      url: 'wss://x.example/collab',
      user: USER,
    }),
  ],
  [
    'init snapshot',
    hostMessage('init', { locale: 'vi', source: 'snapshot', theme: 'light', yjsState: 'AAEC' }),
  ],
  ['setToken', hostMessage('setToken', { expiresAt: Date.now() + 300_000, token: 'a.b.c' })],
  ['insertImage', hostMessage('insertImage', { assetId: ASSET })],
  [
    'assetUrl ok',
    hostMessage('assetUrl', {
      assetId: ASSET,
      expiresAt: Date.now() + 50_000,
      url: 'https://cdn.example/x.png?sig=1',
    }),
  ],
  ['assetUrl lỗi', hostMessage('assetUrl', { assetId: ASSET, error: 'not-found' })],
  ['setMode', hostMessage('setMode', { mode: 'view' })],
  ['setTheme', hostMessage('setTheme', { theme: 'dark' })],
  ['retry', hostMessage('retry', {})],
  ['dispose', hostMessage('dispose', {})],
];

suite('tin app → trang được parseHostMessage của editor-web nhận', () => {
  it.each(
    TOOLBAR.map(
      (body) =>
        [`${body.name}${'attrs' in body ? ` ${JSON.stringify(body.attrs)}` : ''}`, body] as const,
    ),
  )('lệnh toolbar %s', (_name, body) => {
    expect(web(JSON.stringify(hostMessage('command', body)))).toMatchObject({ ok: true });
  });

  it.each(OTHERS)('%s', (_name, message) => {
    expect(web(JSON.stringify(message))).toMatchObject({ ok: true });
  });

  it('sanity: cùng bộ kiểm chặn tin sai (init url http, lệnh lạ)', () => {
    const bad = hostMessage('init', {
      documentName: `doc:${DOC}`,
      mode: 'edit',
      token: 'a.b.c',
      url: 'https://x.example/collab',
      user: USER,
    });
    expect(web(JSON.stringify(bad)).ok).toBe(false);
    expect(web(JSON.stringify({ payload: { name: 'rm -rf' }, type: 'command', v: 1 })).ok).toBe(
      false,
    );
  });
});
