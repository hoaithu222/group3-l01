import { AppState, type NativeEventSubscription } from 'react-native';
import * as Y from 'yjs';

import {
  CollabRefreshScheduler,
  CollabTokenProvider,
  type CollabGrant,
  type CollabGrantFetcher,
} from '@/shared/collab';

import { AWARENESS } from '../constants/whiteboard.constants';
import { createHistory, WB_LIMITS, type WhiteboardHistory, type WriteContext } from '../engine';
import { createAwarenessPublisher, type AwarenessPublisher } from './awareness-publisher';
import { readPeers, type RemotePeer } from './awareness-peers';
import { ConnectionController } from './connection-controller';
import type { ControllerHost } from './connection-controller.types';
import { createHocuspocusPort, type PortFactory } from './hocuspocus-port';
import { createLatestThrottle, type LatestThrottle } from './throttle';

export interface RuntimeHost extends Omit<ControllerHost, 'onPresence'> {
  /** Có grant MỚI (lượt đầu và mỗi lần làm mới trước hạn) — hook dùng để biết chế độ ghi/đọc (token làm mới có thể đã đổi `edit` ↔ `view`). */
  onGranted: (grant: CollabGrant) => void;
  onPeers: (peers: RemotePeer[]) => void;
}

export interface RuntimeOptions {
  classifyTokenError: (error: unknown) => 'forbidden' | 'retry';
  createPort?: PortFactory;
  fetchGrant: CollabGrantFetcher;
  host: RuntimeHost;
  loadTimeoutMs?: number;
  random?: () => number;
  /** `userId` vừa là `updatedBy` vừa là `origin` của mọi transaction ghi (WB-03: undo chỉ của mình) và `user.id` của awareness (= `sub` của token). */
  userId: string;
  WebSocketPolyfill?: unknown;
}

/**
 * Mọi thứ sống cùng MỘT lần mở bảng: `Y.Doc`, undo/redo cá nhân, nguồn token, phiên collab và bộ phát awareness. Tạo bằng `useMemo` theo
 * `(bảng, người dùng)`; `start()`/`stop()` gọi từ effect và PHẢI chạy lại được (StrictMode chạy setup → cleanup → setup trên cùng một đối
 * tượng), nên `stop()` chỉ ngắt kết nối + dọn hẹn giờ, KHÔNG huỷ `doc`/`history` (chúng được GC cùng đối tượng khi màn gỡ).
 * ⛔ Token không bao giờ rời `CollabTokenProvider` (không log, không vào store).
 */
export class WhiteboardRuntime {
  readonly doc = new Y.Doc();
  readonly history: WhiteboardHistory;
  readonly tokens: CollabTokenProvider;
  publisher: AwarenessPublisher | null = null;
  /** Trần phần tử hiệu lực: `limits.elementsMax` của `collab-token` nếu có, không thì trần cứng của engine. */
  elementsMax: number = WB_LIMITS.elementsMax;
  private controller: ConnectionController | null = null;
  private peers: LatestThrottle<void> | null = null;
  private scheduler: CollabRefreshScheduler | null = null;
  private appState: NativeEventSubscription | null = null;
  private generation = 0;

  constructor(private readonly o: RuntimeOptions) {
    this.tokens = new CollabTokenProvider(o.fetchGrant);
    this.history = createHistory(this.doc, o.userId);
  }

  get awareness(): ConnectionController['awareness'] | null {
    return this.controller?.awareness ?? null;
  }

  /**
   * Y.Doc có dữ liệu chưa (state vector rỗng = 1 byte)? Trước lần đồng bộ đầu thì chỉ có thể là nét máy này vẽ lúc đang nối. ⚠️ Đừng thay bằng
   * `snapshot.unsynced`: provider 3.4.4 đặt `unsyncedChanges = 1` ở MỖI lần mở socket (`startSync`) nên cờ đó bật cả khi chưa vẽ gì.
   */
  hasLocalContent(): boolean {
    return Y.encodeStateVector(this.doc).byteLength > 1;
  }

  /** Ngữ cảnh ghi cho engine (`origin` = `userId`, trần phần tử). */
  writeContext(): WriteContext {
    return { elementsMax: this.elementsMax, userId: this.o.userId };
  }

  /** Xin token lượt đầu rồi nối. Lỗi xin token: 404/403 → mất quyền (dừng hẳn); còn lại báo `TOKEN_FAILED` để màn hiện "Thử lại". */
  async start(): Promise<void> {
    const generation = ++this.generation;
    let grant: CollabGrant;
    try {
      grant = await this.tokens.refresh();
    } catch (error) {
      if (generation !== this.generation) return;
      const forbidden = this.o.classifyTokenError(error) === 'forbidden';
      this.o.host.onFailure({ code: forbidden ? 'FORBIDDEN' : 'TOKEN_FAILED', fatal: forbidden });
      return;
    }
    if (generation !== this.generation) return;
    this.elementsMax = grant.elementsMax ?? WB_LIMITS.elementsMax;
    this.o.host.onGranted(grant);
    const controller = new ConnectionController({
      classifyTokenError: this.o.classifyTokenError,
      createPort: this.o.createPort ?? createHocuspocusPort,
      doc: this.doc,
      documentName: grant.documentName,
      host: { ...this.o.host, onPresence: () => this.peers?.push() },
      tokens: this.tokens,
      url: grant.url,
      user: grant.user,
      ...(this.o.loadTimeoutMs ? { loadTimeoutMs: this.o.loadTimeoutMs } : {}),
      ...(this.o.random ? { random: this.o.random } : {}),
      ...(this.o.WebSocketPolyfill ? { WebSocketPolyfill: this.o.WebSocketPolyfill } : {}),
    });
    this.controller = controller;
    this.publisher = createAwarenessPublisher(controller.awareness);
    // Nhận awareness của người khác: gộp về ≤ 30 lần/giây (mỗi lần = một lần vẽ lại lớp con trỏ), đọc trạng thái mới nhất lúc bắn.
    this.peers = createLatestThrottle<void>(() => {
      const { awareness } = controller;
      this.o.host.onPeers(readPeers(awareness.getStates(), awareness.clientID));
    }, AWARENESS.maxHz);
    // Làm mới token TRƯỚC hạn 60 s (CW-D5); hàm `token` của provider luôn đọc bản mới nhất từ `CollabTokenProvider`. Bộ hẹn giờ bị hệ điều hành đóng băng lúc
    // ở nền nên khi app trở lại nền trước phải kiểm lại hạn (`nudge`).
    this.scheduler = new CollabRefreshScheduler({
      onGiveUp: () => this.o.host.onFailure({ code: 'TOKEN_FAILED', fatal: false }),
      onGrant: (next) => this.o.host.onGranted(next),
      provider: this.tokens,
    });
    this.scheduler.start(grant);
    this.appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') this.scheduler?.nudge();
    });
    controller.connect();
  }

  /** Nối lại thủ công ("Thử lại"); nếu chưa từng nối được (xin token lượt đầu lỗi) thì bắt đầu lại từ đầu. */
  retry(): void {
    if (this.controller) this.controller.retry();
    else void this.start();
  }

  stop(): void {
    this.generation += 1;
    this.scheduler?.stop();
    this.appState?.remove();
    this.scheduler = null;
    this.appState = null;
    this.publisher?.flush();
    this.publisher?.destroy();
    this.peers?.cancel();
    this.controller?.destroy();
    this.publisher = null;
    this.peers = null;
    this.controller = null;
    this.tokens.clear();
  }
}
