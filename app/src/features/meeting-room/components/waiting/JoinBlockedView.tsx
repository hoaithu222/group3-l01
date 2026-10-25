import { Button } from '@/shared/ui/button';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { BlockedCode } from '../../api/meeting-room.types';
import { BLOCKED_COPY } from '../../constants/meeting-room.constants';
import { StatusPage } from './StatusPage';

export interface JoinBlockedViewProps {
  code: BlockedCode;
  /** Có (và `code === 'MEET_010'`) ⇒ thêm nút "Mở liên kết cuộc họp" — cuộc họp chạy trên nền tảng ngoài. */
  onOpenExternal?: () => void;
  onClose: () => void;
}

/**
 * Hình minh hoạ theo LÝ DO bị chặn — cùng quy ước tông với `EmptyState`/`ScreenState`: bị khoá/đủ người/bị từ chối = `warning` (cần chú ý,
 * không phải lỗi), chưa tới giờ = `info` (chỉ cần chờ), không còn diễn ra/không còn khả dụng = `neutral`. ⛔ Không `danger`: đây là thông
 * báo trung tính, không đổ lỗi cho người dùng.
 */
const BLOCKED_ART: Record<BlockedCode, { icon: IconName; tone: IconTileTone }> = {
  DENIED: { icon: 'user', tone: 'warning' },
  GONE: { icon: 'calendar', tone: 'neutral' },
  MEET_006: { icon: 'timer', tone: 'info' },
  MEET_007: { icon: 'lock', tone: 'warning' },
  MEET_009: { icon: 'calendar', tone: 'neutral' },
  MEET_010: { icon: 'link', tone: 'info' },
  MEET_012: { icon: 'clock', tone: 'info' },
  MEET_013: { icon: 'logout', tone: 'warning' },
  MEET_017: { icon: 'user', tone: 'warning' },
  MEET_018: { icon: 'add-team', tone: 'warning' },
};

/**
 * Màn "không vào được" (app.md p2-05 §3.2 `JoinBlockedView`): khoá (`MEET_007`), bị mời ra (`MEET_013`), bị từ chối/không cho vào
 * (`MEET_017`/`DENIED`), đầy (`MEET_018`), đã kết thúc/huỷ (`MEET_009`), nền tảng ngoài (`MEET_010`)… Lời lẽ TRUNG TÍNH lấy từ
 * `BLOCKED_COPY` — không phải lỗi đỏ, không đổ lỗi cho người dùng, không lộ chi tiết nội bộ.
 *
 * `GONE` (404/mất quyền) không còn màn chi tiết để quay về nên nút là "Đóng"; các mã còn lại là "Về chi tiết cuộc họp".
 */
export function JoinBlockedView({ code, onClose, onOpenExternal }: JoinBlockedViewProps) {
  const copy = BLOCKED_COPY[code];
  const art = BLOCKED_ART[code];
  const external = code === 'MEET_010' && onOpenExternal !== undefined;
  const closeLabel = code === 'GONE' ? 'Đóng' : 'Về chi tiết cuộc họp';

  return (
    <StatusPage
      actions={
        <>
          {external ? <Button fullWidth iconLeft="link" label="Mở liên kết cuộc họp" onPress={onOpenExternal} /> : null}
          <Button fullWidth label={closeLabel} variant={external ? 'secondary' : 'primary'} onPress={onClose} />
        </>
      }
      description={copy.description}
      headerTitle="Cuộc họp"
      icon={art.icon}
      title={copy.title}
      tone={art.tone}
      onBack={onClose}
    />
  );
}
