import { NativeModules, Platform } from 'react-native';

/**
 * Truy cập THÔ tới native module `LockScreenCall` (Android, `plugins/call-notification/`).
 *
 * Tách khỏi `lock-screen-call.ts` để file đó và `call-foreground-service.ts` dùng chung một
 * định nghĩa — hai bản khai trùng nhau là kiểu lệch âm thầm khi thêm method mới.
 *
 * Module chỉ có trong bản đã `expo prebuild` với `./plugins/with-android-call-notification`, và
 * KHÔNG BAO GIỜ có trên iOS (iOS đi CallKit + VoIP push — p2-02, làm sau).
 */

/** `unknown` = bản build chưa link native module ⇒ coi như CHƯA cấp và vẫn mời. */
export type FullScreenIntentStatus = 'denied' | 'granted' | 'unknown';

/** Cuộc gọi mà `IncomingCallActivity` được mở kèm (đọc từ extras của full-screen intent). */
export interface LockScreenLaunchCall {
  callId: string;
  callUuid: string;
  callerAvatar: string;
  callerId: string;
  callerName: string;
  mediaKind: string;
  scopeKind: string;
  scopeTitle: string;
}

export interface LockScreenCallNative {
  canUseFullScreenIntent: () => Promise<FullScreenIntentStatus>;
  closeScreen: () => void;
  dismiss: (callId: string | null) => void;
  getLaunchCall: () => Promise<LockScreenLaunchCall | null>;
  isNativeRingActive: () => Promise<boolean>;
  setCallUiReady: (ready: boolean) => void;
  setCurrentUser: (userId: string | null) => void;
  setHoldActive: (active: boolean) => void;
  /** Foreground service giữ micro/camera sống khi app ra nền — xem `CallForegroundService.kt`. */
  startCallService: (title: string, withCamera: boolean) => void;
  startRingtone: () => void;
  stopCallService: () => void;
  /** Hạ chuông nhưng GIỮ màn gọi đang mở — khác `dismiss`. */
  stopRinging: (callId: string | null) => void;
  stopRingtone: () => void;
}

/** `null` ngoài Android hoặc khi bản dựng chưa có module (Expo Go, dev client cũ). */
export function lockScreenCallNative(): LockScreenCallNative | null {
  if (Platform.OS !== 'android') return null;
  return (NativeModules.LockScreenCall as LockScreenCallNative | undefined) ?? null;
}

/**
 * Gọi một method không trả giá trị và NUỐT mọi lỗi: chuông/màn khoá/service là tính năng PHỤ,
 * không được phép kéo sập cuộc gọi hay cây React.
 */
export function callNative(run: (native: LockScreenCallNative) => void): void {
  try {
    const native = lockScreenCallNative();
    if (native) run(native);
  } catch {
    // Không có gì để đụng tới thì thôi.
  }
}
