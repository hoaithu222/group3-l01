import { workspaceCardFacts } from '../utils/workspace-card';
import {
  groupWorkspaces,
  summarizeWorkspaces,
  workspaceSummaryText,
} from '../utils/workspace-list-sections';
import { listItem } from './test-utils';

/**
 * Dữ liệu thuần của danh sách nhóm: chia khối (app.md p1-01 §3 "Yêu thích … Tất cả"), dòng tóm tắt, và chữ của từng thẻ
 * (chưa đọc bằng CHỮ, nhãn trợ năng giữ thứ tự cũ).
 */

const active = (id: string, patch: Parameters<typeof listItem>[0] = {}) =>
  listItem({ id, name: `Nhóm ${id}`, status: 'ACTIVE', ...patch });

describe('groupWorkspaces', () => {
  it('chờ duyệt ĐẦU, rồi yêu thích, rồi "Nhóm khác"; giữ nguyên thứ tự BE trong từng khối', () => {
    const sections = groupWorkspaces([
      active('a'),
      active('b', { isFavorite: true }),
      listItem({ id: 'p', isFavorite: true }),
      active('c'),
    ]);

    expect(
      sections.map((section) => [section.key, section.title, section.items.map((item) => item.id)]),
    ).toEqual([
      ['pending', 'Đang chờ duyệt', ['p']],
      ['favorites', 'Yêu thích', ['b']],
      ['all', 'Nhóm khác', ['a', 'c']],
    ]);
  });

  it('không có yêu thích ⇒ khối còn lại là "Tất cả nhóm"; khối rỗng bị bỏ', () => {
    const sections = groupWorkspaces([active('a'), active('b')]);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ key: 'all', title: 'Tất cả nhóm' });
  });
});

describe('summarizeWorkspaces / workspaceSummaryText', () => {
  it('đếm nhóm đã vào (không gồm chờ duyệt) và nhóm có tin mới hoặc nhắc tên', () => {
    const summary = summarizeWorkspaces([
      active('a', { unreadCount: 2 }),
      active('b', { mentionCount: 1 }),
      active('c', { status: 'ARCHIVED' }),
      listItem({ id: 'p' }),
    ]);

    expect(summary).toEqual({ joined: 3, pending: 1, unread: 2 });
    expect(workspaceSummaryText(summary)).toBe('Đang tham gia 3 nhóm · 2 nhóm có tin mới');
  });

  it('không nhóm nào có tin mới ⇒ chỉ số nhóm; chỉ có yêu cầu chờ duyệt ⇒ không có dòng tóm tắt', () => {
    expect(workspaceSummaryText({ joined: 4, pending: 0, unread: 0 })).toBe('Đang tham gia 4 nhóm');
    expect(workspaceSummaryText({ joined: 0, pending: 1, unread: 0 })).toBeNull();
  });
});

describe('workspaceCardFacts', () => {
  it('nhắc tên được ưu tiên hơn kênh chưa đọc, và luôn có CHỮ', () => {
    expect(workspaceCardFacts(active('a', { mentionCount: 2, unreadCount: 5 }))).toMatchObject({
      unreadText: '2 lượt nhắc tên',
      unreadTone: 'mention',
    });
    expect(workspaceCardFacts(active('a', { unreadCount: 3 }))).toMatchObject({
      unreadText: '3 kênh có tin mới',
      unreadTone: 'unread',
    });
    expect(workspaceCardFacts(active('a'))).toMatchObject({ unreadText: null, unreadTone: null });
  });

  it('nhãn trợ năng: thứ tự cũ (tên → lưu trữ → khách → vai trò) rồi mới tới yêu thích / chưa đọc / hoạt động', () => {
    const now = Date.parse('2026-10-01T10:00:00Z');
    const facts = workspaceCardFacts(
      active('a', {
        isFavorite: true,
        lastActivityAt: '2026-10-01T09:00:00Z',
        myRole: 'OWNER',
        name: 'Nhóm Toán 12',
        status: 'ARCHIVED',
        unreadCount: 1,
      }),
      now,
    );

    expect(facts.a11yLabel).toMatch(
      /^Nhóm Toán 12, đã lưu trữ, Chủ nhóm, đã yêu thích, 1 kênh có tin mới, Hoạt động .+$/,
    );
    expect(facts.activityText).toMatch(/^Hoạt động /);
  });

  it('đang CHỜ DUYỆT: không có dòng "Hoạt động" (chưa là thành viên); BE không có mốc ⇒ cũng không bịa', () => {
    expect(
      workspaceCardFacts(listItem({ lastActivityAt: '2026-10-01T09:00:00Z' })).activityText,
    ).toBeNull();
    expect(workspaceCardFacts(active('a', { lastActivityAt: '' })).activityText).toBeNull();
  });
});
