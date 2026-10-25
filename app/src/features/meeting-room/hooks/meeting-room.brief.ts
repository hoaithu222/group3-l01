import { queryClient } from '@/core/config/query-client';

import { meetingRoomKeys, MEETINGS_DETAIL_KEY } from '../api/meeting-room.keys';
import { meetingRoomService } from '../api/meeting-room.service';
import type { MeetingBrief } from '../api/meeting-room.types';
import { meetingRoomApi } from '../store/meeting-room.store';
import { isInRoomPhase } from './meeting-room.teardown';

/** Chênh lệch `giờ server − giờ máy` (ms) tại lúc nhận `serverNow` — đồng hồ họp theo giờ server (`02-conventions.md` §2). */
export const serverOffsetOf = (serverNow: string, receivedAt = Date.now()): number => Date.parse(serverNow) - receivedAt;

/** Chi tiết mới nhất vào store (tiêu đề, `myActions`, `startedAt`, đồng hồ theo giờ server). Chỉ nhận đúng cuộc họp đang mở. */
export function applyBrief(brief: MeetingBrief): void {
  const state = meetingRoomApi.get();
  if (state.meetingId !== brief.id) return;
  meetingRoomApi.patch({
    brief,
    lockedAt: isInRoomPhase(state.phase) ? state.lockedAt : (brief.lockedAt ?? null),
    serverOffsetMs: serverOffsetOf(brief.serverNow, brief.receivedAt),
    startedAt: brief.startedAt ?? state.startedAt,
  });
}

/** Tải lại chi tiết: ghi cache của pre-join + store, và làm mới chi tiết bên lịch họp (`myActions`, trạng thái). Lỗi → `null`, không ném. */
export async function refreshBrief(meetingId: string): Promise<MeetingBrief | null> {
  try {
    const brief = await meetingRoomService.getBrief(meetingId);
    queryClient.setQueryData(meetingRoomKeys.brief(meetingId), brief);
    applyBrief(brief);
    void queryClient.invalidateQueries({ queryKey: MEETINGS_DETAIL_KEY(meetingId) });
    return brief;
  } catch {
    return null;
  }
}
