import { useUploadStore } from '@/core/uploads/upload.store';
import type { UploadItem } from '@/core/uploads/upload.types';

import { cancelScopeUploads } from '../cancel-scope-uploads';

/**
 * p0-02 `app.md` §4 bước 3 / p1-05 "Nợ": mất quyền kênh/hội thoại → huỷ upload đính kèm tin của NÓ (kể cả luồng con),
 * KHÔNG đụng upload của scope khác hay loại khác (RESOURCE…).
 */

jest.mock('@/core/uploads/upload.transport', () => ({}));

function item(localId: string, scopeKey: string | undefined, scope: UploadItem['scope'] = 'MESSAGE'): UploadItem {
  return {
    kind: 'FILE',
    localId,
    mime: 'application/pdf',
    name: 'a.pdf',
    progress: 10,
    scope,
    scopeKey,
    size: 1,
    status: 'uploading',
    uri: 'file:///a.pdf',
  };
}

const statusOf = (id: string) => useUploadStore.getState().items[id]?.status;

beforeEach(() => {
  useUploadStore.getState().clear();
  for (const it of [
    item('main', 'CONVERSATION:c1'),
    item('thread', 'CHANNEL:ch1:root9'),
    item('channel', 'CHANNEL:ch1'),
    item('other', 'CONVERSATION:c2'),
    item('prefix-trap', 'CHANNEL:ch10'), // `ch10` KHÔNG thuộc `ch1` dù trùng tiền tố chữ
    item('resource', 'ws1', 'RESOURCE'),
  ]) {
    useUploadStore.getState().addItem(it);
  }
});

describe('cancelScopeUploads', () => {
  it('hội thoại bị thu hồi → chỉ upload MESSAGE của hội thoại đó bị huỷ', () => {
    cancelScopeUploads('CONVERSATION', 'c1');
    expect(statusOf('main')).toBe('cancelled');
    expect(statusOf('other')).toBe('uploading');
    expect(statusOf('channel')).toBe('uploading');
  });

  it('kênh bị thu hồi → huỷ cả upload ở luồng con của kênh; không nhầm kênh trùng tiền tố (ch1 ≠ ch10)', () => {
    cancelScopeUploads('CHANNEL', 'ch1');
    expect(statusOf('channel')).toBe('cancelled');
    expect(statusOf('thread')).toBe('cancelled');
    expect(statusOf('prefix-trap')).toBe('uploading');
  });

  it('scope không phải kênh/hội thoại (WORKSPACE…) → không huỷ gì; upload RESOURCE không bao giờ bị đụng', () => {
    cancelScopeUploads('WORKSPACE', 'ws1');
    cancelScopeUploads('CHANNEL', 'ws1');
    expect(statusOf('resource')).toBe('uploading');
    expect(statusOf('main')).toBe('uploading');
  });
});
