import { queryClient } from '@/core/config/query-client';
import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomKeys, MEETINGS_DETAIL_KEY, MEETINGS_RANGES_KEY } from '../api/meeting-room.keys';
import { meetingRoomService } from '../api/meeting-room.service';
import { meetingRoomApi } from '../store/meeting-room.store';
import { hostActionMessage } from '../utils/meeting-room-errors';
import { applyBrief } from './meeting-room.brief';
import { cancelLobbyRequest } from './meeting-room.join';
import { goEnded, isInRoomPhase, leaveQuietly, teardownMeetingSession } from './meeting-room.teardown';
import { resetMeetingRoomStores } from './reset-meeting-room-stores';

/**
 * Rời/kết thúc/dọn phiên (app.md §4.1 bước 7). Hàm thuần store/service — không phải hook, để đăng xuất (`wipeUserData`) và màn phòng
 * dùng chung một đường dọn.
 */

/** Ảnh chụp phòng/danh sách chờ của một cuộc họp không còn đúng sau khi rời — bỏ để lần vào sau không nháy dữ liệu cũ. */
function dropRoomCaches(meetingId: string): void {
  queryClient.removeQueries({ queryKey: meetingRoomKeys.room(meetingId) });
  queryClient.removeQueries({ queryKey: meetingRoomKeys.lobby(meetingId) });
  void queryClient.invalidateQueries({ queryKey: MEETINGS_DETAIL_KEY(meetingId) });
  // Kết thúc cho mọi người/rời phòng đổi trạng thái thẻ trên lịch (tab Lịch họp vẫn mounted) — BE không phát `meeting:updated`.
  void queryClient.invalidateQueries({ queryKey: MEETINGS_RANGES_KEY });
}

/**
 * Rời phòng (cuộc họp vẫn chạy cho người khác). `transferControlTo`: giao quyền đồng chủ trì cho một người trong phòng TRƯỚC khi rời —
 * lời gọi phải tới server khi ta còn trong phiên, nên đi trước lúc ngắt media. Không giao quyền: ngắt ngay (âm thanh dừng tức thì) rồi
 * báo server có thử lại.
 */
export async function leaveMeeting(transferControlTo?: string): Promise<void> {
  const { meetingId } = meetingRoomApi.get();
  meetingRoomApi.patch({ busy: true });
  if (meetingId && transferControlTo) {
    const transferred = await leaveQuietly(meetingId, transferControlTo);
    if (!transferred) showToast('warning', 'Chưa giao được quyền cho người khác, nhưng bạn đã rời phòng.');
    await teardownMeetingSession();
  } else {
    await teardownMeetingSession();
    if (meetingId) void leaveQuietly(meetingId);
  }
  meetingRoomApi.reset();
  if (meetingId) dropRoomCaches(meetingId);
}

/** Kết thúc cuộc họp cho MỌI NGƯỜI (chỉ chủ trì/đồng chủ trì): chờ server xác nhận rồi mới sang màn "đã kết thúc". Lỗi thì ở lại phòng + toast. */
export async function endMeetingForAll(): Promise<boolean> {
  const { meetingId } = meetingRoomApi.get();
  if (!meetingId) return false;
  meetingRoomApi.patch({ busy: true });
  try {
    const brief = await meetingRoomService.end(meetingId);
    applyBrief(brief);
    const started = brief.startedAt ? Date.parse(brief.startedAt) : Number.NaN;
    const ended = brief.endedAt ? Date.parse(brief.endedAt) : Number.NaN;
    await goEnded('HOST_ENDED', Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, Math.floor((ended - started) / 1000)) : null);
    dropRoomCaches(meetingId);
    return true;
  } catch (error) {
    meetingRoomApi.patch({ busy: false });
    showToast('error', hostActionMessage(error));
    return false;
  }
}

/**
 * Rời MÀN (khác rời họp): đang ở/nối phòng thì KHÔNG bỏ phiên — chỉ đánh dấu thu nhỏ để `MeetingMiniBar` hiện (không bao giờ lặng lẽ làm rớt một
 * cuộc họp đang chạy). Đang xếp hàng lobby thì huỷ yêu cầu (đừng để chủ trì thấy người đã bỏ đi). Còn lại (pre-join, chờ chủ trì, màn kết
 * thúc/không vào được) thì dọn sạch để lần mở sau bắt đầu mới. Trả `true` khi phòng vẫn sống.
 */
export async function dismissRoomScreen(): Promise<boolean> {
  const { phase } = meetingRoomApi.get();
  if (isInRoomPhase(phase)) {
    meetingRoomApi.patch({ minimized: true, sheet: 'NONE' });
    return true;
  }
  if (phase === 'IN_LOBBY') await cancelLobbyRequest();
  await resetMeetingRoomStores();
  return false;
}
