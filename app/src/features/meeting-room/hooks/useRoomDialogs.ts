import { useCallback, useState } from 'react';

/** Việc chủ trì cần xác nhận lần hai trước khi gọi server (không optimistic cho mời ra/kết thúc — app.md §4.2). */
export type RoomConfirm =
  | { kind: 'END_ALL' }
  | { kind: 'MUTE_ALL' }
  | { alsoRemoveAttendee: boolean; kind: 'REMOVE'; name: string; userId: string };

export interface RoomDialogs {
  confirm: RoomConfirm | null;
  leaveOpen: boolean;
  /** Người đang mở menu chủ trì (`HostParticipantMenu`). */
  menuUserId: string | null;
  askConfirm: (confirm: RoomConfirm) => void;
  closeLeave: () => void;
  closeMenu: () => void;
  dismissConfirm: () => void;
  openLeave: () => void;
  openMenu: (userId: string) => void;
}

/** Trạng thái các hộp thoại/menu trong phòng (rời, xác nhận việc chủ trì, menu một người) — tách khỏi `InRoomView` để màn chỉ còn bố cục. */
export function useRoomDialogs(): RoomDialogs {
  const [confirm, setConfirm] = useState<RoomConfirm | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);

  return {
    askConfirm: useCallback((next: RoomConfirm) => setConfirm(next), []),
    closeLeave: useCallback(() => setLeaveOpen(false), []),
    closeMenu: useCallback(() => setMenuUserId(null), []),
    confirm,
    dismissConfirm: useCallback(() => setConfirm(null), []),
    leaveOpen,
    menuUserId,
    openLeave: useCallback(() => setLeaveOpen(true), []),
    openMenu: useCallback((userId: string) => setMenuUserId(userId), []),
  };
}
