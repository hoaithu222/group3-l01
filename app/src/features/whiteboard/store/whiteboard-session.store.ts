import { create } from 'zustand';

import { identityKey, uniqueUsers, type RemotePeer } from '../collab/awareness-peers';
import {
  INITIAL_SNAPSHOT,
  type SessionFailure,
  type SessionSnapshot,
} from '../collab/session-status';

export interface PresenceUser {
  color: string | null;
  id: string;
  name: string;
}

interface WhiteboardSessionState {
  failure: SessionFailure | null;
  /** Chữ ký danh tính của `peers` lần trước — để `users` chỉ dựng lại khi có người vào/ra/đổi tên. */
  identity: string;
  /** Người khác đang mở bảng (kèm con trỏ). Danh sách này đổi ở nhịp awareness (≤ 30 Hz mỗi người) — chỉ `RemoteCursors` đọc nó. */
  peers: RemotePeer[];
  snapshot: SessionSnapshot;
  /** MỖI NGƯỜI một dòng, bỏ chính mình — cho dải avatar. Tham chiếu ổn định khi chỉ con trỏ nhúc nhích. */
  users: PresenceUser[];
}

interface WhiteboardSessionActions {
  reset: () => void;
  setFailure: (failure: SessionFailure | null) => void;
  setPeers: (peers: RemotePeer[], selfUserId: string | undefined) => void;
  setSnapshot: (snapshot: SessionSnapshot) => void;
}

const INITIAL: WhiteboardSessionState = {
  failure: null,
  identity: '',
  peers: [],
  snapshot: INITIAL_SNAPSHOT,
  users: [],
};

/**
 * Trạng thái phiên collab của bảng ĐANG MỞ (kết nối, đồng bộ, lỗi, người khác) — không persist, reset khi vào/rời màn: trạng thái kết nối
 * của bảng trước không được rò sang bảng sau. Nội dung bảng KHÔNG nằm ở đây (nằm trong Y.Doc). Token KHÔNG bao giờ vào store (chỉ nằm trong
 * `CollabTokenProvider` của phiên).
 */
export const useWhiteboardSessionStore = create<
  WhiteboardSessionState & WhiteboardSessionActions
>((set) => ({
  ...INITIAL,
  reset: () => set(INITIAL),
  setFailure: (failure) => set({ failure }),
  setPeers: (peers, selfUserId) =>
    set((state) => {
      const identity = identityKey(peers);
      if (identity === state.identity) return { peers };
      return { identity, peers, users: uniqueUsers(peers, selfUserId) };
    }),
  setSnapshot: (snapshot) => set({ snapshot }),
}));
