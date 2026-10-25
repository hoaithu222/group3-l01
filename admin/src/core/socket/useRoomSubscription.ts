import { useEffect, useState } from 'react';

import { emitWithAck } from './socket.ack';
import { socket } from './socket.client';
import { SocketEvent } from './socket.events';

/** Trạng thái một phòng, nhìn từ phía một component đang quan tâm nó. */
export type RoomStatus =
  | { code?: string; status: 'denied' }
  | { status: 'joined' }
  | { status: 'pending' };

type Listener = (status: RoomStatus) => void;

interface RoomEntry {
  id: string;
  kind: string;
  listeners: Set<Listener>;
  refcount: number;
  status: RoomStatus;
}

/**
 * Registry refcount phòng đang mở, MODULE THUẦN (không phải Zustand) — cùng mô
 * hình `app/src/core/socket/room-subscriptions.ts`, gộp vào MỘT file cho admin
 * (ít consumer hơn app, tách 2 file không đáng). Nhiều hook
 * `useRoomSubscription` cùng xem một phòng chỉ sinh ĐÚNG MỘT `room:join` thật;
 * refcount về 0 mới `room:leave`. Reset khi logout (`SocketProvider`).
 */
const rooms = new Map<string, RoomEntry>();

function keyOf(kind: string, id: string): string {
  return `${kind} ${id}`;
}

function notify(entry: RoomEntry): void {
  entry.listeners.forEach((listener) => listener(entry.status));
}

async function join(entry: RoomEntry): Promise<void> {
  const ack = await emitWithAck(SocketEvent.JOIN_ROOM, { id: entry.id, kind: entry.kind });
  // Phòng có thể đã bị release (refcount về 0, hoặc join lại từ đầu) TRONG LÚC
  // đang chờ ack — bỏ kết quả trễ, đừng ghi đè trạng thái của một lượt SAU.
  if (rooms.get(keyOf(entry.kind, entry.id)) !== entry || entry.refcount <= 0) return;
  entry.status = ack.ok ? { status: 'joined' } : { status: 'denied', code: ack.code };
  notify(entry);
}

/**
 * Đăng ký quan tâm một phòng — refcount 0→1 mới thật sự gửi `room:join`.
 * `listener` nhận trạng thái NGAY (giá trị hiện có) rồi mỗi lần đổi sau đó.
 * Trả về hàm huỷ đăng ký (refcount 1→0 thì gửi `room:leave`).
 */
function acquireRoom(kind: string, id: string, listener: Listener): () => void {
  const key = keyOf(kind, id);
  let entry = rooms.get(key);
  if (!entry) {
    entry = { id, kind, listeners: new Set(), refcount: 0, status: { status: 'pending' } };
    rooms.set(key, entry);
  }

  entry.listeners.add(listener);
  listener(entry.status);
  entry.refcount += 1;
  if (entry.refcount === 1) void join(entry);

  return () => releaseRoom(key, listener);
}

function releaseRoom(key: string, listener: Listener): void {
  const entry = rooms.get(key);
  if (!entry) return;

  entry.listeners.delete(listener);
  entry.refcount = Math.max(0, entry.refcount - 1);
  if (entry.refcount === 0) {
    rooms.delete(key);
    void emitWithAck(SocketEvent.LEAVE_ROOM, { id: entry.id, kind: entry.kind });
  }
}

/** `socket.on('connect')` — mọi phòng còn refcount > 0 phải join LẠI (server không nhớ phòng cũ qua connection mới). */
function rejoinAll(): void {
  rooms.forEach((entry) => {
    if (entry.refcount <= 0) return;
    entry.status = { status: 'pending' };
    notify(entry);
    void join(entry);
  });
}

socket.on('connect', rejoinAll);

/** CHỈ dùng trong test/logout: xoá sạch registry (`SocketProvider` gọi khi rời trạng thái đăng nhập). */
export function resetRoomSubscriptions(): void {
  rooms.clear();
}

export interface UseRoomSubscriptionOptions {
  /** `false` ⇒ không join (chưa biết `id`, màn chưa cần dữ liệu realtime của phòng này…). Mặc định `true`. */
  enabled?: boolean;
}

/**
 * Đăng ký quan tâm một phòng Socket.IO trong vòng đời component.
 *
 * ```tsx
 * const { status, code } = useRoomSubscription('admin', 'ops');
 * if (status === 'denied') return null; // không đủ quyền `dashboard:view`
 * ```
 *
 * Refcount thật nằm ở registry module-scope phía trên — hai component cùng mở
 * một phòng chỉ sinh MỘT `room:join`; unmount cả hai mới `room:leave`. Rejoin
 * sau mất kết nối cũng do registry đó lo (`socket.on('connect', rejoinAll)`),
 * hook này chỉ đọc lại trạng thái mới nhất.
 */
export function useRoomSubscription(
  kind: string,
  id: string | null | undefined,
  { enabled = true }: UseRoomSubscriptionOptions = {},
): RoomStatus {
  const [status, setStatus] = useState<RoomStatus>({ status: 'pending' });

  useEffect(() => {
    // Không cần tự `setStatus({status:'pending'})` ở đây khi tắt/thiếu `id` —
    // biểu thức trả về bên dưới đã ép `pending` cho ca đó rồi.
    if (!enabled || !id) return undefined;
    return acquireRoom(kind, id, setStatus);
  }, [kind, id, enabled]);

  return enabled && id ? status : { status: 'pending' };
}
