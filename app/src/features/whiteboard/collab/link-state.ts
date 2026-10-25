import type { AuthScope, WsStatus } from './hocuspocus-port';
import type { NoticeCode, SessionSnapshot } from './session-status';

/**
 * Các cờ trạng thái kết nối thô mà `ConnectionController` gom từ provider — tách khỏi bộ điều khiển để nó chỉ còn chính sách nối/dừng.
 * `snapshot()` là hàm THUẦN theo các cờ: `synced` chỉ tính khi socket đang mở VÀ đã xác thực (provider có thể còn `synced` cũ lúc vừa rớt).
 */
export class LinkState {
  wsStatus: WsStatus = 'disconnected';
  authenticated = false;
  synced = false;
  everSynced = false;
  unsynced = 0;
  saveFailed = false;
  serverReadOnly = false;
  archived = false;
  tooLarge = false;
  loadTimedOut = false;
  stopped = false;

  onSocketClosed(): void {
    this.authenticated = false;
    this.synced = false;
  }

  onAuthenticated(scope: AuthScope): void {
    this.authenticated = true;
    this.serverReadOnly = scope === 'readonly';
    // Chỉ bảng được mở lại ở chế độ GHI mới hết "đã lưu trữ".
    if (scope === 'read-write') this.archived = false;
  }

  onSynced(): void {
    this.synced = true;
    this.everSynced = true;
    this.loadTimedOut = false;
  }

  /** `SAVE_RECOVERED` cũng xoá `TOO_LARGE`: BE nhận lại state nghĩa là hết quá lớn. */
  applyNotice(code: NoticeCode): void {
    if (code === 'SAVE_FAILED') this.saveFailed = true;
    else if (code === 'SAVE_RECOVERED') this.saveFailed = this.tooLarge = false;
    else if (code === 'TOO_LARGE') this.tooLarge = true;
    else if (code === 'ARCHIVED') this.archived = this.serverReadOnly = true;
    else if (code === 'READ_ONLY') this.serverReadOnly = true;
  }

  markArchived(): void {
    this.archived = this.serverReadOnly = true;
  }

  snapshot(): SessionSnapshot {
    const live = this.wsStatus === 'connected' && this.authenticated && this.synced;
    let connection: SessionSnapshot['connection'] = 'connecting';
    if (this.stopped) connection = 'closed';
    else if (live) connection = 'synced';
    else if (this.everSynced || this.loadTimedOut) connection = 'offline';
    return {
      archived: this.archived,
      connection,
      everSynced: this.everSynced,
      saveFailed: this.saveFailed,
      serverReadOnly: this.serverReadOnly,
      tooLarge: this.tooLarge,
      unsynced: this.unsynced > 0,
    };
  }
}
