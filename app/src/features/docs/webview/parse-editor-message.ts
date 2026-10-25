import { BRIDGE_LIMITS, BRIDGE_VERSION, type EditorMessage } from './doc-editor-bridge.types';
import {
  BOOL_SELECTION,
  BOOL_STATUS,
  CONNECTION_STATES,
  ERROR_CODES,
  MODES,
  NOTICE_CODES,
} from './editor-message.constants';

/**
 * Kiểm MỌI tin từ WebView (`onMessage` → `event.nativeEvent.data`) — bản phía app của `parseEditorMessage` ở
 * `collab/editor-web/src/bridge-validate.ts` (nguồn sự thật; `tests/bridge-contract.test.ts` chạy cả hai bản trên cùng mẫu khi có
 * thư mục `collab/`). KHÔNG BAO GIỜ ném lỗi: JSON cắt cụt, `v` khác 1, `type` lạ, payload sai kiểu, quá cỡ → `{ ok: false }`.
 *
 * ⛔ WebView là biên KHÔNG tin cậy: trang chứa nội dung người khác soạn. Tin sai kiểu bị TỪ CHỐI, không ép kiểu mù.
 */
export type ParseResult<T> =
  { message: T; ok: true } | { ok: false; reason: string; type?: string };

type Obj = Record<string, unknown>;

const SAFE_SCHEME = /^(https?|mailto|tel):/i;
/** Ký tự điều khiển (0–31, 127) — dựng từ mã ký tự thay vì viết `\u….` trong regex (ESLint `no-control-regex`). */
const UNSAFE_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
);

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);
const isStr = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const allBools = (payload: Obj, keys: readonly string[]): boolean =>
  keys.every((key) => typeof payload[key] === 'boolean');

/**
 * Liên kết an toàn để MỞ NGOÀI app: chỉ http(s)/mailto/tel, ≤ 2048 ký tự, không ký tự điều khiển, http(s) phải có máy chủ.
 * Tự viết bằng regex vì `new URL()` của Hermes thiếu nhiều thuộc tính (xem `PreviewFrame` của career).
 */
export function isSafeLinkUrl(url: string): boolean {
  if (url.length === 0 || url.length > BRIDGE_LIMITS.maxLinkChars) return false;
  if (UNSAFE_CHARS.test(url) || !SAFE_SCHEME.test(url)) return false;
  return /^https?:/i.test(url) ? /^https?:\/\/[^/?#]+/i.test(url) : true;
}

function validPayload(type: string, p: Obj): boolean {
  switch (type) {
    case 'ready':
      return (
        p['protocol'] === BRIDGE_VERSION &&
        typeof p['bundle'] === 'string' &&
        Array.isArray(p['commands'])
      );
    case 'status':
      return (
        oneOf(CONNECTION_STATES, p['connection']) &&
        oneOf(MODES, p['mode']) &&
        allBools(p, BOOL_STATUS)
      );
    case 'selectionState':
      return (
        allBools(p, BOOL_SELECTION) &&
        (p['link'] === null || typeof p['link'] === 'string') &&
        [null, 1, 2, 3].includes(p['heading'] as 1 | 2 | 3 | null)
      );
    case 'awareness':
      return (
        typeof p['count'] === 'number' &&
        Array.isArray(p['users']) &&
        p['users'].every(
          (u) =>
            isObj(u) &&
            isStr(u['id']) &&
            typeof u['name'] === 'string' &&
            typeof u['self'] === 'boolean',
        )
      );
    case 'requestToken':
      return (
        (p['reason'] === 'expired' || p['reason'] === 'unauthorized') &&
        typeof p['attempt'] === 'number'
      );
    case 'requestImage':
      return isStr(p['requestId']) && (p['source'] === 'paste' || p['source'] === 'drop');
    case 'resolveAssetUrl':
      return isStr(p['assetId']);
    case 'openLink':
      return typeof p['url'] === 'string' && isSafeLinkUrl(p['url']);
    case 'notice':
      return oneOf(NOTICE_CODES, p['code']);
    case 'commandResult':
      return isStr(p['requestId']) && typeof p['ok'] === 'boolean';
    case 'error':
      return oneOf(ERROR_CODES, p['code']) && typeof p['fatal'] === 'boolean';
    default:
      return false;
  }
}

/** Tin từ WebView (chuỗi JSON hoặc object đã parse) → tin đã kiểm; sai → `{ ok: false, reason }`. */
export function parseEditorMessage(raw: unknown): ParseResult<EditorMessage> {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > BRIDGE_LIMITS.maxMessageChars) return { ok: false, reason: 'too-large' };
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'malformed-json' };
    }
  }
  if (!isObj(value)) return { ok: false, reason: 'not-an-object' };
  if (value['v'] !== BRIDGE_VERSION) return { ok: false, reason: 'unsupported-version' };
  const { payload, type } = value;
  if (typeof type !== 'string') return { ok: false, reason: 'type-missing' };
  if (!isObj(payload)) return { ok: false, reason: 'payload-missing' };
  if (!validPayload(type, payload)) return { ok: false, reason: 'payload-invalid', type };
  return { message: { payload, type, v: BRIDGE_VERSION } as EditorMessage, ok: true };
}
