import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetActions, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { ListItem } from '@/shared/ui/list';
import { hapticSelection } from '@/shared/utils/haptics';

import type { MemberListItem } from '../api/conversations.types';

export interface TransferOwnerSheetProps {
  visible: boolean;
  members: MemberListItem[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (toUserId: string) => void;
}

/**
 * be.md §5.5 "OWNER cần chuyển quyền trước khi rời" — chọn thành viên + gõ lại tên xác nhận, cùng khuôn `workspaces/components/TransferOwnerSheet.tsx`.
 *
 * ── Bố cục ────────────────────────────────────────────────────────────────────────────────────────────────────
 *  · Thân CUỘN: danh sách chọn MỘT người — `padded={false}` + `SheetList` (lề 16) + `ListItem` kẻ ngăn, cùng dáng `LeaveTransferList`
 *    của phòng họp. Người đang chọn: `selected` (nền tint + `accessibilityState`) VÀ dấu tích kèm nhãn — không để màu là dấu hiệu duy nhất.
 *  · ĐÁY đứng yên: ô gõ lại tên + [Huỷ | Chuyển quyền]. ⚠️ Bản cũ đặt ô gõ tên SAU danh sách trong thân cuộn: nhóm đông thì chọn người xong
 *    phải cuộn xuống mới thấy ô, bàn phím mở lại che nó. Ở đáy tấm, ô luôn hiện ngay trên hàng nút và được nâng theo bàn phím.
 */
export function TransferOwnerSheet({
  visible,
  members,
  loading,
  onClose,
  onConfirm,
}: TransferOwnerSheetProps) {
  const [selected, setSelected] = useState<MemberListItem | null>(null);
  const [confirmName, setConfirmName] = useState('');

  function handleClose(): void {
    setSelected(null);
    setConfirmName('');
    onClose();
  }

  function choose(member: MemberListItem): void {
    if (selected?.userId === member.userId) return;
    // Rung "đổi lựa chọn" + xoá chữ đã gõ: tên gõ cho người TRƯỚC không bao giờ khớp người mới, để lại chỉ làm nút khoá mà không rõ vì sao.
    hapticSelection();
    setSelected(member);
    setConfirmName('');
  }

  const nameMatches =
    selected !== null &&
    confirmName.trim().length > 0 &&
    confirmName.trim().toLowerCase() === selected.name.toLowerCase();

  return (
    <BottomSheet
      description="Người nhận trở thành chủ nhóm mới, bạn chuyển sang quản trị viên."
      footer={
        <View className="gap-sm">
          {selected ? (
            <Input
              autoCapitalize="words"
              label={`Gõ lại tên "${selected.name}" để xác nhận`}
              placeholder={selected.name}
              value={confirmName}
              onChangeText={setConfirmName}
            />
          ) : null}
          <SheetActions
            hint={
              selected || members.length === 0 ? undefined : 'Chọn người nhận quyền trong danh sách'
            }
            primary={{
              disabled: !nameMatches,
              label: 'Chuyển quyền',
              loading,
              onPress: () => {
                if (selected) onConfirm(selected.userId);
              },
            }}
            secondary={{ disabled: loading, label: 'Huỷ', onPress: handleClose }}
            tone="danger"
          />
        </View>
      }
      padded={false}
      scrollable
      title="Chuyển quyền sở hữu"
      visible={visible}
      onClose={handleClose}
    >
      {members.length === 0 ? (
        <EmptyState
          description="Chỉ có bạn trong nhóm."
          icon="user"
          size="compact"
          title="Chưa có thành viên để chọn"
          tone="info"
        />
      ) : (
        <SheetList accessibilityLabel="Người nhận quyền chủ nhóm" accessibilityRole="radiogroup">
          {members.map((member, index) => {
            const isSelected = selected?.userId === member.userId;
            return (
              <ListItem
                key={member.userId}
                divider={index < members.length - 1}
                label={member.name}
                leading={
                  <Avatar
                    name={member.name}
                    size="sm"
                    source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
                  />
                }
                selected={isSelected}
                trailing={
                  isSelected ? (
                    <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" />
                  ) : undefined
                }
                onPress={() => choose(member)}
              />
            );
          })}
        </SheetList>
      )}
    </BottomSheet>
  );
}
