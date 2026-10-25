import { scopeKeyOf } from '@/core/socket';
import { cancelUploadsByScope } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';

import type { ScopeType } from './scope';

/**
 * Mất quyền một KÊNH/HỘI THOẠI (`permission:revoked`) → huỷ mọi upload đính kèm tin đang chờ/đang chạy của nó (p0-02 `app.md`
 * §4 bước 3; p1-05 "Nợ": nối `cancelUploadsByScope`). Không huỷ thì tệp vẫn tải lên tới khi request thật ăn 403/404 — tốn
 * mạng và pin, và gửi tệp vào nơi người dùng không còn quyền.
 *
 * `useUpload('MESSAGE', scopeKey)` ở composer dùng `scopeKeyOf(type, id[, threadId])` làm `scopeKey`: luồng con
 * (`CHANNEL:<id>:<gốc>`) cũng thuộc kênh nên cùng bị huỷ — `cancelUploadsByScope` khớp CHÍNH XÁC khoá nên gom các khoá thật
 * đang có trong store (tiền tố `<base>:`) rồi huỷ từng khoá.
 *
 * Loại scope khác (WORKSPACE…) do feature của nó tự dọn (`resetResourceStores` cho `RESOURCE`).
 */
export function cancelScopeUploads(scopeType: ScopeType, scopeId: string): void {
  if (scopeType !== 'CHANNEL' && scopeType !== 'CONVERSATION') return;

  const base = scopeKeyOf(scopeType, scopeId);
  const keys = new Set<string>();
  for (const item of Object.values(useUploadStore.getState().items)) {
    const key = item.scopeKey;
    if (item.scope === 'MESSAGE' && key && (key === base || key.startsWith(`${base}:`))) keys.add(key);
  }
  keys.forEach((key) => cancelUploadsByScope('MESSAGE', key));
}
