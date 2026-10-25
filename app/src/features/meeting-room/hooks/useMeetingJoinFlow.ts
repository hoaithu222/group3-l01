import { useEffect } from 'react';

import type { MeetingBrief } from '../api/meeting-room.types';
import { useMeetingBrief } from '../queries/meeting-room.queries';
import { meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';
import { classifyJoinError } from '../utils/meeting-room-errors';
import { applyBrief } from './meeting-room.brief';
import { beginMeeting, cancelLobbyRequest, submitJoin } from './meeting-room.join';
import { leaveMeeting } from './meeting-room.leave';
import { goBlocked } from './meeting-room.teardown';

export type BriefState = 'error' | 'loading' | 'offline' | 'ready';

export interface MeetingJoinFlow {
  brief: MeetingBrief | null;
  briefState: BriefState;
  /** Đang ở phòng của cuộc họp KHÁC — cần hỏi "Chuyển sang cuộc họp này?" trước khi làm gì. */
  needsSwitch: boolean;
  primaryLabel: string;
  cancelLobby: () => Promise<void>;
  confirmBusyConflict: () => Promise<void>;
  confirmSwitch: () => Promise<void>;
  retryBrief: () => void;
  submit: () => Promise<void>;
  submitListenOnly: () => Promise<void>;
}

/** Nhãn nút chính theo `myActions` (app.md §3.2): chủ trì chưa bắt đầu → "Bắt đầu cuộc họp"; sẽ vào lobby → "Xin vào"; còn lại "Tham gia". */
function primaryLabelOf(brief: MeetingBrief | null): string {
  if (!brief) return 'Tham gia';
  if (brief.myActions.canStart) return 'Bắt đầu cuộc họp';
  return brief.myActions.joinVia === 'LOBBY' ? 'Xin vào' : 'Tham gia';
}

/**
 * Máy trạng thái vào phòng của màn (app.md §2 `useMeetingJoinFlow`, §3.1): mở phiên cho `meetingId`, tải chi tiết (nguồn của nhãn nút
 * chính), đưa các bước "bấm nút chính / chỉ nghe / huỷ hàng chờ / chuyển phòng" xuống controller (`meeting-room.join.ts`). Bản thân hook
 * không giữ state riêng — mọi thứ nằm trong store để thu nhỏ/mở lại phòng không mất.
 */
export function useMeetingJoinFlow(meetingId: string): MeetingJoinFlow {
  const storeMeetingId = useMeetingRoomStore((state) => state.meetingId);
  const storeBrief = useMeetingRoomStore((state) => state.brief);
  const query = useMeetingBrief(meetingId);
  const owns = storeMeetingId === meetingId;

  useEffect(() => {
    beginMeeting(meetingId);
  }, [meetingId]);

  useEffect(() => {
    if (owns && query.data) applyBrief(query.data);
  }, [owns, query.data]);

  useEffect(() => {
    if (!owns || !query.error || meetingRoomApi.get().phase !== 'PREJOIN') return;
    const failure = classifyJoinError(query.error);
    if (failure.kind === 'BLOCKED') void goBlocked(failure.code);
  }, [owns, query.error]);

  const brief = owns ? (storeBrief ?? query.data ?? null) : null;
  let briefState: BriefState = 'ready';
  if (!brief && query.error) briefState = classifyJoinError(query.error).kind === 'OFFLINE' ? 'offline' : 'error';
  else if (!brief) briefState = 'loading';

  return {
    brief,
    briefState,
    cancelLobby: cancelLobbyRequest,
    confirmBusyConflict: () => submitJoin({ force: true }),
    confirmSwitch: async () => {
      // Phiên cũ đang xếp hàng lobby thì huỷ yêu cầu trước (đừng để chủ trì thấy một người đã chuyển đi).
      if (meetingRoomApi.get().phase === 'IN_LOBBY') await cancelLobbyRequest();
      await leaveMeeting();
      beginMeeting(meetingId);
    },
    needsSwitch: storeMeetingId !== null && !owns,
    primaryLabel: primaryLabelOf(brief),
    retryBrief: () => void query.refetch(),
    submit: () => submitJoin(),
    submitListenOnly: async () => {
      meetingRoomApi.patch({ preJoin: { ...meetingRoomApi.get().preJoin, cam: false, listenOnly: true, mic: false } });
      await submitJoin();
    },
  };
}
