import { MEETING_CODE_REGEX } from '@/features/meetings/utils/meeting-link';

import type { DeepLinkIntent } from './deep-link.types';

/** Một đoạn đường dẫn/mã an toàn: chữ-số, `_`, `-`. Cấm `%`, `.`, `/`, khoảng trắng — không giải mã, không lọt `..`. */
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const MAX_URL_LENGTH = 2048;
const URL_SHAPE = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/;

export interface ParseDeepLinkOptions {
  /**
   * Chỉ nhận `http(s)` của các miền này (không phân biệt hoa/thường). Bỏ trống = nhận mọi miền — đúng với link do HỆ
   * ĐIỀU HÀNH giao (đã xác minh app link). ⛔ Link BẤM TRONG app (tin nhắn, ghi chú) phải truyền miền của app: link
   * `https://ke-xau.com/invite/x` không được coi là lời mời của ta.
   */
  hosts?: readonly string[];
  /** Chỉ nhận các scheme riêng này (`superapp`). Bỏ trống = mọi scheme không phải `http(s)`. */
  schemes?: readonly string[];
}

interface UrlParts {
  segments: string[];
  query: URLSearchParams;
}

const includesIgnoreCase = (list: readonly string[], value: string): boolean =>
  list.some((item) => item.toLowerCase() === value.toLowerCase());

function splitUrl(rawUrl: string, options: ParseDeepLinkOptions): UrlParts | null {
  const url = rawUrl.trim();
  if (url.length === 0 || url.length > MAX_URL_LENGTH) return null;

  const match = URL_SHAPE.exec(url);
  if (!match) return null;
  const [, scheme = '', authority = '', rawPath = '', rawQuery = ''] = match;

  let path: string;
  if (/^https?$/i.test(scheme)) {
    // `user@host:port` là dấu hiệu lừa host — chỉ nhận host trơn.
    if (!/^[A-Za-z0-9.-]+$/.test(authority)) return null;
    if (options.hosts && !includesIgnoreCase(options.hosts, authority)) return null;
    path = rawPath;
  } else {
    if (options.schemes && !includesIgnoreCase(options.schemes, scheme)) return null;
    // Scheme riêng: `superapp://invite/abc` — "host" chính là đoạn đầu của đường dẫn.
    path = `/${authority}${rawPath}`;
  }

  // Bỏ `/` cuối; đoạn rỗng ở GIỮA (`//`) không qua được `SEGMENT` nên bị từ chối.
  const segments = path.replace(/\/+$/, '').split('/').slice(1);
  if (segments.length === 0 || !segments.every((part) => SEGMENT.test(part))) return null;
  return { query: new URLSearchParams(rawQuery), segments };
}

/** Chỉ tham số `m` (id tin nhắn) được giữ, và phải là một đoạn an toàn — mọi tham số khác bị bỏ. */
function messageIdOf(query: URLSearchParams): { messageId?: string } {
  const value = query.get('m');
  return value && SEGMENT.test(value) ? { messageId: value } : {};
}

/**
 * Liên kết → ý định điều hướng, hoặc `null` (link lạ / hỏng ⇒ nơi gọi mở màn chính, KHÔNG crash). Hàm THUẦN.
 * Bảng các dạng hợp lệ: `deep-link.types.ts`.
 */
export function parseDeepLink(
  url: string,
  options: ParseDeepLinkOptions = {},
): DeepLinkIntent | null {
  const parts = splitUrl(url, options);
  if (!parts) return null;
  const [head, first, second, third] = parts.segments;
  const count = parts.segments.length;
  const message = messageIdOf(parts.query);

  if (head === 'invite' && first) {
    if (count === 2) return { code: first, kind: 'LINK', type: 'INVITE' };
    if (count === 3 && first === 'e' && second)
      return { code: second, kind: 'EMAIL', type: 'INVITE' };
    return null;
  }

  if (head === 'm' && first && count === 2) {
    const code = first.toLowerCase();
    if (MEETING_CODE_REGEX.test(code)) return { code, type: 'MEETING_CODE' };
    // Link hội thoại cũ (p1-05): `/m/<ObjectId>` — D-29 chia sẻ đường dẫn `/m/` cho cả hai thứ.
    if (OBJECT_ID.test(first)) return { conversationId: first, type: 'CONVERSATION', ...message };
    return null;
  }

  if (head === 'c' && first && count === 2) {
    return { conversationId: first, type: 'CONVERSATION', ...message };
  }

  if (head === 'w' && first && second === 'c' && third && count === 4) {
    return { chId: third, type: 'MESSAGE_LINK', wsId: first, ...message };
  }

  if (head === 'call' && first && count === 2) return { callId: first, type: 'CALL' };

  return null;
}
