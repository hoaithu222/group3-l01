import type { InboxItem } from '@/core/notifications';

import { buildActivityRows } from '../utils/group-by-day';

/** Nhãn nhóm ngày của danh sách Hoạt động: chèn ở chỗ đổi ngày, KHÔNG sắp lại thứ tự server, chỉ nhãn nhóm CÓ mục. */
function at(id: string, iso: string): InboxItem {
  return {
    actor: null,
    actorId: null,
    createdAt: iso,
    id,
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs: null,
    scopeId: null,
    scopeType: 'NONE',
    type: 'mention',
    unavailable: false,
    workspaceId: null,
  };
}

// 12h trưa giờ máy — tránh lệch ngày do múi giờ khi dựng ngày kề bên.
const NOW = new Date(2026, 8, 26, 12, 0, 0);
const local = (day: number, hour = 9) => new Date(2026, 8, day, hour, 0, 0).toISOString();

describe('buildActivityRows', () => {
  it('danh sách rỗng → không dòng nào', () => {
    expect(buildActivityRows([], NOW)).toEqual([]);
  });

  it('chèn nhãn ở chỗ đổi ngày; giữ nguyên thứ tự các mục', () => {
    const rows = buildActivityRows(
      [
        at('a', local(26, 11)),
        at('b', local(26, 8)),
        at('c', local(25, 23)),
        at('d', local(22)),
        at('e', local(1)),
      ],
      NOW,
    );

    expect(rows.map((row) => (row.type === 'header' ? row.label : row.item.id))).toEqual([
      'Hôm nay',
      'a',
      'b',
      'Hôm qua',
      'c',
      '7 ngày qua',
      'd',
      'Cũ hơn',
      'e',
    ]);
  });

  it('"Hôm qua" tính theo NGÀY LỊCH: 23h đêm qua vẫn là hôm qua dù cách chưa đầy 24 giờ', () => {
    const rows = buildActivityRows([at('x', local(25, 23))], NOW);
    expect(rows[0]).toMatchObject({ label: 'Hôm qua', type: 'header' });
  });

  it('chỉ có nhãn cho nhóm CÓ mục (hộp thư toàn "Hôm nay" thì đúng một nhãn)', () => {
    const rows = buildActivityRows([at('a', local(26)), at('b', local(26, 10))], NOW);
    expect(rows.filter((row) => row.type === 'header')).toHaveLength(1);
  });

  it('ngày không hợp lệ → "Cũ hơn", không ném', () => {
    expect(buildActivityRows([at('a', 'khong-phai-ngay')], NOW)[0]).toMatchObject({
      label: 'Cũ hơn',
    });
  });

  it('khoá dòng duy nhất kể cả khi server trả lộn thứ tự (một nhóm hiện hai lần)', () => {
    const rows = buildActivityRows(
      [at('a', local(26)), at('b', local(1)), at('c', local(26, 10))],
      NOW,
    );
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
