import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon, type IconName } from '@/shared/ui/icon';

import type { RoomRole } from '../../api/meeting-room.types';
import { raisedHandOrder } from '../../utils/hand-queue.utils';
import type { PanelGroups, RoomPerson } from '../../utils/room-people.utils';
import { HandGlyph } from '../hand/HandGlyph';
import { ParticipantRow } from './ParticipantRow';
import { PeopleSection } from './PeopleSection';

export interface ParticipantGroupsProps {
  /** Nhóm đã chia bởi `groupForPanel`: mỗi người nằm ĐÚNG một nhóm. */
  groups: PanelGroups;
  /** "Hạ tay tất cả" đang chạy. */
  lowerAllPending?: boolean;
  /** Người đang được hạ tay (nút "Hạ tay" của hàng đó quay). */
  loweringUserId?: string | null;
  meId: string;
  meRole: RoomRole;
  /** Không truyền ⇒ không có nút "Hạ tay tất cả" (người thường). */
  onLowerAllHands?: () => void;
  /** Hạ tay MỘT người — cha phân biệt chính mình (tự hạ tay) với người khác (thao tác chủ trì). */
  onLowerHand: (person: RoomPerson) => void;
  onOpenPersonMenu: (person: RoomPerson) => void;
}

/**
 * Các nhóm người TRONG PHÒNG của `ParticipantsSheet` (kiểu Meet): "Đang giơ tay (n)" ĐẦU TIÊN — hàng đợi phát biểu, số thứ tự theo giờ giơ
 * (`raisedHandOrder`, cùng số với ô sân khấu), "Hạ tay" từng người + "Hạ tay tất cả" cho chủ trì/đồng chủ trì, và "Hạ tay" cho chính mình —
 * rồi "Chủ trì và đồng chủ trì (n)" → "Thành viên (n)". Nhóm rỗng không vẽ.
 *
 * Quyền nút "Tuỳ chọn": người xem là chủ trì/đồng chủ trì, KHÔNG phải chính mình, người kia không phải chủ trì (`HOST` không bị thao tác — BE
 * MEET_019). "Hạ tay" người khác thì cả chủ trì lẫn đồng chủ trì làm được với mọi người (như "Hạ tay mọi người" của BE).
 */
export function ParticipantGroups({
  groups,
  lowerAllPending = false,
  loweringUserId = null,
  meId,
  meRole,
  onLowerAllHands,
  onLowerHand,
  onOpenPersonMenu,
}: ParticipantGroupsProps) {
  const hostLike = meRole === 'HOST' || meRole === 'CO_HOST';
  const order = raisedHandOrder(groups.raised);
  const rest: { icon: IconName; people: RoomPerson[]; title: string }[] = [
    { icon: 'shield-user', people: groups.hosts, title: 'Chủ trì và đồng chủ trì' },
    { icon: 'contact-list', people: groups.others, title: 'Thành viên' },
  ];

  const row = (person: RoomPerson, raised: boolean) => {
    const isMe = person.userId === meId;
    return (
      <ParticipantRow
        key={person.userId}
        canManage={hostLike && !isMe && person.role !== 'HOST'}
        handOrder={raised ? order.get(person.userId) : undefined}
        isMe={isMe}
        lowering={loweringUserId === person.userId}
        person={person}
        onLowerHand={raised && (isMe || hostLike) ? () => onLowerHand(person) : undefined}
        onOpenMenu={() => onOpenPersonMenu(person)}
      />
    );
  };

  return (
    <View className="gap-md">
      {groups.raised.length > 0 ? (
        <PeopleSection
          // "Hạ tay tất cả" từ HAI người (một người thì nút "Hạ tay" của hàng là đủ) — cùng luật "Cho tất cả vào" của hàng chờ.
          action={
            hostLike && onLowerAllHands && groups.raised.length >= 2 ? (
              <Button
                label="Hạ tay tất cả"
                loading={lowerAllPending}
                size="xs"
                variant="tertiary"
                onPress={onLowerAllHands}
              />
            ) : null
          }
          count={groups.raised.length}
          glyph={<HandGlyph size="sm" />}
          title="Đang giơ tay"
        >
          {groups.raised.map((person) => row(person, true))}
        </PeopleSection>
      ) : null}
      {rest
        .filter((section) => section.people.length > 0)
        .map((section) => (
          <PeopleSection
            key={section.title}
            count={section.people.length}
            glyph={<Icon color="fg-2" name={section.icon} size="sm" variant="twotone" />}
            title={section.title}
          >
            {section.people.map((person) => row(person, false))}
          </PeopleSection>
        ))}
    </View>
  );
}
