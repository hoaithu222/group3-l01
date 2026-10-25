import type { MentionRange } from '../api/chat.types';
import { mentionsToPlainText } from './mention-markup';
import { countDistinctMentions } from './mention-range-helpers';
import { insertMention } from './mention-ranges';
import { mentionTargetKey, roleAudienceNotice, roleMentionLabel } from './mention-role';

/**
 * `@role` (p3-04 app.md §3): client sinh marker `@{r:ADMIN|MEMBER}` khớp parser BE (`mention.parser.ts`) và `mentions[]` khớp 1-1 với marker
 * DISTINCT (`MSG_008 MISMATCH` nếu lệch). Nhãn hiển thị không bao giờ để lộ `ADMIN`/`MEMBER` thô.
 */
const role = (start: number, roleRef: 'ADMIN' | 'MEMBER', label: string): MentionRange => ({
  start,
  end: start + label.length + 1,
  label,
  recipientCount: 8,
  roleRef,
  type: 'ROLE',
});

describe('nhãn và chữ thuần', () => {
  it('roleMentionLabel: ảnh chụp trên tin thắng bảng dự phòng; lạ → "vai trò"', () => {
    expect(
      roleMentionLabel('ADMIN', [{ type: 'ROLE', targetId: 'ADMIN', label: 'Ban quản trị' }]),
    ).toBe('Ban quản trị');
    expect(roleMentionLabel('ADMIN')).toBe('Quản trị viên');
    expect(roleMentionLabel('OWNER')).toBe('vai trò');
    expect(roleMentionLabel(null)).toBe('vai trò');
  });

  it('mentionsToPlainText (sao chép, trích dẫn, xem trước): @Quản trị viên, không lộ marker', () => {
    expect(mentionsToPlainText('Cc @{r:ADMIN}')).toBe('Cc @Quản trị viên');
  });
});

describe('đích phân biệt', () => {
  it('mentionTargetKey/countDistinctMentions: ADMIN ≠ MEMBER, cùng vai trò hai chip chỉ tính một', () => {
    expect(mentionTargetKey({ type: 'ROLE', roleRef: 'ADMIN' })).not.toBe(
      mentionTargetKey({ type: 'ROLE', roleRef: 'MEMBER' }),
    );
    expect(
      countDistinctMentions([
        role(0, 'ADMIN', 'Quản trị viên'),
        role(20, 'ADMIN', 'Quản trị viên'),
        role(40, 'MEMBER', 'Thành viên'),
      ]),
    ).toBe(2);
  });

  it('insertMention: chip vai trò giữ roleRef + recipientCount, con trỏ ra sau chip', () => {
    const out = insertMention(
      'Cc @qu',
      [],
      { start: 3, end: 6 },
      {
        label: 'Quản trị viên',
        recipientCount: 5,
        roleRef: 'ADMIN',
        type: 'ROLE',
      },
    );

    expect(out.text).toBe('Cc @Quản trị viên ');
    expect(out.ranges).toEqual([
      {
        start: 3,
        end: 17,
        type: 'ROLE',
        label: 'Quản trị viên',
        roleRef: 'ADMIN',
        recipientCount: 5,
      },
    ]);
    expect(out.cursor).toBe(18);
  });
});

describe('roleAudienceNotice', () => {
  it('có chip vai trò kèm số → "Sẽ thông báo cho khoảng N người"; chọn cả hai vai trò lấy tập LỚN hơn (ADMIN ⊂ MEMBER)', () => {
    expect(roleAudienceNotice([role(0, 'ADMIN', 'Quản trị viên')])).toBe(
      'Sẽ thông báo cho khoảng 8 người',
    );
    expect(
      roleAudienceNotice([
        { ...role(0, 'ADMIN', 'Quản trị viên'), recipientCount: 3 },
        { ...role(20, 'MEMBER', 'Thành viên'), recipientCount: 40 },
      ]),
    ).toBe('Sẽ thông báo cho khoảng 40 người');
  });

  it('không có chip vai trò, hoặc chip không có số (nạp từ tin đang sửa) → không nhắc', () => {
    expect(roleAudienceNotice([])).toBeUndefined();
    expect(roleAudienceNotice([{ type: 'USER' }])).toBeUndefined();
    expect(roleAudienceNotice([{ type: 'ROLE' }])).toBeUndefined();
  });
});
