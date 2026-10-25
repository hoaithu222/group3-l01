import { useState } from 'react';

import { BottomSheet, ConfirmSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { ListItem } from '@/shared/ui/list';

import type { CallParticipantDto } from '../../api/calls.types';
import type { HostAction } from '../api/voice-room.types';

export interface HostParticipantMenuProps {
  /** Đang chờ server (mọi mục khoá, tránh bấm đúp — thao tác quyền phải chờ server, không optimistic). */
  busy: boolean;
  /** `null` = đóng. Chỉ chủ phòng mới mở được menu này (`RoomParticipantsSheet` không cấp `onOpenMenu` cho người thường). */
  onClose: () => void;
  onAction: (action: HostAction, target: CallParticipantDto) => void;
  target: CallParticipantDto | null;
}

/**
 * Menu điều khiển một người (app.md §3, README §6): nhãn phổ thông ("Mời ra khỏi phòng", "Chặn phát biểu"), KHÔNG "Kick/Ban". Mục nào chưa
 * dùng được thì KHOÁ kèm lý do (không ẩn). "Mời ra" luôn hỏi xác nhận nêu tên + hậu quả (không vào lại được phiên này).
 */
export function HostParticipantMenu({ busy, onAction, onClose, target }: HostParticipantMenuProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!target) return null;
  const name = target.name || 'thành viên này';
  const run = (action: HostAction) => onAction(action, target);

  return (
    <>
      <BottomSheet padded={false} title={name} visible={!confirmRemove} onClose={onClose}>
        {/* `SheetList`: tấm `padded={false}` + `ListItem` trần ⇒ chữ dính sát mép tấm (`ListItem` không tự có lề). */}
        <SheetList accessibilityRole="menu" className="pb-md">
          <ListItem
            disabled={busy}
            divider
            emphasis="title"
            label="Mời phát biểu"
            onPress={() => run('INVITE_SPEAK')}
          />
          <ListItem
            disabled={busy}
            divider
            emphasis="title"
            label="Yêu cầu tắt mic"
            onPress={() => run('MUTE_REQUEST')}
          />
          {target.mutedByHost ? (
            <ListItem
              description="Họ tự bật mic — bạn không bật mic hộ."
              disabled={busy}
              divider
              emphasis="title"
              label="Cho phép phát biểu lại"
              onPress={() => run('UNBLOCK_AUDIO')}
            />
          ) : (
            <ListItem
              disabled={busy}
              divider
              emphasis="title"
              label="Chặn phát biểu"
              onPress={() => run('BLOCK_AUDIO')}
            />
          )}
          <ListItem
            description={target.screenSharing ? undefined : 'Người này không chia sẻ màn hình.'}
            disabled={busy || !target.screenSharing}
            divider
            emphasis="title"
            label="Dừng chia sẻ màn hình"
            onPress={() => run('END_SHARE')}
          />
          <ListItem
            disabled={busy}
            divider
            emphasis="title"
            label="Chuyển quyền chủ phòng"
            onPress={() => run('TRANSFER')}
          />
          <ListItem
            disabled={busy}
            emphasis="danger"
            label="Mời ra khỏi phòng"
            onPress={() => setConfirmRemove(true)}
          />
        </SheetList>
      </BottomSheet>
      {/* ✅ `ConfirmSheet` (tông `danger`: ô biểu tượng + nút đỏ, [Huỷ | Mời ra]) thay cho `Dialog` giữa màn: đang ở tấm menu thì
          xác nhận trượt lên từ CÙNG chỗ — cùng khuôn "Rời phòng?" của `HostLeaveDialog` — chứ không nhảy sang hộp thoại giữa màn
          tông cảnh báo vàng cho một việc phá huỷ. */}
      <ConfirmSheet
        confirmLabel="Mời ra"
        description={`${name} sẽ bị ngắt khỏi phòng và không vào lại được phiên phòng này (phiên mới thì vào được).`}
        icon="logout"
        title={`Mời ${name} ra khỏi phòng?`}
        tone="danger"
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          run('REMOVE');
        }}
      />
    </>
  );
}
