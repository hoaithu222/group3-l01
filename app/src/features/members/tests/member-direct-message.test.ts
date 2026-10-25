import { router } from 'expo-router';

import { canOpenDirectMessage, openDirectMessage } from '../utils/member-direct-message';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('canOpenDirectMessage', () => {
  it('người khác đang ACTIVE ⇒ có nút Nhắn tin', () => {
    expect(canOpenDirectMessage({ isMe: false, status: 'ACTIVE' })).toBe(true);
  });

  it('chính mình ⇒ không (không có DM với chính mình ở P0)', () => {
    expect(canOpenDirectMessage({ isMe: true, status: 'ACTIVE' })).toBe(false);
  });

  it.each(['BANNED', 'REMOVED', 'LEFT', 'PENDING'] as const)('người %s ⇒ không nhắn được', (status) => {
    expect(canOpenDirectMessage({ isMe: false, status })).toBe(false);
  });
});

describe('openDirectMessage', () => {
  it('đi bằng ROUTE của conversations (`/messages/new?userId=`), kèm tên tài khoản để vẽ header màn nháp', () => {
    openDirectMessage({ userId: 'u-2', name: 'Trần Thị Bình', avatarUrl: 'https://cdn/x.png' });

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/messages/new',
      params: { userId: 'u-2', name: 'Trần Thị Bình', avatarUrl: 'https://cdn/x.png' },
    });
  });

  it('không có ảnh ⇒ avatarUrl là chuỗi rỗng (route params không nhận null)', () => {
    openDirectMessage({ userId: 'u-3', name: 'Lê Văn C', avatarUrl: null });

    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/messages/new',
      params: { userId: 'u-3', name: 'Lê Văn C', avatarUrl: '' },
    });
  });
});
