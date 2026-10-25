import NetInfo from '@react-native-community/netinfo';

import { cancelTask } from './upload.active-tasks';
import { runItem } from './upload.pipeline';
import { uploadService } from './upload.service';
import { useUploadStore } from './upload.store';
import type { AssetScope, UploadItem } from './upload.types';

/** Tối đa 2 upload chạy song song — app.md §5. */
const MAX_CONCURRENT = 2;

const RUNNING_STATUSES = new Set<UploadItem['status']>(['creating', 'uploading', 'processing']);

/**
 * ⚠️ Biến MODULE-SCOPE cố ý, không phải state Zustand: đây là singleton chạy
 * NGOÀI vòng đời React (giống `core/socket/socket.client.ts`) — nó cần bắt đầu
 * lắng nghe `NetInfo` NGAY lúc import module, trước khi component đầu tiên
 * kịp mount.
 */
let online = true;

/**
 * ⛔ Chặn ĐỆ QUY LỒNG — `store.updateItem()` bên trong vòng lặp bên dưới bắn
 * `useUploadStore.subscribe` NGAY LẬP TỨC (Zustand gọi listener đồng bộ), tức
 * là `drain()` gọi lại chính nó GIỮA CHỪNG vòng `forEach` đang chạy. Không có
 * cờ này, item thứ hai của mảng `queued` (đã trót nằm trong snapshot của LƯỢT
 * NGOÀI, chụp TRƯỚC khi lượt lồng bên trong kịp bắt đầu nó) bị `runItem()` gọi
 * HAI LẦN — một lần từ lượt lồng (đúng), một lần nữa khi vòng `forEach` ngoài
 * tới lượt của nó (thừa) ⇒ tạo hai `asset` cho CÙNG MỘT `localId`. Lượt gọi bị
 * chặn không mất tác dụng: nó luôn trả `void` trong lúc `draining === true`,
 * nhưng CHÍNH lượt NGOÀI (không bị chặn) vẫn tiếp tục quét lại tới khi hết chỗ
 * trống — nên không bỏ sót lượt cần chạy nào.
 */
let draining = false;

function isOnline(): boolean {
  return online;
}

/**
 * Lên lịch — chạy TỐI ĐA `MAX_CONCURRENT` item, và khi OFFLINE thì chuyển mọi
 * item `queued` sang `paused` (để `AttachmentTray` hiện đúng "Tạm dừng" ngay
 * cả với item CHƯA từng bắt đầu tải — không chỉ item bị ngắt giữa chừng).
 */
function drain(): void {
  if (draining) return;
  draining = true;
  try {
    const store = useUploadStore.getState();
    const items = Object.values(store.items);

    if (!online) {
      items
        .filter((item) => item.status === 'queued')
        .forEach((item) => store.updateItem(item.localId, { status: 'paused' }));
      return;
    }

    const runningCount = items.filter((item) => RUNNING_STATUSES.has(item.status)).length;
    const available = MAX_CONCURRENT - runningCount;
    if (available <= 0) return;

    items
      .filter((item) => item.status === 'queued')
      .slice(0, available)
      .forEach((item) => void runItem(item.localId, isOnline));
  } finally {
    draining = false;
  }
}

/** Có mạng lại — đưa các item `paused` về `queued` để `drain()` nhặt lại (AST-09). */
function resumePaused(): void {
  const store = useUploadStore.getState();
  Object.values(store.items)
    .filter((item) => item.status === 'paused')
    .forEach((item) => store.updateItem(item.localId, { status: 'queued' }));
}

/** Áp trạng thái mạng MỚI — dùng chung cho listener `NetInfo` thật và `__setOnlineForTests`. */
function applyOnlineState(next: boolean): void {
  const wasOffline = !online;
  online = next;
  if (online && wasOffline) resumePaused();
  drain();
}

NetInfo.addEventListener((state) => applyOnlineState(state.isConnected !== false));

/** Mỗi thay đổi của store (thêm item, đổi trạng thái xong một item…) đều thử lấp chỗ trống. */
useUploadStore.subscribe(() => drain());

/** Huỷ một upload đang chờ/đang chạy — gọi `abort` phía server, bỏ qua lỗi (app.md §4). */
export function cancelUpload(localId: string): void {
  const store = useUploadStore.getState();
  const item = store.items[localId];
  // ⚠️ Huỷ lần hai trở đi là no-op: mỗi lần gọi lại bắn `POST /assets/:id/abort`, mà server trả 403 `ASSET_004` khi asset không còn
  //    ở trạng thái huỷ được (log Railway 2026-09-27: 8 lần liền cho MỘT asset, lần nào cũng 403).
  if (item?.status === 'cancelled') return;
  cancelTask(localId);
  store.updateItem(localId, { status: 'cancelled' });
  if (item?.assetId) void uploadService.abortAsset(item.assetId).catch(() => undefined);
}

/** Đưa lại một item `failed` vào hàng đợi — TÁI DÙNG `assetId` đã có (nếu có), `upload.pipeline.ts` tự xin URL mới. */
export function retryUpload(localId: string): void {
  useUploadStore
    .getState()
    .updateItem(localId, { status: 'queued', progress: 0, errorCode: undefined });
}

/** Huỷ mọi upload của một scope (vd `permission:revoked`, p0-02) — cả store lẫn task native. */
export function cancelUploadsByScope(scope: AssetScope, scopeKey?: string): void {
  const ids = useUploadStore.getState().cancelByScope(scope, scopeKey);
  ids.forEach((id) => cancelTask(id));
}

/** CHỈ dùng trong test: mock `NetInfo` không tự bắn sự kiện, nên test tự gọi thẳng đúng logic chuyển trạng thái. */
export function __setOnlineForTests(value: boolean): void {
  applyOnlineState(value);
}
