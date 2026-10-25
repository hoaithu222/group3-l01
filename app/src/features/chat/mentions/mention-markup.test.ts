import type { MentionRange, MessageMention } from '../api/chat.types';
import {
  mentionsToPlainText,
  parseMentions,
  serializeMentions,
  splitMarkers,
  toMentionInputs,
} from './mention-markup';

const MINH = '507f1f77bcf86cd799439011';
const AN = '507f1f77bcf86cd799439022';

const minhRange = (start: number): MentionRange => ({
  start,
  end: start + 5,
  type: 'USER',
  userId: MINH,
  label: 'Minh',
});

describe('splitMarkers', () => {
  it('tách marker @{u:id} và @{all} khỏi chữ thường, giữ thứ tự', () => {
    const segments = splitMarkers(`Chào @{u:${MINH}} và @{all}!`);
    expect(segments.map((s) => (s.kind === 'text' ? s.text : s.raw))).toEqual([
      'Chào ',
      `@{u:${MINH}}`,
      ' và ',
      '@{all}',
      '!',
    ]);
    expect(segments[1]).toMatchObject({ kind: 'mention', type: 'USER', targetId: MINH });
    expect(segments[3]).toMatchObject({ kind: 'mention', type: 'ALL', targetId: null });
  });

  it('marker sai dạng (id ngắn) giữ như chữ thường — BE cũng vậy, không lỗi', () => {
    expect(splitMarkers('@{u:xyz} @{x}')).toEqual([{ kind: 'text', text: '@{u:xyz} @{x}' }]);
  });
});

describe('serializeMentions / parseMentions', () => {
  it('serialize thay chip bằng marker; mentions[] mang nhãn ảnh chụp', () => {
    const { content, mentions } = serializeMentions('Chào @Minh ơi', [minhRange(5)]);
    expect(content).toBe(`Chào @{u:${MINH}} ơi`);
    expect(mentions).toEqual([{ type: 'USER', targetId: MINH, label: 'Minh' }]);
  });

  it('hai chip cùng một người → marker lặp nhưng mentions[] chỉ MỘT mục (BE bắt khớp 1-1, trùng là MISMATCH)', () => {
    const text = '@Minh @Minh';
    const { content, mentions } = serializeMentions(text, [minhRange(0), minhRange(6)]);
    expect(content).toBe(`@{u:${MINH}} @{u:${MINH}}`);
    expect(mentions).toHaveLength(1);
  });

  it('@all không có targetId trong mentions[]', () => {
    const range: MentionRange = { start: 0, end: 7, type: 'ALL', label: 'Tất cả' };
    expect(serializeMentions('@Tất cả', [range])).toEqual({
      content: '@{all}',
      mentions: [{ type: 'ALL', targetId: null, label: 'Tất cả' }],
    });
  });

  it('chữ người dùng tự gõ trông như marker bị phá bằng ZWSP — không thành mention giả', () => {
    const { content, mentions } = serializeMentions(`giả @{u:${AN}} nhé`, []);
    expect(content).not.toContain(`@{u:${AN}}`);
    expect(mentions).toEqual([]);
    expect(parseMentions(content, []).text).toBe(`giả @{u:${AN}} nhé`);
  });

  it('parse là ngược của serialize (vòng đầy đủ), tên lấy từ mentions[].label', () => {
    const text = 'Chào @Minh và @Tất cả';
    const ranges: MentionRange[] = [
      minhRange(5),
      { start: 14, end: 21, type: 'ALL', label: 'Tất cả' },
    ];
    const { content, mentions } = serializeMentions(text, ranges);
    expect(parseMentions(content, mentions)).toEqual({ text, ranges });
  });

  it('parse: người không có nhãn → "@người dùng", tuyệt đối không in id', () => {
    const { text } = parseMentions(`Hi @{u:${AN}}`, []);
    expect(text).toBe('Hi @người dùng');
    expect(text).not.toContain(AN);
  });
});

describe('toMentionInputs', () => {
  it('bỏ label và để VẮNG MẶT targetId cho @all (null làm Zod BE từ chối cả request)', () => {
    const mentions: MessageMention[] = [
      { type: 'USER', targetId: MINH, label: 'Minh' },
      { type: 'ALL', targetId: null, label: null },
    ];
    const inputs = toMentionInputs(mentions);
    expect(inputs).toEqual([{ type: 'USER', targetId: MINH }, { type: 'ALL' }]);
    expect(inputs?.[1]).not.toHaveProperty('targetId');
  });

  it('không có mentions thì không gửi khoá nào', () => {
    expect(toMentionInputs(undefined)).toBeUndefined();
  });
});

describe('mentionsToPlainText (TH-07)', () => {
  const mentions: MessageMention[] = [{ type: 'USER', targetId: MINH, label: 'Minh cũ' }];
  const content = `Nhờ @{u:${MINH}} xem`;

  it('tên HIỆN TẠI theo userId thắng nhãn ảnh chụp lúc gửi', () => {
    expect(mentionsToPlainText(content, mentions, () => 'Minh mới')).toBe('Nhờ @Minh mới xem');
  });

  it('chưa tra được tên thì dùng nhãn ảnh chụp; không có nốt thì "người dùng"', () => {
    expect(mentionsToPlainText(content, mentions)).toBe('Nhờ @Minh cũ xem');
    expect(mentionsToPlainText(content, [])).toBe('Nhờ @người dùng xem');
  });

  it('@all → "@Tất cả"', () => {
    expect(mentionsToPlainText('@{all} họp', [])).toBe('@Tất cả họp');
  });
});
