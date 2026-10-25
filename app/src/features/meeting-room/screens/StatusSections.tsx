import { CameraPreview } from '../components/prejoin/CameraPreview';
import { MeetingEndedView } from '../components/ended/MeetingEndedView';
import { JoinBlockedView } from '../components/waiting/JoinBlockedView';
import { LobbyWaitingView } from '../components/waiting/LobbyWaitingView';
import { WaitingForHostView } from '../components/waiting/WaitingForHostView';
import { ENDED_REASON_LABEL } from '../constants/meeting-room.constants';
import { usePreJoinDevices } from '../hooks/usePreJoinDevices';
import { useRenderVideo } from '../hooks/useRenderVideo';
import { useServerNow } from '../hooks/useServerNow';
import type { MeetingEndReason } from '../api/meeting-room.types';
import { useMeetingRoomStore } from '../store/meeting-room.store';
import { remainingMs } from '../utils/clock.utils';
import { openExternalMeetingLink } from '../utils/open-external';

/**
 * Các MÀN TRẠNG THÁI quanh phòng (app.md §3.2): chờ chủ trì, chờ vào phòng (lobby), không vào được/bị mời ra, đã kết thúc. Mỗi màn chỉ nối
 * component thuần với store/hook — không có logic riêng. Cả bốn là màn đầy đủ (tự có `Screen` + `AppBar`).
 */

/** Chờ chủ trì: đếm ngược tới giờ bắt đầu theo GIỜ SERVER; vẫn xem trước camera/đổi thiết bị được. */
export function WaitingSection({ onExit }: { onExit: () => void }) {
  const brief = useMeetingRoomStore((state) => state.brief);
  const waiting = useMeetingRoomStore((state) => state.waiting);
  const devices = usePreJoinDevices(true);
  const renderVideo = useRenderVideo();
  const nowMs = useServerNow(true);
  const startAt = waiting?.startAt ?? brief?.startAt ?? '';

  return (
    <WaitingForHostView
      previewSlot={
        <CameraPreview
          camOn={devices.prefs.cam}
          displayName={devices.prefs.displayName}
          facing={devices.prefs.facing}
          previewRef={devices.previewRef}
          renderVideo={renderVideo}
          onFlipCamera={devices.flipCamera}
        />
      }
      remainingMs={remainingMs(startAt, nowMs)}
      startAt={startAt}
      title={brief?.title ?? 'Cuộc họp'}
      onExit={onExit}
    />
  );
}

/** Chờ chủ trì cho vào: "Huỷ yêu cầu" → `DELETE lobby/me` rồi về pre-join. */
export function LobbySection({ onCancel }: { onCancel: () => void }) {
  const title = useMeetingRoomStore((state) => state.brief?.title);
  const busy = useMeetingRoomStore((state) => state.busy);
  return <LobbyWaitingView cancelling={busy} title={title} onCancel={onCancel} />;
}

/** Không vào được (khoá, đầy, đã kết thúc, bị từ chối…) hoặc bị mời ra (`MEET_013`). `MEET_010` có "Mở liên kết cuộc họp" nếu biết link. */
export function BlockedSection({ onExit, removed = false }: { onExit: () => void; removed?: boolean }) {
  const code = useMeetingRoomStore((state) => state.blockedCode);
  const externalUrl = useMeetingRoomStore((state) => state.brief?.externalUrl);
  return (
    <JoinBlockedView
      code={removed ? 'MEET_013' : (code ?? 'GONE')}
      onClose={onExit}
      onOpenExternal={externalUrl ? () => void openExternalMeetingLink(externalUrl) : undefined}
    />
  );
}

const isEndReason = (value: string | null): value is MeetingEndReason => value !== null && value in ENDED_REASON_LABEL;

/**
 * "Cuộc họp đã kết thúc · 45 phút" + lý do. Lý do lạ (server thêm mã mới) bị bỏ chứ không in mã kỹ thuật ra màn. p2-06: người sửa được biên bản
 * (`myActions.canEditRecap` — chủ trì/đồng chủ trì) của cuộc họp `recapRequired` thấy nút chính "Viết biên bản" → trình soạn (`onWriteRecap`).
 * `MOVED_DEVICE` (cuộc họp vẫn chạy, chỉ phiên trên máy này dừng) ⇒ thêm "Vào lại trên máy này" (`onRejoin`).
 */
export function EndedSection({ onExit, onRejoin, onWriteRecap }: { onExit: () => void; onRejoin?: () => void; onWriteRecap?: () => void }) {
  const durationSec = useMeetingRoomStore((state) => state.endedDurationSec);
  const reason = useMeetingRoomStore((state) => state.endedReason);
  const title = useMeetingRoomStore((state) => state.brief?.title);
  const canWriteRecap = useMeetingRoomStore((state) => !!state.brief?.recapRequired && state.brief.myActions.canEditRecap === true);
  return (
    <MeetingEndedView
      canWriteRecap={canWriteRecap}
      durationSec={durationSec}
      reason={isEndReason(reason) ? reason : null}
      title={title}
      onClose={onExit}
      // Chỉ `MOVED_DEVICE` là phiên của MÌNH dừng còn cuộc họp vẫn chạy (đã vào bằng máy khác) ⇒ vào lại được; các lý do khác là họp đã đóng.
      onRejoin={reason === 'MOVED_DEVICE' ? onRejoin : undefined}
      onWriteRecap={onWriteRecap}
    />
  );
}
