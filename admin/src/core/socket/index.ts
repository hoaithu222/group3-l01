/**
 * Socket.IO — client dùng chung + hook lắng nghe sự kiện (p0-03).
 *
 * Vòng đời (nối lúc đăng nhập, ngắt lúc đăng xuất) do
 * `@/app/providers/SocketProvider` quản — file ở đây THUẦN, không đọc store.
 *
 *   socket.client.ts       — thực thể dùng chung + connect/disconnect
 *   socket.auth-sync.ts    — đồng bộ phiên REST↔socket (side-effect, xem file)
 *   socket.events.ts       — tên sự kiện, khớp BE `socket.events.ts`
 *   socket.ack.ts          — `emitWithAck` cho sự kiện client→server có ack
 *   useSocketEvent.ts      — hook lắng nghe MỘT sự kiện đã khai trong `SocketEvent`
 *   useRoomSubscription.ts — registry refcount phòng + rejoin sau reconnect
 *   useConnectionStatus.ts — trạng thái kết nối rút gọn cho chấm ở header
 */
import './socket.auth-sync';

export { emitWithAck } from './socket.ack';
export type { Ack } from './socket.ack';
export { connectSocket, disconnectSocket, joinRoom, leaveRoom, socket } from './socket.client';
export { isAuthLogoutCode, SocketEvent } from './socket.events';
export type { SocketEventName } from './socket.events';
export { useConnectionStatus } from './useConnectionStatus';
export type { ConnectionStatus } from './useConnectionStatus';
export { resetRoomSubscriptions, useRoomSubscription } from './useRoomSubscription';
export type { RoomStatus, UseRoomSubscriptionOptions } from './useRoomSubscription';
export { useSocketEvent } from './useSocketEvent';
