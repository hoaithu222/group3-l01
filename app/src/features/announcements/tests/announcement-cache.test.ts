import type { AnnouncementView, ReceiptsPage } from '../api/announcements.types';
import {
  hasAnnouncement,
  patchAnnouncement,
  patchReceiptsCount,
  removeAnnouncement,
  upsertAnnouncement,
} from '../utils/announcement-cache';
import { canManageAnnouncements, isAnnounceable, isChannelRoot } from '../utils/announcement-scope';
import { makeMessage, makeScope, makeView, receiptsPage } from './fixtures';

describe('vá cache danh sách yêu cầu', () => {
  const a = makeView({ messageId: 'a' });
  const b = makeView({ messageId: 'b' });

  it('patchAnnouncement: chỉ đổi đúng dòng; không có dòng → trả CHÍNH mảng cũ (không vẽ lại thừa)', () => {
    const list = [a, b];

    expect(patchAnnouncement(list, 'b', { confirmedByMe: true })).toEqual([
      a,
      { ...b, confirmedByMe: true },
    ]);
    expect(patchAnnouncement(list, 'x', { confirmedByMe: true })).toBe(list);
    expect(patchAnnouncement(undefined, 'a', { confirmedByMe: true })).toBeUndefined();
  });

  it('removeAnnouncement: gỡ đúng dòng; không có → mảng cũ', () => {
    const list = [a, b];

    expect(removeAnnouncement(list, 'a')).toEqual([b]);
    expect(removeAnnouncement(list, 'x')).toBe(list);
  });

  it('upsertAnnouncement: chèn mới, thay dòng cũ, hoặc dựng mảng khi chưa có', () => {
    const replaced: AnnouncementView = { ...a, deadlineAt: '2026-10-01T00:00:00.000Z' };

    expect(upsertAnnouncement([a], b)).toEqual([a, b]);
    expect(upsertAnnouncement([a, b], replaced)).toEqual([replaced, b]);
    expect(upsertAnnouncement(undefined, a)).toEqual([a]);
    expect(hasAnnouncement([a], 'a')).toBe(true);
    expect(hasAnnouncement(undefined, 'a')).toBe(false);
  });

  it('patchReceiptsCount: vá `confirmedCount` ở meta của MỌI trang', () => {
    const data = {
      pageParams: [undefined, 'c2'],
      pages: [
        receiptsPage([], { confirmedCount: 12 }),
        receiptsPage([], { confirmedCount: 12 }),
      ] as ReceiptsPage[],
    };

    const patched = patchReceiptsCount(data, 13);

    expect(patched?.pages.map((page) => page.meta.confirmedCount)).toEqual([13, 13]);
    expect(patched?.pages[0]?.meta.audienceCount).toBe(40);
    expect(patchReceiptsCount(undefined, 13)).toBeUndefined();
  });
});

describe('điều kiện áp dụng theo phạm vi', () => {
  it('chỉ luồng CHÍNH của KÊNH là "channel root"', () => {
    expect(isChannelRoot(makeScope())).toBe(true);
    expect(isChannelRoot(makeScope({ threadId: 'root' }))).toBe(false);
    expect(isChannelRoot(makeScope({ scopeType: 'CONVERSATION' }))).toBe(false);
  });

  it('tin có thể mang yêu cầu: USER, gốc, chưa thu hồi', () => {
    const scope = makeScope();

    expect(isAnnounceable(makeMessage(), scope)).toBe(true);
    expect(isAnnounceable(makeMessage({ threadId: 'root' }), scope)).toBe(false);
    expect(isAnnounceable(makeMessage({ deleted: true }), scope)).toBe(false);
    expect(isAnnounceable(makeMessage({ kind: 'SYSTEM' }), scope)).toBe(false);
    expect(isAnnounceable(makeMessage(), makeScope({ scopeType: 'CONVERSATION' }))).toBe(false);
  });

  it('tạo/huỷ yêu cầu cần kênh ADMINS_ONLY + người quản lý', () => {
    const allowed = makeScope({ canManage: true, postingPolicy: 'ADMINS_ONLY' });

    expect(canManageAnnouncements(allowed)).toBe(true);
    expect(canManageAnnouncements({ ...allowed, canManage: false })).toBe(false);
    expect(canManageAnnouncements({ ...allowed, postingPolicy: 'MEMBERS' })).toBe(false);
    expect(canManageAnnouncements(makeScope({ canManage: true }))).toBe(false);
  });
});
