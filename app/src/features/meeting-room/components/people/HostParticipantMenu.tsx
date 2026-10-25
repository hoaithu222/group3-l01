import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { IconTile, iconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Toggle } from '@/shared/ui/toggle';

import type { RoomRole } from '../../api/meeting-room.types';
import { ROLE_LABEL } from '../../constants/meeting-room.constants';
import type { RoomPerson } from '../../utils/room-people.utils';
import { HandGlyph } from '../hand/HandGlyph';

export interface HostParticipantMenuProps {
  /**
   * Cha tính: người xem là HOST VÀ người này KHÔNG phải chủ trì/đồng chủ trì THEO LỊCH. Vai theo lịch không đổi được trong phòng —
   * chỉ CO_HOST cấp tạm trong phiên mới cấp/thu được (BE `setRole`).
   */
  canChangeRole: boolean;
  /** Vai của NGƯỜI XEM trong phiên. `MEMBER` ⇒ không có menu nào để hiện. */
  meRole: RoomRole;
  /** Người đang được thao tác; `null` ⇒ đóng. */
  person: RoomPerson | null;
  onClose: () => void;
  /** "Hạ tay" — chỉ hiện khi người này ĐANG giơ tay (BE `POST /hands/:userId/lower`). */
  onLowerHand?: () => void;
  onMuteCamera: () => void;
  onMuteMic: () => void;
  /** `alsoRemoveAttendee`: xoá luôn khỏi danh sách tham dự. Cha nên xác nhận (`ConfirmHostActionDialog`) trước khi gọi API. */
  onRemove: (alsoRemoveAttendee: boolean) => void;
  onSetRole: (role: 'CO_HOST' | 'MEMBER') => void;
  onStopShare: () => void;
}

/**
 * Menu thao tác chủ trì trên MỘT người (app.md p2-05 §3.2 `HostParticipantMenu`): Hạ tay (chỉ khi đang giơ tay) · Tắt mic · Tắt camera · Dừng chia sẻ (chỉ khi đang chia
 * sẻ) · Cấp/Thu quyền đồng chủ trì (chỉ HOST) · Mời ra khỏi cuộc họp (+ tuỳ chọn xoá khỏi danh sách tham dự).
 *
 * ⛔ CỐ Ý KHÔNG có "Bật mic/camera người khác" (P0, §7): chủ trì chỉ TẮT; người kia tự bật lại — bật hộ là xâm phạm quyền riêng tư.
 * ⛔ "Mời ra" KHÔNG hiện với chủ trì (`HOST`), và đồng chủ trì không thấy nó với chủ trì/đồng chủ trì khác (server cũng chặn: MEET_019).
 *
 * Mỗi mục đóng menu rồi mới chạy việc (đúng khuôn `AttendeeActionsSheet` của p2-04). Tùy chọn "Xoá khỏi danh sách tham dự" nhớ THEO
 * NGƯỜI (đổi người là về tắt) — không dùng effect để reset.
 */
export function HostParticipantMenu({
  canChangeRole,
  meRole,
  person,
  onClose,
  onLowerHand,
  onMuteCamera,
  onMuteMic,
  onRemove,
  onSetRole,
  onStopShare,
}: HostParticipantMenuProps) {
  const [removeFlag, setRemoveFlag] = useState<{ userId: string; value: boolean } | null>(null);
  if (!person || meRole === 'MEMBER') return null;

  const alsoRemove = removeFlag?.userId === person.userId && removeFlag.value;
  const canRemove = person.role !== 'HOST' && (meRole === 'HOST' || person.role === 'MEMBER');
  const canGrant = meRole === 'HOST' && canChangeRole && person.role !== 'HOST';
  const sharing = person.screenShareRef !== null && person.screenShareRef !== undefined;
  const pick = (run: () => void) => () => {
    onClose();
    run();
  };

  return (
    <BottomSheet
      description={ROLE_LABEL[person.role] || undefined}
      padded={false}
      title={person.name}
      visible
      onClose={onClose}
    >
      {/* `SheetList`: tấm `padded={false}` + `ListItem` trần ⇒ icon dính sát mép tấm (`ListItem` không tự có lề). Công tắc bên dưới
          không cần `px-md` riêng nữa — lề do `SheetList` cấp, khai thêm là thụt 32dp. */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {/* Ô icon có tông cho từng việc (cùng khuôn menu "Thêm" của phòng); mục đang không làm được (mic/camera đã tắt) mờ theo
            `disabled` của hàng, ô icon chuyển `neutral` để không trông như còn bấm được.
            ⚠️ Kẻ ngăn chỉ khi CÒN hàng phía sau — mục cuối thay đổi theo quyền/trạng thái (đồng chủ trì xem đồng chủ trì khác chỉ
            còn hai mục), kẻ cố định thì lòi một đường cụt dưới mục cuối. */}
        {person.handRaisedAt && onLowerHand ? (
          // Đứng ĐẦU khi người này đang giơ tay — việc chủ trì hay làm nhất lúc đó (như Meet). Ô `warning` + ✋: bộ icon không có bàn tay.
          <ListItem
            divider
            emphasis="title"
            label="Hạ tay"
            leading={
              <View className={iconTile({ size: 'sm', tone: 'warning' }).root()}>
                <HandGlyph size="sm" />
              </View>
            }
            onPress={pick(onLowerHand)}
          />
        ) : null}
        <ListItem
          description={person.micEnabled ? undefined : 'Mic đang tắt'}
          disabled={!person.micEnabled}
          divider
          emphasis="title"
          label="Tắt mic"
          leading={
            <IconTile name="mic-01" size="sm" tone={person.micEnabled ? 'brand' : 'neutral'} />
          }
          onPress={pick(onMuteMic)}
        />
        <ListItem
          description={person.cameraEnabled ? undefined : 'Camera đang tắt'}
          disabled={!person.cameraEnabled}
          divider={sharing || canGrant || canRemove}
          emphasis="title"
          label="Tắt camera"
          leading={
            <IconTile
              name="video-camera"
              size="sm"
              tone={person.cameraEnabled ? 'info' : 'neutral'}
            />
          }
          onPress={pick(onMuteCamera)}
        />
        {sharing ? (
          <ListItem
            divider={canGrant || canRemove}
            emphasis="title"
            label="Dừng chia sẻ"
            leading={<IconTile name="lap" size="sm" tone="accent" />}
            onPress={pick(onStopShare)}
          />
        ) : null}
        {canGrant ? (
          <ListItem
            divider={canRemove}
            emphasis="title"
            label={person.role === 'CO_HOST' ? 'Thu quyền đồng chủ trì' : 'Cấp quyền đồng chủ trì'}
            leading={<IconTile name="user-setting-1" size="sm" tone="success" />}
            onPress={pick(() => onSetRole(person.role === 'CO_HOST' ? 'MEMBER' : 'CO_HOST'))}
          />
        ) : null}
        {canRemove ? (
          <>
            <View className="py-xs">
              <Toggle
                description="Người này cũng bị gỡ khỏi lời mời và không vào lại được."
                label="Xoá khỏi danh sách tham dự"
                value={alsoRemove}
                onChange={(value) => setRemoveFlag({ userId: person.userId, value })}
              />
            </View>
            <ListItem
              emphasis="danger"
              label="Mời ra khỏi cuộc họp"
              leading={<IconTile name="logout" size="sm" tone="danger" />}
              onPress={pick(() => onRemove(alsoRemove))}
            />
          </>
        ) : null}
      </SheetList>
    </BottomSheet>
  );
}
