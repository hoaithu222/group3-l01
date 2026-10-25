import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Chỉ MỘT bản chạy "runtime" phòng họp (socket, phòng `meet:`/`call:`, giữ màn sáng) dù có hai nơi cùng mount `useMeetingRoomRuntime`:
 * `MeetingRoomHost` (gắn toàn cục ở `app/(app)/_layout.tsx` để phòng vẫn sống khi THU NHỎ) và `MeetingRoomScreen` (dự phòng khi chưa có
 * Host). Bản mount TRƯỚC làm chủ; nó gỡ thì bản kế tiếp tự lên thay — không xử lý một sự kiện hai lần, không có khoảng hở.
 */

const owners: symbol[] = [];
const hosts: symbol[] = [];
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

function useRegistered(list: symbol[]): symbol {
  const [token] = useState(() => Symbol('meeting-room'));
  useEffect(() => {
    list.push(token);
    notify();
    return () => {
      list.splice(list.indexOf(token), 1);
      notify();
    };
  }, [list, token]);
  return token;
}

/** `true` khi bản này là bản đang chạy runtime. */
export function useRuntimeOwner(): boolean {
  const token = useRegistered(owners);
  return useSyncExternalStore(subscribe, () => owners[0] === token);
}

/** `MeetingRoomHost` gọi hook này để báo "đã có nơi giữ phòng khi thu nhỏ" — màn phòng chỉ hiện nút "Thu nhỏ" khi `useHostMounted()`. */
export function useRegisterHost(): void {
  useRegistered(hosts);
}

export function useHostMounted(): boolean {
  return useSyncExternalStore(subscribe, () => hosts.length > 0);
}
