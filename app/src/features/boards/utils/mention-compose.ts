/**
 * Nhắc tên trong bình luận — bản TỐI THIỂU CỤC BỘ của p3-03.
 *
 * Vì sao không dùng lại `MentionPicker`/`useComposerText` của `features/chat` (p1-04/p1-06): chúng
 * nằm TRONG feature `chat` và gắn với scope kênh/hội thoại; luật "không import chéo feature"
 * (`feature-structure.md`) chỉ cho `channels`/`conversations`/`threads` nhập `chat`. Nên ở đây chỉ
 * dựng phần bình luận thẻ cần: gõ `@` → gợi ý thành viên bảng → chèn `@Tên`. Khi `shared/` có bộ
 * mention dùng chung thì thay file này (không đổi hợp đồng BE).
 *
 * Mô hình: ô nhập giữ CHỮ THƯỜNG (`@Lan `), danh sách `picks` (userId + tên) đứng ngoài. Lúc gửi mới
 * đổi `@Lan` → marker `@{u:<24 hex>}` (đúng token của `be/src/modules/mentions/mention.parser.ts`,
 * p1-06) và dựng `mentions[] = [{ type: 'USER', targetId }]` KHỬ TRÙNG. Sửa chữ làm tên không còn
 * khớp (`@Laan`) thì lời nhắc tự rơi thành chữ thường — không cần bám vị trí (range) như chat.
 */

export interface MentionPick {
  label: string;
  userId: string;
}

/** ZWSP viết bằng số: Prettier đổi escape unicode thành ký tự vô hình ngay trong mã. */
export const ZWSP = String.fromCodePoint(0x200b);
/** Phần SAU `@` của marker thật — dùng để phá marker GIẢ do người dùng tự gõ. */
const MARKER_BODY = /^\{(?:u:[0-9a-fA-F]{24}|all|r:(?:ADMIN|MEMBER))\}/;
const MAX_QUERY_LENGTH = 30;

export interface MentionTrigger {
  /** Vị trí ký tự `@` — điểm bắt đầu đoạn sẽ bị thay bằng `@Tên `. */
  start: number;
  query: string;
}

/**
 * Con trỏ đang ở trong `@từ-khoá` dở dang không? Hàm THUẦN suy từ `(text, cursor)` — không có state
 * "picker đang mở": xoá `@` hay dời con trỏ là tự đóng, và không bao giờ ghi ngược vào ô nhập lúc bộ
 * gõ tiếng Việt còn đang ghép dấu. `a@b.com` không mở (trước `@` phải là đầu chuỗi/khoảng trắng).
 */
export function findMentionTrigger(
  text: string,
  cursor: number,
  picks: readonly MentionPick[],
): MentionTrigger | null {
  for (let i = cursor - 1; i >= 0 && cursor - i - 1 <= MAX_QUERY_LENGTH; i -= 1) {
    const ch = text[i];
    if (ch === '\n') return null;
    if (ch !== '@') continue;
    const before = i === 0 ? undefined : text[i - 1];
    if (before !== undefined && !/\s/.test(before)) return null;
    if (picks.some((pick) => text.startsWith(`@${pick.label}`, i))) return null;
    const query = text.slice(i + 1, cursor);
    if (/^\s/.test(query) || /\s\s/.test(query)) return null;
    return { query, start: i };
  }
  return null;
}

/** Tên chưa trùng: hai người cùng tên hiển thị thì người sau thành `Tên (2)` để `@Tên` luôn chỉ một người. */
export function uniqueLabel(label: string, picks: readonly MentionPick[], userId: string): string {
  const taken = new Set(picks.filter((pick) => pick.userId !== userId).map((pick) => pick.label));
  if (!taken.has(label)) return label;
  let n = 2;
  while (taken.has(`${label} (${n})`)) n += 1;
  return `${label} (${n})`;
}

/** Thay `[trigger.start, cursor)` bằng `@Tên ` và trả text + vị trí con trỏ mới + danh sách pick đã cập nhật. */
export function insertMention(
  text: string,
  trigger: MentionTrigger,
  cursor: number,
  user: { id: string; name: string },
  picks: readonly MentionPick[],
): { cursor: number; picks: MentionPick[]; text: string } {
  const label = uniqueLabel(user.name, picks, user.id);
  const token = `@${label} `;
  const nextPicks = [
    ...picks.filter((pick) => pick.userId !== user.id),
    { label, userId: user.id },
  ];
  return {
    cursor: trigger.start + token.length,
    picks: nextPicks,
    text: text.slice(0, trigger.start) + token + text.slice(cursor),
  };
}

const isBoundaryBefore = (ch: string | undefined): boolean => ch === undefined || /[\s(]/.test(ch);
const isBoundaryAfter = (ch: string | undefined): boolean =>
  ch === undefined || /[\s.,;:!?)\]}]/.test(ch);

/**
 * Chữ hiển thị + picks → `content` gửi BE + `mentions[]` (khử trùng — mỗi người MỘT mục) + các pick
 * thật sự còn xuất hiện. `@{u:…}` do người dùng TỰ GÕ bị chèn ZWSP để BE không đọc nhầm thành lời nhắc.
 */
export function serializeMentions(
  text: string,
  picks: readonly MentionPick[],
): { content: string; mentions: { targetId: string; type: 'USER' }[]; used: MentionPick[] } {
  const byLength = [...picks].sort((a, b) => b.label.length - a.label.length);
  const used = new Map<string, MentionPick>();
  let content = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      const pick = byLength.find(
        (item) =>
          text.startsWith(`@${item.label}`, i) &&
          isBoundaryBefore(text[i - 1]) &&
          isBoundaryAfter(text[i + 1 + item.label.length]),
      );
      if (pick) {
        used.set(pick.userId, pick);
        content += `@{u:${pick.userId}}`;
        i += 1 + pick.label.length;
        continue;
      }
      content += MARKER_BODY.test(text.slice(i + 1)) ? `@${ZWSP}` : '@';
      i += 1;
      continue;
    }
    content += text[i];
    i += 1;
  }
  return {
    content,
    mentions: [...used.keys()].map((targetId) => ({ targetId, type: 'USER' as const })),
    used: [...used.values()],
  };
}
