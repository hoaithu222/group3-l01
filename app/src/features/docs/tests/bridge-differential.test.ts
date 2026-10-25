import fs from 'node:fs';
import path from 'node:path';

import { parseEditorMessage } from '../webview/parse-editor-message';

/**
 * Kiểm CHÉO bản phía app với `parseEditorMessage` THẬT của editor-web (`collab/editor-web/src/bridge-validate.ts`) trên cùng một bộ mẫu: hai bên phải KẾT LUẬN GIỐNG NHAU (nhận/từ chối) và
 * nhận thì ra cùng tin. Nạp thẳng file TS của collab bằng `require` (Babel của Jest dịch được, file thuần TS không phụ thuộc thư viện). Không có thư mục `collab/` (checkout riêng lẻ) → SKIP.
 * ⚠️ Cố ý KHÁC MỘT điểm: app từ chối liên kết chứa ký tự điều khiển (`\n`) mà `new URL()` phía web lặng lẽ bỏ — nên bộ mẫu không có ca đó.
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

type Verdict = { ok: boolean; message?: unknown };
type WebValidator = { parseEditorMessage: (raw: unknown) => Verdict };

function loadWebValidator(): WebValidator {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp file TS của package collab để kiểm chéo
  return require('../../../../../collab/editor-web/src/bridge-validate') as WebValidator;
}
const web = (): ((raw: unknown) => Verdict) => loadWebValidator().parseEditorMessage;

const msg = (type: string, payload: unknown, v: unknown = 1) =>
  JSON.stringify({ payload, type, v });
const STATUS = {
  archived: false,
  connection: 'synced',
  mode: 'edit',
  nearLimit: false,
  readOnly: false,
  saveFailed: false,
  tooLarge: false,
  unsynced: false,
};
const SEL = {
  blockquote: false,
  bold: true,
  bulletList: false,
  canEdit: true,
  canRedo: false,
  canUndo: true,
  code: false,
  codeBlock: false,
  heading: 2,
  italic: false,
  link: 'https://a.vn',
  orderedList: false,
  strike: false,
  table: false,
  taskList: false,
  underline: false,
};

const CORPUS: [string, unknown][] = [
  ['ready ok', msg('ready', { bundle: '0.1.0', commands: ['bold'], protocol: 1 })],
  ['ready sai protocol', msg('ready', { bundle: '0.1.0', commands: [], protocol: 2 })],
  ['status ok', msg('status', STATUS)],
  ['status thiếu cờ', msg('status', { connection: 'synced', mode: 'edit' })],
  ['status connection lạ', msg('status', { ...STATUS, connection: 'x' })],
  ['status mode comment', msg('status', { ...STATUS, mode: 'comment', readOnly: true })],
  ['selectionState ok', msg('selectionState', SEL)],
  ['selectionState heading 4', msg('selectionState', { ...SEL, heading: 4 })],
  ['selectionState link số', msg('selectionState', { ...SEL, link: 5 })],
  [
    'awareness ok',
    msg('awareness', {
      count: 1,
      users: [{ color: '#175CD3', id: 'u1', name: 'Lan', self: true }],
    }),
  ],
  [
    'awareness user hỏng',
    msg('awareness', { count: 1, users: [{ id: '', name: 'x', self: true }] }),
  ],
  ['requestToken expired', msg('requestToken', { attempt: 1, reason: 'expired' })],
  ['requestToken lạ', msg('requestToken', { attempt: 1, reason: 'x' })],
  ['requestImage paste', msg('requestImage', { requestId: 'img-1', source: 'paste' })],
  ['requestImage thiếu id', msg('requestImage', { source: 'paste' })],
  ['resolveAssetUrl ok', msg('resolveAssetUrl', { assetId: 'abc12345' })],
  ['resolveAssetUrl rỗng', msg('resolveAssetUrl', { assetId: '' })],
  ['openLink https', msg('openLink', { url: 'https://example.com/x' })],
  ['openLink mailto', msg('openLink', { url: 'mailto:a@b.vn' })],
  ['openLink javascript', msg('openLink', { url: 'javascript:alert(1)' })],
  ['openLink data', msg('openLink', { url: 'data:text/html,x' })],
  ['openLink file', msg('openLink', { url: 'file:///etc/passwd' })],
  ['notice ok', msg('notice', { code: 'READ_ONLY' })],
  ['notice lạ', msg('notice', { code: 'PWNED' })],
  ['commandResult ok', msg('commandResult', { ok: true, requestId: 'r1' })],
  ['commandResult thiếu ok', msg('commandResult', { requestId: 'r1' })],
  ['error ok', msg('error', { code: 'AUTH_EXPIRED', fatal: false })],
  ['error mã lạ', msg('error', { code: 'X', fatal: true })],
  ['loại lạ', msg('exec', {})],
  ['v = 2', msg('notice', { code: 'RESTORED' }, 2)],
  ['JSON hỏng', '{"v":1,"type"'],
  ['mảng', '[]'],
  ['payload không phải object', msg('notice', 'x')],
];

suite('kiểm chéo với parseEditorMessage của editor-web', () => {
  it.each(CORPUS)('%s', (_name, raw) => {
    const theirs = web()(raw);
    const ours = parseEditorMessage(raw);
    expect(ours.ok).toBe(theirs.ok);
    if (ours.ok && theirs.ok) expect(ours.message).toEqual(theirs.message);
  });

  it('bộ mẫu đủ rộng: cả nhận lẫn từ chối đều có mặt', () => {
    const verdicts = CORPUS.map(([, raw]) => parseEditorMessage(raw).ok);
    expect(verdicts.filter(Boolean).length).toBeGreaterThanOrEqual(12);
    expect(verdicts.filter((ok) => !ok).length).toBeGreaterThanOrEqual(12);
  });
});
