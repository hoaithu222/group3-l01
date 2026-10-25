import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Trạng thái mạng của MÁY — một nguồn dùng chung cho `useNetworkStatus` (React) và `onlineManager` (React Query).
 *
 * ── Một đăng ký NetInfo, nhiều người nghe ────────────────────────────────────
 * Trước đây 6 chỗ tự gọi `NetInfo.addEventListener` (upload runner, banner kết nối, tài liệu, ví, tìm kiếm…) —
 * mỗi chỗ một đăng ký native. Kho này đăng ký ĐÚNG MỘT lần (khi có người nghe đầu tiên, gỡ khi người cuối rời đi) rồi phát
 * lại cho mọi người nghe. Mã cũ chưa bị ép chuyển; mã mới dùng `useNetworkStatus`.
 *
 * ── "Có mạng" nghĩa là gì ────────────────────────────────────────────────────
 * `isConnected !== false`: CHỈ khi NetInfo xác nhận CHẮC CHẮN không có kết nối mới coi là ngoại tuyến; `null` (chưa biết)
 * coi là online — cùng luật `useConnectionState`, để lúc khởi động không nháy banner "ngoại tuyến". ⛔ Không dùng
 * `isInternetReachable === false` làm ngoại tuyến: Android kiểm bằng một request tới máy chủ Google, mạng công ty chặn
 * nó thì máy vẫn vào được BE mà bị báo mất mạng.
 */

export interface NetworkSnapshot {
  /** Máy có kết nối (theo luật ở trên). */
  readonly isOnline: boolean;
  /** `null` = chưa biết. Chỉ để hiển thị/chẩn đoán, KHÔNG dùng để chặn thao tác. */
  readonly isInternetReachable: boolean | null;
  /** `wifi` · `cellular` · `none`… (`unknown` khi chưa biết). */
  readonly type: string;
  /** Dữ liệu di động tính phí (`isConnectionExpensive`) — để hoãn tải nặng. */
  readonly isMetered: boolean;
}

const INITIAL: NetworkSnapshot = {
  isInternetReachable: null,
  isMetered: false,
  isOnline: true,
  type: 'unknown',
};

let snapshot: NetworkSnapshot = INITIAL;
const listeners = new Set<() => void>();
let unsubscribeNative: (() => void) | null = null;

export function toSnapshot(state: NetInfoState): NetworkSnapshot {
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  return {
    isInternetReachable: state.isInternetReachable ?? null,
    isMetered: details?.isConnectionExpensive === true,
    isOnline: state.isConnected !== false,
    type: state.type,
  };
}

function apply(next: NetworkSnapshot): void {
  const same =
    next.isOnline === snapshot.isOnline &&
    next.isInternetReachable === snapshot.isInternetReachable &&
    next.isMetered === snapshot.isMetered &&
    next.type === snapshot.type;
  if (same) return; // Giữ nguyên tham chiếu ⇒ `useSyncExternalStore` không vẽ lại vô ích.
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Ảnh chụp hiện tại — ổn định về tham chiếu tới khi có thay đổi thật. */
export function getNetworkSnapshot(): NetworkSnapshot {
  return snapshot;
}

/** Đăng ký nghe thay đổi. Người đầu tiên mở đăng ký NetInfo; người cuối rời đi thì đóng lại. */
export function subscribeNetwork(listener: () => void): () => void {
  listeners.add(listener);
  if (!unsubscribeNative) {
    unsubscribeNative = NetInfo.addEventListener((state) => apply(toSnapshot(state)));
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeNative) {
      unsubscribeNative();
      unsubscribeNative = null;
    }
  };
}

/** CHỈ dùng trong test: đặt lại kho và ngắt đăng ký. */
export function __resetNetworkStateForTests(): void {
  unsubscribeNative?.();
  unsubscribeNative = null;
  listeners.clear();
  snapshot = INITIAL;
}
