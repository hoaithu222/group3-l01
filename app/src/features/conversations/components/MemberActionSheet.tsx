import { View } from 'react-native';

import { useIsUserBlocked } from '@/shared/hooks/useBlockedIds';
import { useModerationActions } from '@/shared/hooks/useModerationActions';
import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon, type IconName } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type {
  ConversationMyPermissions,
  ConversationRole,
  MemberListItem,
} from '../api/conversations.types';
import { RoleBadge } from './RoleBadge';

const RANK: Record<ConversationRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

/** Một hàng của tấm. `hidden` = không đủ quyền/không áp dụng — khai ĐỦ danh sách rồi lọc, để kẻ ngăn tính theo hàng THẬT sự hiện. */
interface MemberAction {
  hidden?: boolean;
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  tone?: 'danger' | 'default';
}

export interface MemberActionSheetProps {
  visible: boolean;
  member: MemberListItem | null;
  myRole: ConversationRole;
  myUserId: string | undefined;
  myPermissions: ConversationMyPermissions;
  onClose: () => void;
  onMessage: (userId: string) => void;
  onToggleAdmin: (member: MemberListItem) => void;
  onRemove: (member: MemberListItem) => void;
  onTransfer: (member: MemberListItem) => void;
}

/**
 * app.md §3 — Nhắn tin riêng · Nâng/Hạ quản trị · Xoá khỏi nhóm · Chuyển quyền, chỉ hiện theo `myPermissions` + bậc vai trò (be.md §5.4).
 * Thứ tự: việc thường trước, việc PHÁ HUỶ (Chặn, Xoá khỏi nhóm) ở cuối — bấm nhầm là mất dữ liệu.
 *
 * Hàng — CÙNG dáng hàng `ActionMenuSheet` của bộ chung (`ListItem` ≥ 44dp, icon `fg-2`, nhãn chữ chính, kẻ ngăn) để mọi menu hành
 * động trong app trông như nhau; `danger`: chữ + icon đỏ. Không dùng thẳng `ActionMenuSheet` vì tấm này có khối ảnh + vai trò ở đầu.
 * ⚠️ Tên người CHỈ ở tiêu đề tấm — bản cũ lặp lại nó ngay dưới (cạnh ảnh), hai dòng cùng một chữ đẩy danh sách hành động xuống.
 */
export function MemberActionSheet({
  visible,
  member,
  myRole,
  myUserId,
  myPermissions,
  onClose,
  onMessage,
  onToggleAdmin,
  onRemove,
  onTransfer,
}: MemberActionSheetProps) {
  const isMe = member?.userId === myUserId;
  // p1-08: báo cáo/chặn CÁ NHÂN một thành viên — chỉ "yêu cầu" mở tấm qua store chung (`conversations` không import `moderation`).
  const { blockUser, reportUser, unblockUser } = useModerationActions();
  const blocked = useIsUserBlocked(member?.userId);
  const outranked = member ? RANK[member.role] < RANK[myRole] : false;
  const canChangeRole =
    Boolean(member) &&
    !isMe &&
    myRole === 'OWNER' &&
    member?.role !== 'OWNER' &&
    myPermissions.canChangeRoles;
  const canRemove = Boolean(member) && !isMe && outranked && myPermissions.canRemoveMembers;
  const canTransfer = Boolean(member) && !isMe && myRole === 'OWNER' && myPermissions.canTransfer;

  const all: MemberAction[] = member
    ? [
        {
          hidden: isMe,
          icon: 'direct',
          key: 'message',
          label: 'Nhắn tin riêng',
          onPress: () => onMessage(member.userId),
        },
        {
          hidden: !canChangeRole,
          icon: 'shield-user',
          key: 'role',
          label: member.role === 'ADMIN' ? 'Hạ xuống thành viên' : 'Nâng làm quản trị viên',
          onPress: () => onToggleAdmin(member),
        },
        {
          hidden: !canTransfer,
          icon: 'arrow-data-transfer-vertical',
          key: 'transfer',
          label: 'Chuyển quyền chủ nhóm',
          onPress: () => onTransfer(member),
        },
        {
          hidden: isMe,
          icon: 'alert-warning',
          key: 'report',
          label: 'Báo cáo',
          onPress: () => {
            onClose();
            reportUser(member.userId, member.name);
          },
        },
        {
          hidden: isMe,
          icon: 'cancel-2',
          key: 'block',
          label: blocked ? 'Bỏ chặn' : 'Chặn',
          tone: blocked ? 'default' : 'danger',
          onPress: () => {
            onClose();
            if (blocked) unblockUser(member.userId, member.name);
            else blockUser(member.userId, member.name);
          },
        },
        {
          hidden: !canRemove,
          icon: 'delete',
          key: 'remove',
          label: 'Xoá khỏi nhóm',
          tone: 'danger',
          onPress: () => onRemove(member),
        },
      ]
    : [];
  const actions = all.filter((action) => !action.hidden);

  return (
    /* `padded={false}` + `SheetList` (= `px-md`): `ListItem` không tự có lề ngang — thiếu lề này icon dính sát mép tấm. */
    <BottomSheet padded={false} title={member?.name} visible={visible} onClose={onClose}>
      {member ? (
        <SheetList className="gap-sm pb-md">
          <View className="flex-row items-center gap-sm">
            <Avatar
              name={member.name}
              size="lg"
              source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
            />
            <RoleBadge role={member.role} />
          </View>

          {/* Kẻ ngăn tính từ hàng ĐANG HIỆN (bỏ ở hàng cuối) — thay mẹo cũ `overflow-hidden` + `-mb-px` cắt vạch thừa. */}
          <View accessibilityRole="menu">
            {actions.map((action, index) => {
              const danger = action.tone === 'danger';
              return (
                <ListItem
                  key={action.key}
                  divider={index < actions.length - 1}
                  emphasis={danger ? 'danger' : 'title'}
                  label={action.label}
                  leading={<Icon color={danger ? 'error' : 'fg-2'} name={action.icon} />}
                  onPress={action.onPress}
                />
              );
            })}
          </View>
        </SheetList>
      ) : null}
    </BottomSheet>
  );
}
