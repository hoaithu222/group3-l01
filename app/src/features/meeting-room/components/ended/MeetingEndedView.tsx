import { Button } from '@/shared/ui/button';

import type { MeetingEndReason } from '../../api/meeting-room.types';
import { ENDED_REASON_LABEL } from '../../constants/meeting-room.constants';
import { StatusPage } from '../waiting/StatusPage';

export interface MeetingEndedViewProps {
  /** Người được viết biên bản (chủ trì + `recapRequired`). Biên bản là p2-06 — chưa có thì cha để `false`, nút không hiện. */
  canWriteRecap?: boolean;
  /** Thời lượng đã diễn ra (giây); `null` = không biết (mất kết nối trước khi server báo) ⇒ chỉ hiện "Cuộc họp đã kết thúc". */
  durationSec: number | null;
  /** Lý do kết thúc; `null` ⇒ không có dòng lý do. */
  reason: MeetingEndReason | null;
  /** Tên cuộc họp (chữ nhỏ trên tiêu đề). */
  title?: string;
  onClose: () => void;
  /** Có ⇒ nút "Vào lại trên máy này" (cha chỉ truyền khi cuộc họp CÒN diễn ra cho người khác — vd phiên dừng vì vào bằng máy khác). */
  onRejoin?: () => void;
  onWriteRecap?: () => void;
}

/** "45 phút", "1 giờ 05 phút" — làm tròn phút, không bao giờ "0 phút" (dưới một phút nói thẳng là "dưới 1 phút"). */
function spokenDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return 'dưới 1 phút';
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${String(minutes)} phút`;
  const rest = minutes % 60;
  return rest === 0 ? `${String(Math.floor(minutes / 60))} giờ` : `${String(Math.floor(minutes / 60))} giờ ${String(rest).padStart(2, '0')} phút`;
}

/**
 * Màn "Cuộc họp đã kết thúc" (app.md p2-05 §3.2 `MeetingEndedView`): thời lượng, lý do (chủ trì kết thúc, hết giờ tối đa, phòng trống, chuyển
 * thiết bị…) bằng CHỮ, và đường về chi tiết cuộc họp. Ai cũng thấy màn này sau khi phòng đóng — kể cả người mất kết nối rồi mới nhận được `meeting:ended`.
 * "Viết biên bản" chỉ hiện khi cha bật `canWriteRecap` (p2-06); "Vào lại trên máy này" chỉ khi cha truyền `onRejoin`. Nút chính luôn là
 * việc TIẾP THEO hợp lý nhất (vào lại › viết biên bản › về chi tiết) — không có ngõ cụt.
 */
export function MeetingEndedView({ canWriteRecap = false, durationSec, reason, title, onClose, onRejoin, onWriteRecap }: MeetingEndedViewProps) {
  const recap = canWriteRecap && onWriteRecap !== undefined;
  const rejoin = onRejoin !== undefined;

  return (
    <StatusPage
      actions={
        <>
          {rejoin ? <Button fullWidth iconLeft="video-camera" label="Vào lại trên máy này" onPress={onRejoin} /> : null}
          {recap ? (
            <Button fullWidth iconLeft="edit" label="Viết biên bản" variant={rejoin ? 'secondary' : 'primary'} onPress={onWriteRecap} />
          ) : null}
          <Button fullWidth label="Về chi tiết cuộc họp" variant={recap || rejoin ? 'secondary' : 'primary'} onPress={onClose} />
        </>
      }
      description={reason ? ENDED_REASON_LABEL[reason] : undefined}
      eyebrow={title}
      headerTitle="Cuộc họp"
      icon="checkmark-circle"
      title={durationSec === null ? 'Cuộc họp đã kết thúc' : `Cuộc họp đã kết thúc · ${spokenDuration(durationSec)}`}
      tone="success"
      onBack={onClose}
    />
  );
}
