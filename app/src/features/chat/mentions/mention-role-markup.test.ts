import type { MentionRange, MessageMention } from '../api/chat.types';
import { parseMentions, serializeMentions, toMentionInputs } from './mention-markup';

/**
 * `@role` (p3-04 app.md §3): client sinh marker `@{r:ADMIN|MEMBER}` khớp parser BE (`mention.parser.ts`) và `mentions[]` khớp 1-1 với marker
 * DISTINCT (`MSG_008 MISMATCH` nếu lệch); nạp lại tin cũ để SỬA thì marker thành chip, không thành chữ thô.
 */
const MINH = '507f1f77bcf86cd799439011';

const role = (start: number, roleRef: 'ADMIN' | 'MEMBER', label: string): MentionRange => ({
  start,
  end: start + label.length + 1,
  label,
  recipientCount: 8,
  roleRef,
  type: 'ROLE',
});

describe('serializeMentions — ROLE', () => {
  it('chip vai trò → marker @{r:…} và mentions[] {type:"ROLE", targetId:"ADMIN"} (không userId)', () => {
    const out = serializeMentions('Cc @Quản trị viên xem giúp', [
      role(3, 'ADMIN', 'Quản trị viên'),
    ]);

    expect(out.content).toBe('Cc @{r:ADMIN} xem giúp');
    expect(out.mentions).toEqual([{ type: 'ROLE', targetId: 'ADMIN', label: 'Quản trị viên' }]);
  });

  it('cùng một vai trò hai lần → marker 2 lần nhưng mentions[] CHỈ MỘT mục; ADMIN và MEMBER là hai đích khác nhau', () => {
    const text = '@Quản trị viên và @Quản trị viên và @Thành viên';
    const out = serializeMentions(text, [
      role(0, 'ADMIN', 'Quản trị viên'),
      role(18, 'ADMIN', 'Quản trị viên'),
      role(36, 'MEMBER', 'Thành viên'),
    ]);

    expect(out.content).toBe('@{r:ADMIN} và @{r:ADMIN} và @{r:MEMBER}');
    expect(out.mentions.map((m) => m.targetId)).toEqual(['ADMIN', 'MEMBER']);
  });

  it('trộn người + vai trò: mỗi loại giữ đúng đích', () => {
    const user: MentionRange = { start: 0, end: 5, label: 'Minh', type: 'USER', userId: MINH };
    const out = serializeMentions('@Minh @Thành viên', [user, role(6, 'MEMBER', 'Thành viên')]);

    expect(out.content).toBe(`@{u:${MINH}} @{r:MEMBER}`);
    expect(out.mentions).toEqual([
      { type: 'USER', targetId: MINH, label: 'Minh' },
      { type: 'ROLE', targetId: 'MEMBER', label: 'Thành viên' },
    ]);
  });

  it('DTO gửi lên: ROLE mang targetId "ADMIN" (BE `mentionInputSchema` nhận ADMIN|MEMBER cho ROLE), không có label', () => {
    const { mentions } = serializeMentions('@Quản trị viên', [role(0, 'ADMIN', 'Quản trị viên')]);

    expect(toMentionInputs(mentions)).toEqual([{ type: 'ROLE', targetId: 'ADMIN' }]);
  });
});

describe('parseMentions — nạp tin có @role để SỬA', () => {
  const stored: MessageMention[] = [{ type: 'ROLE', targetId: 'ADMIN', label: 'Quản trị viên' }];

  it('marker → chip vai trò (không để marker thô — escapePlain sẽ phá nó thành chữ thường và mất mention)', () => {
    const { text, ranges } = parseMentions('Cc @{r:ADMIN} nhé', stored);

    expect(text).toBe('Cc @Quản trị viên nhé');
    expect(ranges).toEqual([
      { start: 3, end: 17, type: 'ROLE', label: 'Quản trị viên', roleRef: 'ADMIN' },
    ]);
  });

  it('vòng tròn: parse rồi serialize ra ĐÚNG content và mentions cũ', () => {
    const content = 'Cc @{r:ADMIN} nhé';
    const parsed = parseMentions(content, stored);

    expect(serializeMentions(parsed.text, parsed.ranges)).toEqual({ content, mentions: stored });
  });

  it('tin không mang ảnh chụp nhãn → dùng bảng dự phòng, KHÔNG in "MEMBER" thô', () => {
    const { text } = parseMentions('@{r:MEMBER}', []);

    expect(text).toBe('@Thành viên');
  });
});
