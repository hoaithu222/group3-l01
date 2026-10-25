import { View } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Section } from '@/shared/ui/section';

import type { CallParticipantDto } from '../../api/calls.types';
import { sortRaisedHands } from '../hooks/useRaisedHandsQueue';
import { RoomParticipantRow } from './RoomParticipantRow';

const IN_ROOM: readonly CallParticipantDto['state'][] = ['CONNECTED', 'JOINING', 'RECONNECTING'];

export interface RoomParticipantsSheetProps {
  hostId: string | null;
  /** Mình là chủ phòng → hàng của người khác có nút ⋯. */
  isHost: boolean;
  meId: string | null;
  onClose: () => void;
  onOpenMenu: (participant: CallParticipantDto) => void;
  participants: CallParticipantDto[];
  visible: boolean;
}

/**
 * "Người tham gia" (app.md §3): mục "Đang giơ tay" theo THỨ TỰ SERVER (VR-10) rồi "Trong phòng"; chủ phòng thấy ⋯ ở từng người khác. Người
 * đang giơ tay xuất hiện ở CẢ hai mục — mục trên là hàng đợi phát biểu, mục dưới là danh sách đầy đủ.
 *
 * ✅ Tiêu đề nhóm là `Section tone="default"` (16 semibold, chữ chính — mốc `header` cho trình đọc màn hình) thay cho dòng chữ
 * xám 14 tự dựng; giữa hai nhóm đúng MỘT khe `gap-md`.
 */
export function RoomParticipantsSheet({
  hostId,
  isHost,
  meId,
  onClose,
  onOpenMenu,
  participants,
  visible,
}: RoomParticipantsSheetProps) {
  const inRoom = participants.filter((p) => IN_ROOM.includes(p.state));
  const raised = sortRaisedHands(inRoom);
  const menuFor = (p: CallParticipantDto) =>
    isHost && p.userId !== meId && p.userId !== hostId ? onOpenMenu : undefined;

  return (
    <BottomSheet
      padded={false}
      scrollable
      title={`Người tham gia (${String(inRoom.length)})`}
      visible={visible}
      onClose={onClose}
    >
      {/* `SheetList` cấp lề 16 cho CẢ tiêu đề nhóm lẫn hàng người (`ListItem` không tự có lề trong tấm `padded={false}`) — vì vậy tiêu đề
          nhóm không tự khai `px-md`, khai thêm là thụt 32dp. */}
      <SheetList className="gap-md pb-md">
        {raised.length > 0 ? (
          <Section title={`Đang giơ tay (${raised.length})`} tone="default">
            {/* ⚠️ MỘT `View` bọc các hàng: `Section` xếp con bằng `gap` — hàng có kẻ nằm trần trong đó thì kẻ và hàng kế tiếp hở ra. */}
            <View accessibilityRole="list">
              {raised.map((p, index) => (
                <RoomParticipantRow
                  key={`hand-${p.userId}`}
                  divider={index < raised.length - 1}
                  handOrder={index + 1}
                  isHost={p.userId === hostId}
                  isMe={p.userId === meId}
                  participant={p}
                  onOpenMenu={menuFor(p)}
                />
              ))}
            </View>
          </Section>
        ) : null}
        <Section title="Trong phòng" tone="default">
          <View accessibilityRole="list">
            {inRoom.map((p, index) => (
              <RoomParticipantRow
                key={p.userId}
                divider={index < inRoom.length - 1}
                isHost={p.userId === hostId}
                isMe={p.userId === meId}
                participant={p}
                onOpenMenu={menuFor(p)}
              />
            ))}
          </View>
        </Section>
      </SheetList>
    </BottomSheet>
  );
}
