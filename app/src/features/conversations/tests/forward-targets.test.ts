import type { ConversationListItem } from '../api/conversations.types';
import { toForwardTargets } from '../utils/forward-targets';

function item(overrides: Partial<ConversationListItem>): ConversationListItem {
  return {
    id: 'c-1',
    kind: 'GROUP',
    status: 'ACTIVE',
    workspaceId: 'ws-1',
    title: 'Đồ án',
    avatarUrl: null,
    peer: null,
    memberCount: 3,
    lastMessage: null,
    unreadCount: 0,
    hasMention: false,
    markedUnread: false,
    pinnedAt: null,
    archivedAt: null,
    muted: false,
    notifyMode: 'INHERIT',
    readOnly: false,
    readOnlyReason: null,
    activityAt: '2026-09-19T00:00:00.000Z',
    isMeetingGroup: false,
    ...overrides,
  };
}

describe('toForwardTargets', () => {
  it('đổi nhóm thành đích scope CONVERSATION, nhãn là tên nhóm', () => {
    expect(toForwardTargets([item({ id: 'c-7', title: 'Đồ án cuối kỳ' })])).toEqual([
      { scopeType: 'CONVERSATION', scopeId: 'c-7', label: 'Đồ án cuối kỳ' },
    ]);
  });

  it('nhóm chưa đặt tên vẫn có nhãn đọc được (không rỗng)', () => {
    expect(toForwardTargets([item({ title: null })])[0]?.label).toBe('Nhóm chưa đặt tên');
  });

  it('ẩn hội thoại KHÔNG gửi được: đã giải tán và chỉ đọc — chọn xong mới bị DENIED là tệ hơn ẩn từ đầu', () => {
    const targets = toForwardTargets([
      item({ id: 'ok' }),
      item({ id: 'giai-tan', status: 'DISSOLVED', readOnly: true, readOnlyReason: 'DISSOLVED' }),
      item({ id: 'chi-doc', readOnly: true, readOnlyReason: 'ARCHIVED' }),
    ]);
    expect(targets.map((target) => target.scopeId)).toEqual(['ok']);
  });
});
