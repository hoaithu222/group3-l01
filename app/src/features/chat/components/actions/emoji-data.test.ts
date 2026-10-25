import { EMOJI_GROUPS } from './emoji-data.constants';

/**
 * Bản chép của `isValidEmoji` phía BE
 * (`be/src/modules/messages/services/message-interaction.service.ts`) — cố ý CHÉP LẠI chứ không import
 * (khác package). Bảng emoji của picker phải qua được đúng luật này, nếu không người dùng thả cảm xúc
 * rồi nhận `MSG_013`. BE đổi luật thì bản chép này phải đổi theo.
 */
// Xét từng code point bằng SỐ thay vì regex/ký tự chèn thẳng vào mã: Prettier đổi escape unicode thành chính ký tự vô hình đó
// (không đọc được, dễ bị trình soạn thảo xoá), còn lớp ký tự `[...]` gộp ZWJ/biến thể/khung màu da thì ESLint
// `no-misleading-character-class` chặn (đúng — chúng "dính" vào ký tự đứng trước).
const KEYCAP = 0x20e3;
const STANDALONE_MODIFIERS = new Set([0x200d, 0xfe0e, 0xfe0f, KEYCAP]); // ZWJ, VS15, VS16, khung keycap

function isEmojiModifier(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  const isSkinTone = code >= 0x1f3fb && code <= 0x1f3ff;
  const isRegionalIndicator = code >= 0x1f1e6 && code <= 0x1f1ff;
  return STANDALONE_MODIFIERS.has(code) || isSkinTone || isRegionalIndicator;
}

function isValidEmojiLikeBackend(input: string): boolean {
  if (input.length === 0 || input.length > 32) return false;
  const graphemes = Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(input));
  if (graphemes.length !== 1) return false;
  const codePoints = Array.from(input);
  const hasPictographic = codePoints.some((c) => /\p{Extended_Pictographic}/u.test(c));
  const isFlagPair =
    codePoints.length === 2 && codePoints.every((c) => /\p{Regional_Indicator}/u.test(c));
  const isKeycap = codePoints.some((c) => c.codePointAt(0) === KEYCAP);
  if (!hasPictographic && !isFlagPair && !isKeycap) return false;
  return codePoints.every(
    (c) => /\p{Extended_Pictographic}/u.test(c) || isEmojiModifier(c) || /[0-9#*]/.test(c),
  );
}

describe('EMOJI_GROUPS — bảng emoji của EmojiPickerSheet', () => {
  const all = EMOJI_GROUPS.flatMap((g) => g.emojis);

  it('mọi emoji là ĐÚNG MỘT grapheme và qua luật isValidEmoji của BE (không có MSG_013 chờ sẵn)', () => {
    const invalid = all.filter((e) => !isValidEmojiLikeBackend(e));
    expect(invalid).toEqual([]);
  });

  it('không trùng emoji giữa các nhóm (hai ô cùng ra một cảm xúc)', () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it('bảng đủ dùng: hơn 100 emoji và không nhóm nào rỗng', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const group of EMOJI_GROUPS) expect(group.emojis.length).toBeGreaterThan(0);
  });

  it('bộ nhanh 6 emoji đều có mặt trong picker (không cần quay lại thanh nhanh để chọn lại)', () => {
    for (const quick of ['👍', '❤️', '😆', '😮', '😢', '🙏']) expect(all).toContain(quick);
  });
});
