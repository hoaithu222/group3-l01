/**
 * Mặt tiền công khai của feature `calls` (p2-01). Nơi lắp ráp (`app/(app)/_layout.tsx`) đăng ký các renderer vào
 * `@/shared/calls` và `chat` — feature khác KHÔNG import `calls`.
 */
export { ActiveCallBanner } from './components/ActiveCallBanner';
export { CallButtons } from './components/CallButtons';
export { CallHistoryEntry } from './components/CallHistoryEntry';
export { CallRuntime } from './components/CallRuntime';
export { MiniCallBar } from './components/MiniCallBar';
export { CallSummaryMessage } from './components/CallSummaryMessage';
export { useCallSignals } from './hooks/useCallSignals';
export { CallNativeBridge } from './native/call-native.bridge';
export { promptFullScreenIntentOnce } from './native/full-screen-intent';
export { setLockScreenCallUser } from './native/lock-screen-call';
export { CallHistoryScreen } from './screens/CallHistoryScreen';
export { CallScreen } from './screens/CallScreen';
/** Root `IncomingCall` (màn khoá, p2-02) — chỉ `@/shell/lock-screen/IncomingCallRoot` dựng. */
export { LockScreenCallScreen } from './screens/LockScreenCallScreen';
export type { CallScreenProps } from './screens/CallScreen';
export { VoiceRoomPreviewScreen } from './voice-room/screens/VoiceRoomPreviewScreen';
export type { VoiceRoomPreviewScreenProps } from './voice-room/screens/VoiceRoomPreviewScreen';
