import { normalizeGrants, type RawGrantRow } from '../api/grants.normalize';
import { describeAccessSources, hasRoleSource } from '../utils/access-source';

/**
 * Chuẩn hoá `GET /channels/:id/grants` từ HAI hình dạng (p1-03 cũ: mỗi dòng một người; p3-04
 * mới: `subject` USER/ROLE) và diễn giải `effectiveSources` (PR-05) — hai chỗ "sai là im lặng":
 * đọc sai hình dạng thì màn Thành viên kênh riêng tư trống trơn mà không lỗi nào báo.
 */

const NOW = '2026-09-19T00:00:00.000Z';

describe('normalizeGrants', () => {
  it('dạng CŨ (p1-03): mỗi dòng là một người → users, không có role', () => {
    const legacy: RawGrantRow[] = [
      { userId: 'u1', name: 'An', level: 'MANAGER', source: 'DIRECT', roleRef: null, grantedBy: 'u1', createdAt: NOW },
    ];

    expect(normalizeGrants(legacy)).toEqual({ users: legacy, roles: [] });
  });

  it('dạng MỚI (p3-04): subject USER → users; subject ROLE → roles (không userId)', () => {
    const result = normalizeGrants([
      {
        subject: { type: 'USER', user: { id: 'u2', name: 'Bình', avatarUrl: null } },
        level: 'MEMBER',
        source: 'DIRECT',
        grantedBy: 'u1',
        createdAt: NOW,
      },
      { subject: { type: 'ROLE', roleRef: 'ADMIN' }, level: 'MEMBER', source: 'ROLE', grantedBy: 'u1', createdAt: NOW },
    ]);

    expect(result.users).toEqual([
      { userId: 'u2', name: 'Bình', level: 'MEMBER', source: 'DIRECT', roleRef: null, grantedBy: 'u1', createdAt: NOW },
    ]);
    expect(result.roles).toEqual([{ roleRef: 'ADMIN', level: 'MEMBER', grantedBy: 'u1', createdAt: NOW }]);
  });

  it('bỏ qua dòng ROLE có roleRef lạ và dòng USER thiếu thông tin người (không ném lỗi)', () => {
    const result = normalizeGrants([
      { subject: { type: 'ROLE', roleRef: 'OWNER' }, level: 'MEMBER', source: 'ROLE', grantedBy: 'u1', createdAt: NOW },
      { subject: { type: 'USER' }, level: 'MEMBER', source: 'DIRECT', grantedBy: 'u1', createdAt: NOW },
    ]);

    expect(result).toEqual({ users: [], roles: [] });
  });
});

describe('describeAccessSources (PR-05)', () => {
  it('chỉ ROLE → "Được cấp qua vai trò Quản trị viên"', () => {
    expect(describeAccessSources(['ROLE:ADMIN'])).toBe('Được cấp qua vai trò Quản trị viên');
  });

  it('DIRECT + ROLE → nói cả hai', () => {
    expect(describeAccessSources(['DIRECT', 'ROLE:MEMBER'])).toBe(
      'Được cấp trực tiếp và qua vai trò Toàn bộ thành viên',
    );
  });

  it('chỉ DIRECT → "Được cấp trực tiếp"; rỗng → chuỗi rỗng (nơi gọi ẩn dòng)', () => {
    expect(describeAccessSources(['DIRECT'])).toBe('Được cấp trực tiếp');
    expect(describeAccessSources([])).toBe('');
  });

  it('ROLE mà không rõ vai trò nào (BE cũ) → "qua vai trò" trơn, không để trống chỗ tên', () => {
    expect(describeAccessSources(['ROLE:'])).toBe('Được cấp qua vai trò');
  });

  it('hasRoleSource chỉ đúng khi có nguồn ROLE:*', () => {
    expect(hasRoleSource(['DIRECT'])).toBe(false);
    expect(hasRoleSource(['DIRECT', 'ROLE:ADMIN'])).toBe(true);
  });
});
