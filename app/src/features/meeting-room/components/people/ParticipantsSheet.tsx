import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Tabs } from '@/shared/ui/tab';

import type { AttendeeLite, LobbyEntry, RoomRole } from '../../api/meeting-room.types';
import type { PanelGroups, RoomPerson } from '../../utils/room-people.utils';
import { InvitedList } from './InvitedList';
import { LobbyPanel } from './LobbyPanel';
import { ParticipantGroups } from './ParticipantGroups';

export interface ParticipantsSheetProps {
  admitAllPending?: boolean;
  /** Người TRONG PHÒNG đã chia nhóm (`groupForPanel(people)`). */
  groups: PanelGroups;
  /** Người được mời chưa vào phòng (tab "Được mời"). */
  invited: readonly AttendeeLite[];
  /** Danh sách chờ — chỉ chủ trì/đồng chủ trì thấy `LobbyPanel`; người thường không nhận dữ liệu này để hiện. */
  lobby: readonly LobbyEntry[];
  /** "Hạ tay tất cả" đang chạy. */
  lowerAllPending?: boolean;
  /** Người đang được hạ tay (loading đúng hàng). */
  loweringUserId?: string | null;
  meId: string;
  meRole: RoomRole;
  pendingLobbyUserIds?: readonly string[];
  visible: boolean;
  onAdmit: (userId: string) => void;
  onAdmitAll: () => void;
  onClose: () => void;
  onDeny: (userId: string) => void;
  /** "Hạ tay tất cả" ở đầu nhóm "Đang giơ tay" (chỉ chủ trì/đồng chủ trì thấy). */
  onLowerAllHands: () => void;
  /** "Hạ tay" của một hàng — chính mình thì tự hạ tay, người khác là thao tác chủ trì. */
  onLowerHand: (person: RoomPerson) => void;
  /** Chạm "Tuỳ chọn" trên một hàng — cha mở `HostParticipantMenu`. */
  onOpenPersonMenu: (person: RoomPerson) => void;
}

type TabKey = 'invited' | 'room';

/**
 * Tấm "Người tham gia" (app.md p2-05 §3.2 `ParticipantsSheet`, khuôn danh sách người của Meet/Zoom): hai tab — "Trong phòng (N)" (danh sách
 * chờ cho chủ trì ở ĐẦU, rồi "Đang giơ tay (n)" — hàng đợi phát biểu có số thứ tự, "Hạ tay"/"Hạ tay tất cả" — → Chủ trì/đồng chủ trì →
 * Thành viên, mỗi nhóm có số đếm) và "Được mời (M)" (chưa vào, kèm RSVP). Số đếm luôn bằng CHỮ, không chỉ chấm màu.
 *
 * Người thường chỉ thấy danh sách + trạng thái (và "Hạ tay" của CHÍNH mình); nút quản lý (`Tuỳ chọn`, `LobbyPanel`, hạ tay người khác) chỉ có
 * khi `meRole` là chủ trì/đồng chủ trì — quyền thật vẫn do server quyết, đây là để giao diện không mời bấm vào thứ chắc chắn bị từ chối.
 */
export function ParticipantsSheet({
  admitAllPending,
  groups,
  invited,
  lobby,
  lowerAllPending,
  loweringUserId,
  meId,
  meRole,
  pendingLobbyUserIds,
  visible,
  onAdmit,
  onAdmitAll,
  onClose,
  onDeny,
  onLowerAllHands,
  onLowerHand,
  onOpenPersonMenu,
}: ParticipantsSheetProps) {
  const [tab, setTab] = useState<TabKey>('room');
  const inRoom = groups.raised.length + groups.hosts.length + groups.others.length;
  const hostLike = meRole === 'HOST' || meRole === 'CO_HOST';

  return (
    <BottomSheet
      scrollable
      // Hàng tab ở khe `search` = ĐỨNG YÊN dưới tiêu đề: cuộn danh sách dài không cuốn mất chỗ đổi tab.
      search={
        <Tabs
          items={[
            { key: 'room', label: `Trong phòng (${String(inRoom)})` },
            { key: 'invited', label: `Được mời (${String(invited.length)})` },
          ]}
          value={tab}
          onChange={(key) => setTab(key === 'invited' ? 'invited' : 'room')}
        />
      }
      // ⚠️ Cao cố định (hết mức cho phép) chứ không vừa nội dung: hai tab dài ngắn khác nhau, vừa-nội-dung thì đổi tab là cả tấm giật
      // lên/xuống ngay dưới ngón tay vừa chạm tab.
      snapToContent={false}
      title="Người tham gia"
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md pb-md">
        {tab === 'invited' ? (
          <InvitedList invited={invited} />
        ) : (
          <>
            {hostLike ? (
              <LobbyPanel
                admitAllPending={admitAllPending}
                entries={lobby}
                pendingUserIds={pendingLobbyUserIds}
                onAdmit={onAdmit}
                onAdmitAll={onAdmitAll}
                onDeny={onDeny}
              />
            ) : null}
            <ParticipantGroups
              groups={groups}
              lowerAllPending={lowerAllPending}
              loweringUserId={loweringUserId}
              meId={meId}
              meRole={meRole}
              onLowerAllHands={hostLike ? onLowerAllHands : undefined}
              onLowerHand={onLowerHand}
              onOpenPersonMenu={onOpenPersonMenu}
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}
