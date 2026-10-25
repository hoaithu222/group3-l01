import { parseEditorMessage, isSafeLinkUrl } from '../webview/parse-editor-message';

/**
 * Biên WebView → app: MỌI tin phải qua `parseEditorMessage` (bản phía app của `bridge-validate.ts`). Tin sai kiểu bị TỪ CHỐI chứ không ép kiểu mù;
 * hàm không bao giờ ném lỗi — trang chứa nội dung do người khác soạn nên là biên không tin cậy.
 */
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

describe('parseEditorMessage — tin hợp lệ', () => {
  it.each([
    ['ready', { bundle: '0.1.0', commands: ['bold'], protocol: 1 }],
    ['status', STATUS],
    ['requestToken', { attempt: 1, reason: 'expired' }],
    ['requestImage', { requestId: 'img-1', source: 'paste' }],
    ['resolveAssetUrl', { assetId: 'abcdef12345' }],
    ['openLink', { url: 'https://example.com/a?b=1' }],
    ['notice', { code: 'SAVE_FAILED' }],
    ['commandResult', { ok: false, reason: 'read-only', requestId: 'r1' }],
    ['error', { code: 'FORBIDDEN', fatal: true }],
    ['awareness', { count: 1, users: [{ color: '#175CD3', id: 'u1', name: 'Lan', self: true }] }],
  ])('%s → ok, giữ nguyên payload', (type, payload) => {
    const parsed = parseEditorMessage(msg(type, payload));
    expect(parsed).toEqual({ message: { payload, type, v: 1 }, ok: true });
  });

  it('nhận cả object đã parse (không chỉ chuỗi JSON)', () => {
    expect(parseEditorMessage({ payload: { code: 'RESTORED' }, type: 'notice', v: 1 }).ok).toBe(
      true,
    );
  });
});

describe('parseEditorMessage — bị từ chối, không ném lỗi', () => {
  it.each([
    ['JSON cắt cụt', '{"v":1,"type":"stat', 'malformed-json'],
    ['không phải object', '"chuỗi"', 'not-an-object'],
    ['mảng', '[]', 'not-an-object'],
    ['null', 'null', 'not-an-object'],
    ['v khác 1', msg('notice', { code: 'RESTORED' }, 2), 'unsupported-version'],
    ['thiếu v', JSON.stringify({ payload: {}, type: 'notice' }), 'unsupported-version'],
    ['type không phải chuỗi', JSON.stringify({ payload: {}, type: 5, v: 1 }), 'type-missing'],
    ['payload không phải object', msg('notice', 'x'), 'payload-missing'],
    ['type lạ', msg('exec', { code: 'x' }), 'payload-invalid'],
    [
      'payload sai kiểu (status thiếu cờ)',
      msg('status', { connection: 'synced', mode: 'edit' }),
      'payload-invalid',
    ],
    ['mã notice lạ', msg('notice', { code: 'HACKED' }), 'payload-invalid'],
    ['mã error lạ', msg('error', { code: 'X', fatal: true }), 'payload-invalid'],
    ['connection lạ', msg('status', { ...STATUS, connection: 'lost' }), 'payload-invalid'],
    ['openLink javascript:', msg('openLink', { url: 'javascript:alert(1)' }), 'payload-invalid'],
    ['openLink data:', msg('openLink', { url: 'data:text/html,<script>' }), 'payload-invalid'],
    [
      'ready sai giao thức',
      msg('ready', { bundle: 'x', commands: [], protocol: 2 }),
      'payload-invalid',
    ],
  ])('%s', (_name, raw, reason) => {
    expect(parseEditorMessage(raw)).toMatchObject({ ok: false, reason });
  });

  it('quá cỡ (> 64K ký tự) → too-large', () => {
    expect(parseEditorMessage('x'.repeat(64 * 1024 + 1))).toMatchObject({
      ok: false,
      reason: 'too-large',
    });
  });

  it('giữ `type` của tin sai để nơi gọi rẽ nhánh (ready sai giao thức → báo lệch phiên bản)', () => {
    const parsed = parseEditorMessage(msg('ready', { bundle: 'x', commands: [], protocol: 9 }));
    expect(parsed).toEqual({ ok: false, reason: 'payload-invalid', type: 'ready' });
  });
});

describe('isSafeLinkUrl', () => {
  it.each(['https://a.vn', 'http://a.vn/x?y#z', 'mailto:a@b.vn', 'tel:+84901234567'])(
    '%s an toàn',
    (url) => {
      expect(isSafeLinkUrl(url)).toBe(true);
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html;base64,AAAA',
    'file:///etc/passwd',
    'https://',
    'https:///x',
    '',
    'ftp://a',
    'https://a.vn/\n',
  ])('%j không an toàn', (url) => {
    expect(isSafeLinkUrl(url)).toBe(false);
  });

  it('quá 2048 ký tự → không an toàn', () => {
    expect(isSafeLinkUrl(`https://a.vn/${'x'.repeat(2048)}`)).toBe(false);
  });
});
