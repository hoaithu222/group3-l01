import { ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { Skeleton } from '@/shared/ui/skeleton';
import { includesSearch } from '@/shared/utils/format/string.utils';

import type { MentionableRole, MentionableUser, MentionablesResult } from '../api/chat.types';
import { ALL_LABEL } from './mention-markup';

export interface MentionPickerSheetProps {
  loading: boolean;
  result: MentionablesResult | undefined;
  onPickUser: (user: MentionableUser) => void;
  onPickAll: () => void;
  /** `@role` (p3-04) — chọn một vai trò. Vắng ⇒ không bao giờ hiện nhóm "Vai trò". */
  onPickRole?: (role: MentionableRole) => void;
  /** Chữ đang gõ sau `@` — lọc nhóm "Vai trò" (BE chỉ lọc `users` theo `q`, `roles` luôn trả đủ). */
  query?: string;
}

/**
 * Danh sách gợi ý nhắc tên — NỔI NGAY TRÊN ô nhập, KHÔNG phải `BottomSheet`/`Modal`:
 * một `Modal` cướp focus và đóng bàn phím, người đang gõ `@Mi` sẽ mất chỗ gõ (app.md
 * p1-06 §7 "không che composer, cuộn được với bàn phím mở"). `keyboardShouldPersistTaps
 * ="always"` bắt buộc — mặc định cú chạm đầu tiên chỉ đóng bàn phím và KHÔNG tới được hàng.
 *
 * Danh sách chỉ có tên/ảnh — BE không trả email (be.md p1-06 §5.5), nên không có gì để lộ.
 * Lỗi mạng: `useComposerText` không dựng component này (picker ẩn, gõ thường).
 *
 * Nhóm "Vai trò" (`@role`, p3-04) đứng ĐẦU danh sách, CHỈ khi BE báo `canMentionRole` (OWNER/ADMIN, ở kênh) — mỗi dòng nói rõ
 * "Sẽ thông báo cho khoảng N người" vì một cú chạm nhầm báo cho cả một nhóm người, khác hẳn nhắc một tên.
 */
export function MentionPickerSheet({
  loading,
  result,
  onPickUser,
  onPickAll,
  onPickRole,
  query = '',
}: MentionPickerSheetProps) {
  const users = result?.users ?? [];
  const showAll = result?.canMentionAll === true;
  const roles =
    onPickRole && result?.canMentionRole === true
      ? (result.roles ?? []).filter((role) => includesSearch(role.label, query.trim()))
      : [];

  return (
    <View className="max-h-52 border-t border-divider-1 bg-bg-1">
      {/* `px-md` ở vùng nội dung: `ListItem` KHÔNG có đệm ngang (nó vốn nằm trong `Card`/tấm đã có đệm) — thiếu lề này ảnh đại diện dính sát
          mép màn hình, lệch 16dp so với ô nhập và các thanh trả lời/sửa phía trên. Các dòng chữ trần bên dưới vì vậy KHÔNG tự thêm `px-md` nữa. */}
      <ScrollView
        contentContainerClassName="px-md"
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {showAll ? (
          <ListItem
            divider
            label={`@${ALL_LABEL}${result?.allCount !== undefined ? ` (${result.allCount} người)` : ''}`}
            leading={<Icon name="contact-list" />}
            onPress={onPickAll}
          />
        ) : null}

        {roles.length > 0 ? (
          <Text accessibilityRole="header" className="pt-xs text-caption-sm text-fg-2">
            Vai trò
          </Text>
        ) : null}
        {roles.map((role) => (
          <ListItem
            key={role.roleRef}
            description={
              role.recipientCount > 0
                ? `Sẽ thông báo cho khoảng ${role.recipientCount} người`
                : 'Chưa có ai khác để thông báo'
            }
            divider
            label={`@${role.label}`}
            leading={<Icon name="contact-list" />}
            onPress={() => onPickRole?.(role)}
          />
        ))}

        {users.map((user) => (
          <ListItem
            key={user.userId}
            divider
            label={user.name}
            leading={
              <Avatar
                name={user.name}
                size="xs"
                source={user.avatarUrl ? { uri: user.avatarUrl } : undefined}
              />
            }
            onPress={() => onPickUser(user)}
          />
        ))}

        {loading ? (
          <View className="gap-2xs py-2xs">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 rounded-xs" />
            ))}
          </View>
        ) : null}

        {!loading && users.length === 0 && roles.length === 0 && !showAll ? (
          <Text className="py-sm text-caption-lg text-fg-2">
            Không tìm thấy người trong cuộc trò chuyện
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
