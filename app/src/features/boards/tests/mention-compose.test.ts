import {
  findMentionTrigger,
  insertMention,
  serializeMentions,
  uniqueLabel,
  ZWSP,
  type MentionPick,
} from '../utils/mention-compose';
import { parseForEdit, splitContent } from '../utils/mention-content';

const LAN = 'a'.repeat(24);
const MINH = 'b'.repeat(24);

describe('findMentionTrigger', () => {
  it('mở khi gõ @ sau khoảng trắng/đầu dòng và trả từ khoá đã gõ', () => {
    expect(findMentionTrigger('@La', 3, [])).toEqual({ query: 'La', start: 0 });
    expect(findMentionTrigger('Nhờ @Mi', 7, [])).toEqual({ query: 'Mi', start: 4 });
  });

  it('không mở với e-mail, khoảng trắng ngay sau @, hai dấu cách, hay xuống dòng', () => {
    expect(findMentionTrigger('a@b.com', 7, [])).toBeNull();
    expect(findMentionTrigger('@ Lan', 5, [])).toBeNull();
    expect(findMentionTrigger('@Lan  x', 7, [])).toBeNull();
    expect(findMentionTrigger('@Lan\nxin', 8, [])).toBeNull();
  });

  it('không mở lại trên một lời nhắc đã chọn', () => {
    const picks: MentionPick[] = [{ label: 'Lan Anh', userId: LAN }];
    expect(findMentionTrigger('@Lan Anh ', 9, picks)).toBeNull();
  });
});

describe('insertMention + serializeMentions', () => {
  it('chèn "@Tên " thay đoạn đang gõ rồi đổi thành marker @{u:id} khi gửi', () => {
    const trigger = findMentionTrigger('Nhờ @Mi', 7, []);
    if (!trigger) throw new Error('phải có trigger');
    const inserted = insertMention('Nhờ @Mi', trigger, 7, { id: MINH, name: 'Minh' }, []);
    expect(inserted.text).toBe('Nhờ @Minh ');
    expect(inserted.cursor).toBe(10);

    const sent = serializeMentions(`${inserted.text}xem giúp`, inserted.picks);
    expect(sent.content).toBe(`Nhờ @{u:${MINH}} xem giúp`);
    expect(sent.mentions).toEqual([{ targetId: MINH, type: 'USER' }]);
  });

  it('cùng một người nhắc hai lần chỉ có MỘT mục trong mentions[] (BE đối chiếu 1-1 marker ↔ mentions)', () => {
    const picks = [{ label: 'Lan', userId: LAN }];
    const sent = serializeMentions('@Lan ơi, @Lan xem nhé', picks);
    expect(sent.content).toBe(`@{u:${LAN}} ơi, @{u:${LAN}} xem nhé`);
    expect(sent.mentions).toHaveLength(1);
  });

  it('sửa chữ làm tên không còn khớp thì lời nhắc rơi về chữ thường; tên là tiền tố của chữ dài hơn cũng không khớp', () => {
    const picks = [{ label: 'Lan', userId: LAN }];
    expect(serializeMentions('@Laan xem', picks)).toMatchObject({ content: '@Laan xem', mentions: [] });
    expect(serializeMentions('@Lanh xem', picks).mentions).toEqual([]);
    expect(serializeMentions('a@Lan xem', picks).mentions).toEqual([]);
  });

  it('tên dài thắng tên ngắn là tiền tố của nó; marker do người dùng tự gõ bị phá bằng ZWSP', () => {
    const picks = [
      { label: 'An', userId: LAN },
      { label: 'An Bình', userId: MINH },
    ];
    expect(serializeMentions('@An Bình ok', picks).mentions).toEqual([{ targetId: MINH, type: 'USER' }]);

    const typed = serializeMentions(`giả mạo @{u:${LAN}}`, []);
    expect(typed.content).toBe(`giả mạo @${ZWSP}{u:${LAN}}`);
    expect(typed.mentions).toEqual([]);
  });

  it('hai người trùng tên hiển thị: người sau thành "Tên (2)" để @Tên luôn chỉ một người', () => {
    expect(uniqueLabel('Lan', [{ label: 'Lan', userId: LAN }], MINH)).toBe('Lan (2)');
    expect(uniqueLabel('Lan', [{ label: 'Lan', userId: LAN }], LAN)).toBe('Lan');
  });
});

describe('splitContent + parseForEdit', () => {
  it('tách marker khỏi chữ (không lộ marker thô) và trả lại @{ nguyên văn từ ZWSP', () => {
    expect(splitContent(`Chào @{u:${LAN}}, ok`)).toEqual([
      { kind: 'text', text: 'Chào ' },
      { kind: 'mention', userId: LAN },
      { kind: 'text', text: ', ok' },
    ]);
    expect(splitContent(`@${ZWSP}{u:x}`)).toEqual([{ kind: 'text', text: '@{u:x}' }]);
  });

  it('nạp bình luận cũ vào ô sửa rồi gửi lại ra đúng nội dung ban đầu', () => {
    const original = `Nhờ @{u:${MINH}} xem`;
    const loaded = parseForEdit(original, (id) => (id === MINH ? 'Minh' : undefined));
    expect(loaded.text).toBe('Nhờ @Minh xem');
    expect(serializeMentions(loaded.text, loaded.picks).content).toBe(original);
  });
});
