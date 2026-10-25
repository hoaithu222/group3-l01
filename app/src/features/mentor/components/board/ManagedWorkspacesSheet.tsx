import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type { ManagedWorkspace } from '../../api/mentor.types';
import { workspaceMentorHref } from '../../utils/mentor-routes';

export interface ManagedWorkspacesSheetProps {
  visible: boolean;
  workspaces: ManagedWorkspace[];
  onClose: () => void;
}

/**
 * Chọn nhóm mình là OWNER/ADMIN để quản lý bài tìm cố vấn — lối vào từ bảng tin (không cần sửa màn nhóm của
 * `features/workspaces`; mục "Tìm cố vấn" trong hub nhóm là việc đồng bộ chéo, ghi ở README p6-03).
 */
export function ManagedWorkspacesSheet({
  onClose,
  visible,
  workspaces,
}: ManagedWorkspacesSheetProps) {
  return (
    <BottomSheet padded={false} title="Quản lý bài của nhóm" visible={visible} onClose={onClose}>
      {/* Hàng điều hướng: chữ viết tắt tên nhóm (DTO này không có ảnh) + tên đậm + mũi tên — rõ là "mở ra", không phải chọn một giá trị.
          Tấm DANH SÁCH HÀNG ⇒ `padded={false}` + `SheetList` (lề 16, hàng dính nhau ngăn bằng kẻ); `pb-md` vì tấm không có `footer`. */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {workspaces.map((ws, index) => (
          <ListItem
            key={ws.id}
            divider={index < workspaces.length - 1}
            emphasis="title"
            label={ws.name}
            leading={
              // Avatar tự đọc tên ⇒ ẩn khỏi trình đọc màn hình (tên đã nằm ở nhãn của hàng — đọc hai lần là thừa).
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Avatar name={ws.name} size="md" />
              </View>
            }
            trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
            onPress={() => {
              onClose();
              router.push(workspaceMentorHref(ws.id));
            }}
          />
        ))}
      </SheetList>
    </BottomSheet>
  );
}
