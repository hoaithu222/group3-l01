import { decodeJwtPayload } from '@/shared/utils/jwt.utils';

import { COLLAB_REFRESH_SKEW_MS, type CollabGrant, type CollabKind } from './collab-token.types';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** Tiền tố `documentName` theo loại tài nguyên (`collab/README.md` §3.1): `doc:<id>` tài liệu, `wb:<id>` bảng trắng. */
const NAME_RE: Record<CollabKind, RegExp> = {
  doc: /^doc:[0-9a-fA-F]{24}$/,
  wb: /^wb:[0-9a-fA-F]{24}$/,
};
const MAX_TOKEN_CHARS = 4096;
/** Số nguyên ≥ mốc này coi là mili giây, nhỏ hơn là giây (JWT `exp`). */
const EPOCH_MS_THRESHOLD = 1e11;
/** Sàn chờ trước lượt làm mới: token đã sát hạn thì làm mới gần như ngay, nhưng không dồn dập vào BE. */
const MIN_REFRESH_DELAY_MS = 1_000;

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `expiresAt` của BE là chuỗi ISO (Date qua JSON); nhận thêm số (giây/ms) cho chắc. Sai định dạng → `undefined`. */
function toEpochMs(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.round(value < EPOCH_MS_THRESHOLD ? value * 1000 : value);
  }
  if (typeof value === 'string' && value.length <= 40) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
  }
  return undefined;
}

/**
 * Phản hồi `collab-token` (đã `unwrapData`) → `CollabGrant`, hoặc `null` nếu thiếu/sai kiểu. KHÔNG ném lỗi và KHÔNG in nội dung nào:
 * phản hồi chứa token. `kind` (mặc định `doc`) là tiền tố `documentName` mà endpoint đang gọi PHẢI trả (bảng trắng truyền `'wb'`): khác
 * tiền tố = phản hồi sai loại nên bị từ chối thay vì mở nhầm phòng. Kiểm những gì editor cũng kiểm (ws/wss, `<kind>:<24 hex>`, màu `#RRGGBB`) để lỗi hiện ở tầng app với câu dễ hiểu
 * thay vì thành "kết nối rớt" sau khi `init` bị WebView từ chối. Thiếu `expiresAt` thì đọc `exp` trong JWT (chỉ để lên lịch làm mới —
 * chữ ký do server kiểm, app không xác minh).
 */
export function parseCollabGrant(raw: unknown, kind: CollabKind = 'doc'): CollabGrant | null {
  if (!isObj(raw)) return null;
  const { documentName, mode, token, url, user } = raw;
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_CHARS)
    return null;
  if (typeof documentName !== 'string' || !NAME_RE[kind].test(documentName)) return null;
  if (mode !== 'edit' && mode !== 'view') return null;
  if (typeof url !== 'string' || !/^wss?:\/\/[^\s/]+/i.test(url)) return null;
  if (!isObj(user)) return null;
  const { color, id, name } = user;
  if (typeof id !== 'string' || !id || typeof name !== 'string') return null;
  if (typeof color !== 'string' || !COLOR_RE.test(color)) return null;

  const exp = decodeJwtPayload<{ exp?: unknown }>(token)?.exp;
  const expiresAt =
    toEpochMs(raw['expiresAt']) ?? (typeof exp === 'number' ? toEpochMs(exp) : undefined);
  if (expiresAt === undefined) return null;

  const limits = raw['limits'];
  const max = isObj(limits) ? limits['stateMaxBytes'] : undefined;
  const elementsMax = isObj(limits) ? limits['elementsMax'] : undefined;
  return {
    documentName,
    expiresAt,
    mode,
    token,
    url,
    user: { color, id, name },
    ...(typeof max === 'number' && Number.isInteger(max) && max > 0 ? { stateMaxBytes: max } : {}),
    // Trần số phần tử của bảng trắng (`limits.elementsMax`); tài liệu không có khoá này.
    ...(typeof elementsMax === 'number' && Number.isInteger(elementsMax) && elementsMax > 0
      ? { elementsMax }
      : {}),
  };
}

/** Còn ít nhất `skewMs` nữa mới hết hạn? Dùng để quyết "dùng lại bản đang giữ" hay "xin mới". */
export function isGrantFresh(
  grant: Pick<CollabGrant, 'expiresAt'>,
  now: number,
  skewMs = COLLAB_REFRESH_SKEW_MS,
): boolean {
  return grant.expiresAt - now > skewMs;
}

/** Bao lâu nữa nên làm mới: `expiresAt − skew − now`, không dưới `MIN_REFRESH_DELAY_MS`. */
export function refreshDelayMs(
  expiresAt: number,
  now: number,
  skewMs = COLLAB_REFRESH_SKEW_MS,
): number {
  return Math.max(expiresAt - skewMs - now, MIN_REFRESH_DELAY_MS);
}
