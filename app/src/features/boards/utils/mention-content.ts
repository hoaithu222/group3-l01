import { uniqueLabel, ZWSP, type MentionPick } from './mention-compose';

const USER_MARKER = /@\{u:([0-9a-fA-F]{24})\}/g;

export type ContentSegment = { kind: 'mention'; userId: string } | { kind: 'text'; text: string };

const unescapePlain = (text: string): string => text.split(`@${ZWSP}{`).join('@{');

/** `content` từ BE → đoạn chữ + đoạn nhắc tên (để vẽ chip) — không bao giờ để lộ marker thô. */
export function splitContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(USER_MARKER)) {
    const index = match.index ?? 0;
    if (index > last)
      segments.push({ kind: 'text', text: unescapePlain(content.slice(last, index)) });
    segments.push({ kind: 'mention', userId: match[1] ?? '' });
    last = index + match[0].length;
  }
  if (last < content.length)
    segments.push({ kind: 'text', text: unescapePlain(content.slice(last)) });
  return segments;
}

/** Nạp bình luận cũ vào ô sửa: marker → `@Tên` + picks (tên: ảnh chụp trong `mentions[].label`, hoặc tra được). */
export function parseForEdit(
  content: string,
  resolveLabel: (userId: string) => string | undefined,
): { picks: MentionPick[]; text: string } {
  const picks: MentionPick[] = [];
  let text = '';
  for (const segment of splitContent(content)) {
    if (segment.kind === 'text') {
      text += segment.text;
      continue;
    }
    const label = uniqueLabel(resolveLabel(segment.userId) ?? 'người dùng', picks, segment.userId);
    text += `@${label}`;
    if (!picks.some((pick) => pick.userId === segment.userId))
      picks.push({ label, userId: segment.userId });
  }
  return { picks, text };
}
