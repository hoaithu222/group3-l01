import type { MentionInput, MentionRange, MentionType, MessageMention } from '../api/chat.types';
import { isMentionRoleRef, mentionTargetKey, roleMentionLabel } from './mention-role';

/**
 * Marker nhắc tên trong `content` gửi/nhận từ server — KHỚP đúng parser BE
 * (`be/src/modules/mentions/mention.parser.ts`): `@{u:<userId 24-hex>}` ·
 * `@{all}` · `@{r:ADMIN|MEMBER}` (`@role` p3-04: chỉ ở KÊNH và chỉ OWNER/ADMIN — picker
 * chỉ mời chọn khi `mentionables.canMentionRole`; BE từ chối chỗ khác bằng `MSG_008
 * ROLE_NOT_SUPPORTED`/`PERM_006`). Không để lộ marker thô ra chữ ở bất kỳ nơi nào.
 *
 * Marker sai dạng (`@{u:xyz}`) BE giữ như văn bản thường; ở đây cũng vậy.
 */
const MARKER_SOURCE = '@\\{u:([0-9a-fA-F]{24})\\}|@\\{all\\}|@\\{r:(ADMIN|MEMBER)\\}';
/** Phần SAU dấu `@` của marker — dùng làm lookahead khi phá marker giả (`escapePlain`). */
const MARKER_BODY_SOURCE = '\\{(?:u:[0-9a-fA-F]{24}|all|r:(?:ADMIN|MEMBER))\\}';
/** Nhãn hiển thị của `@{all}` — cả ở composer lẫn bong bóng. */
export const ALL_LABEL = 'Tất cả';
export const UNKNOWN_USER_LABEL = 'người dùng';
/** `@` + ZWSP + `{`: phá marker giả do NGƯỜI DÙNG tự gõ (BE sẽ coi là marker thật và trả `MSG_008 MISMATCH`). */
const ZWSP = String.fromCodePoint(0x200b); // viết bằng số: Prettier đổi escape unicode thành ký tự vô hình ngay trong mã

export type MarkerSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; type: MentionType; targetId: string | null; raw: string };

/** Tách `content` thành đoạn chữ + marker, theo thứ tự xuất hiện. */
export function splitMarkers(content: string): MarkerSegment[] {
  if (!content.includes('@{')) return [{ kind: 'text', text: content }];
  const segments: MarkerSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(new RegExp(MARKER_SOURCE, 'g'))) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: 'text', text: content.slice(last, index) });
    const raw = match[0];
    if (match[1]) segments.push({ kind: 'mention', type: 'USER', targetId: match[1], raw });
    else if (match[2]) segments.push({ kind: 'mention', type: 'ROLE', targetId: match[2], raw });
    else segments.push({ kind: 'mention', type: 'ALL', targetId: null, raw });
    last = index + raw.length;
  }
  if (last < content.length) segments.push({ kind: 'text', text: content.slice(last) });
  return segments;
}

/** Chữ thường người dùng gõ mà TRÔNG như marker → chèn ZWSP để server không đọc nhầm thành mention. */
function escapePlain(text: string): string {
  return text.replace(new RegExp(`@(?=${MARKER_BODY_SOURCE})`, 'g'), `@${ZWSP}`);
}

function markerOf(range: MentionRange): string {
  if (range.type === 'ALL') return '@{all}';
  return range.type === 'ROLE' ? `@{r:${range.roleRef ?? ''}}` : `@{u:${range.userId ?? ''}}`;
}

/**
 * Text hiển thị + các cụm nhắc tên → `content` gửi server + `mentions[]` (đã khử
 * trùng: BE bắt buộc khớp 1-1 giữa marker DISTINCT và `mentions[]`, hai chip cùng
 * một người chỉ được có MỘT mục — nếu không là `MSG_008 MISMATCH`).
 */
export function serializeMentions(
  text: string,
  ranges: MentionRange[],
): { content: string; mentions: MessageMention[] } {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const seen = new Set<string>();
  const mentions: MessageMention[] = [];
  let content = '';
  let cursor = 0;
  for (const range of sorted) {
    content += escapePlain(text.slice(cursor, range.start)) + markerOf(range);
    cursor = range.end;
    const key = mentionTargetKey(range);
    if (seen.has(key)) continue;
    seen.add(key);
    // ROLE: `targetId` là "ADMIN"|"MEMBER" (BE lưu ở `roleRef`, API vẫn trả `targetId`).
    const targetId = range.type === 'ROLE' ? range.roleRef : range.userId;
    mentions.push({ type: range.type, targetId: targetId ?? null, label: range.label });
  }
  return { content: content + escapePlain(text.slice(cursor)), mentions };
}

/** Ngược của `serializeMentions` — nạp tin cũ vào composer khi SỬA (tên lấy từ `mentions[].label`, ảnh chụp lúc gửi). */
export function parseMentions(
  content: string,
  mentions: MessageMention[],
): { text: string; ranges: MentionRange[] } {
  let text = '';
  const ranges: MentionRange[] = [];
  for (const segment of splitMarkers(content)) {
    if (segment.kind === 'text') {
      text += segment.text.split(`@${ZWSP}{`).join('@{');
    } else {
      // ROLE phải thành chip khi nạp tin cũ để SỬA: để nguyên marker thô thì `escapePlain` phá nó thành chữ thường và mất mention.
      const label =
        segment.type === 'ALL'
          ? ALL_LABEL
          : segment.type === 'ROLE'
            ? roleMentionLabel(segment.targetId, mentions)
            : (mentions.find((m) => m.type === 'USER' && m.targetId === segment.targetId)?.label ??
              UNKNOWN_USER_LABEL);
      const token = `@${label}`;
      ranges.push({
        start: text.length,
        end: text.length + token.length,
        type: segment.type,
        label,
        ...(segment.type === 'USER' && { userId: segment.targetId ?? undefined }),
        ...(segment.type === 'ROLE' &&
          isMentionRoleRef(segment.targetId) && { roleRef: segment.targetId }),
      });
      text += token;
    }
  }
  return { text, ranges };
}

/** `MessageMention[]` → dạng DTO gửi lên (`targetId` phải VẮNG MẶT, không phải `null`, và không có `label`). */
export function toMentionInputs(
  mentions: MessageMention[] | undefined,
): MentionInput[] | undefined {
  return mentions?.map((m) =>
    m.targetId ? { type: m.type, targetId: m.targetId } : { type: m.type },
  );
}

/**
 * Nội dung → chữ thuần cho chỗ KHÔNG dựng được chip (sao chép, xem trước, nhãn
 * trợ năng, trích dẫn). `resolveName` (tên HIỆN TẠI theo userId) thắng nhãn ảnh
 * chụp; không có cả hai thì `@người dùng` — tuyệt đối không in id ra màn hình.
 */
export function mentionsToPlainText(
  content: string,
  mentions: MessageMention[] = [],
  resolveName?: (userId: string) => string | undefined,
): string {
  return splitMarkers(content)
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      if (segment.type === 'ALL') return `@${ALL_LABEL}`;
      if (segment.type === 'ROLE') return `@${roleMentionLabel(segment.targetId, mentions)}`;
      const snapshot = mentions.find(
        (m) => m.type === 'USER' && m.targetId === segment.targetId,
      )?.label;
      return `@${(segment.targetId && resolveName?.(segment.targetId)) || snapshot || UNKNOWN_USER_LABEL}`;
    })
    .join('');
}
