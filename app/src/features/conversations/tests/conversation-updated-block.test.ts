import type { ConversationDetail } from '../api/conversations.types';
import { makeItem, makeListData } from '../cache/apply-conversation-event.fixtures';
import { applyConversationUpdatedInDetail, applyConversationUpdatedInList } from '../cache/apply-conversation-updated';

/**
 * `conversation:updated` sau chặn/bỏ chặn 1-1 (p1-08): BE (`ConversationHooks.onUserBlocked`) chỉ phát
 * `{ id, readOnly, readOnlyReason }` — KHÔNG có `status`/`memberCount`/`version`. Bản áp dụng không được ghi
 * `undefined` đè lên chúng (mất `version` ⇒ `expectedVersion` của lần sửa kế tiếp là `undefined`) và phải đồng bộ
 * `myPermissions.canSend` — `ChatRoom` khoá ô nhập theo cờ đó, không theo `readOnly`.
 */
const DETAIL = {
  ...makeItem({ id: 'cv-1', readOnly: false, readOnlyReason: null }),
  version: 4,
  myRole: 'MEMBER',
  myPermissions: { canSend: true, canCall: true, canPin: true },
} as unknown as ConversationDetail;

describe('conversation:updated bản riêng của chặn/bỏ chặn', () => {
  it('detail: readOnly + reason được vá, status/memberCount/version GIỮ NGUYÊN, canSend/canCall theo !readOnly', () => {
    const next = applyConversationUpdatedInDetail(DETAIL, { id: 'cv-1', readOnly: true, readOnlyReason: 'BLOCKED' });

    expect(next?.readOnly).toBe(true);
    expect(next?.readOnlyReason).toBe('BLOCKED');
    expect(next?.status).toBe('ACTIVE');
    expect(next?.memberCount).toBe(2);
    expect(next?.version).toBe(4);
    expect(next?.myPermissions.canSend).toBe(false);
    expect(next?.myPermissions.canCall).toBe(false);
    expect(next?.myPermissions.canPin).toBe(true);
  });

  it('bỏ chặn: mở lại canSend và xoá reason', () => {
    const blocked = applyConversationUpdatedInDetail(DETAIL, { id: 'cv-1', readOnly: true, readOnlyReason: 'BLOCKED' });
    const next = applyConversationUpdatedInDetail(blocked, { id: 'cv-1', readOnly: false, readOnlyReason: null });

    expect(next?.readOnly).toBe(false);
    expect(next?.readOnlyReason).toBeNull();
    expect(next?.myPermissions.canSend).toBe(true);
  });

  it('bản đầy đủ CŨ hơn version đang cache vẫn bị bỏ qua (luật cũ không đổi)', () => {
    const stale = applyConversationUpdatedInDetail(DETAIL, { id: 'cv-1', status: 'DISSOLVED', memberCount: 1, version: 3 });
    expect(stale).toBe(DETAIL);
  });

  it('bản khác hội thoại ⇒ không đổi', () => {
    expect(applyConversationUpdatedInDetail(DETAIL, { id: 'cv-2', readOnly: true })).toBe(DETAIL);
  });

  it('danh sách: chỉ vá readOnly/reason, giữ status/memberCount', () => {
    const data = makeListData([[makeItem({ id: 'cv-1' })]]);
    const next = applyConversationUpdatedInList(data, { id: 'cv-1', readOnly: true, readOnlyReason: 'BLOCKED' });
    const item = next?.pages[0]?.data[0];

    expect(item?.readOnly).toBe(true);
    expect(item?.readOnlyReason).toBe('BLOCKED');
    expect(item?.status).toBe('ACTIVE');
    expect(item?.memberCount).toBe(2);
  });
});
