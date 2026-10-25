/**
 * Realtime — Socket.IO.
 *
 *   socket.client.ts       — thực thể dùng chung + vòng đời (connect/disconnect/AppState)
 *   socket.auth-sync.ts    — đồng bộ phiên REST↔socket (side-effect, xem chú thích trong file)
 *   socket.events.ts       — tên sự kiện, khớp `docs/plan/config-be.md` §7
 *   socket.ack.ts           — `emitWithAck` cho sự kiện client→server có ack
 *   use-socket-event.ts     — hook lắng nghe một sự kiện trong component
 *   room-subscriptions.ts   — registry refcount phòng + rejoin sau reconnect
 *   use-room-subscription.ts — hook mượn/trả một phòng theo vòng đời component
 *   use-connection-state.ts — trạng thái kết nối gộp socket + mạng máy
 *   presence/                — trạng thái hiện diện (heartbeat, store, selector theo id)
 *   typing/                  — chỉ báo "đang gõ" (store tự hết hạn, phát/nhận sự kiện)
 */
import './socket.auth-sync';

export { bindAppState, connectSocket, disconnectSocket, socket } from './socket.client';
export { SOCKET_AUTH_LOGOUT_CODES, SocketEvent } from './socket.events';
export type { PermissionRevokedPayload, SocketEventName } from './socket.events';
export { useSocketEvent } from './use-socket-event';
export { emitWithAck } from './socket.ack';
export type { Ack } from './socket.ack';
export {
  acquireRoom,
  isRoomJoined,
  onRoomResync,
  resetRoomSubscriptions,
} from './room-subscriptions';
export type { RoomStatus } from './room-subscriptions';
export { useRoomSubscription } from './use-room-subscription';
export type { UseRoomSubscriptionOptions } from './use-room-subscription';
export { useConnectionState } from './use-connection-state';
export type { ConnectionState } from './use-connection-state';

export { bindPresenceHeartbeat } from './presence/presence-heartbeat';
export { usePresenceStore } from './presence/presence.store';
export type { PresenceEntry, PresenceState } from './presence/presence.store';
export { usePresence } from './presence/use-presence';

export { scopeKeyOf, useTypingStore } from './typing/typing.store';
export { useTypingIndicator } from './typing/use-typing-indicator';
export type { TypingPayload } from './typing/use-typing-indicator';
export { useTypingEmitter } from './typing/use-typing-emitter';
export type { UseTypingEmitterResult } from './typing/use-typing-emitter';
