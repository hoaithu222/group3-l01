import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { assetErrorMessage } from '@/core/uploads/mime';
import { imageSourceMenuItems } from '@/shared/media';
import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { Alert } from '@/shared/ui/alert';
import { Avatar, type AvatarSize } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { ProgressRing } from '@/shared/ui/progress-ring';

import type { ConversationDetail } from '../api/conversations.types';
import { useGroupAvatarUpload } from '../hooks/useGroupAvatarUpload';
import { conversationAvatarUrl, conversationTitle } from '../utils/conversation-title';

export interface GroupAvatarPickerProps {
  conversation: ConversationDetail;
  size?: AvatarSize;
}

/**
 * Avatar NHÓM có thể chạm để đổi — dựng trong `GroupInfo` CHỈ khi `canRename` (cùng hạng quyền `conversation.update`
 * cho cả đổi tên lẫn đổi ảnh, xem be `conversations.routes.ts`/`patch-conversation.dto.ts`). DIRECT không có avatar
 * riêng nên không có component này (`DirectInfo` vẫn dùng thẳng `ConversationAvatar`, không đổi được).
 *
 * Cùng bố cục với avatar cá nhân (`MeAvatarPicker`): huy hiệu bút nhỏ đè góc dưới-phải, ảnh cục bộ (`previewUri`) đè
 * lên avatar cũ NGAY khi vừa chọn, vòng chờ phủ suốt lúc nén ảnh LẪN lúc PATCH (`useGroupAvatarUpload` gộp cả hai
 * vào `busy`). Lỗi bước TẢI ẢNH hiện `Alert` + "Thử lại"; lỗi bước LƯU chỉ cần toast chung của `apiClient`.
 */
export function GroupAvatarPicker({ conversation, size = 'lg' }: GroupAvatarPickerProps) {
  const upload = useGroupAvatarUpload(conversation.id, conversation.version);
  const [menuOpen, setMenuOpen] = useState(false);
  const title = conversationTitle(conversation);
  const remoteUrl = conversationAvatarUrl(conversation);

  const source = upload.previewUri ? { uri: upload.previewUri } : remoteUrl ? { uri: remoteUrl } : undefined;

  return (
    <View className="items-center gap-xs">
      <Pressable
        accessibilityHint="Chạm để đổi ảnh nhóm"
        accessibilityLabel="Ảnh nhóm"
        accessibilityRole="button"
        className="relative"
        disabled={upload.busy}
        onPress={() => setMenuOpen(true)}
      >
        <Avatar name={title} size={size} source={source} />
        {upload.busy ? (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-overlay">
            <ProgressRing indeterminate label="Đang lưu ảnh nhóm" size={32} />
          </View>
        ) : null}
        <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-hairline border-border-1 bg-bg-1">
          <Icon color="fg-brand" name="user-edit" size={14} />
        </View>
      </Pressable>

      {upload.failed ? (
        <Alert
          actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={upload.retry} />}
          description={assetErrorMessage(upload.errorCode)}
          tone="error"
        />
      ) : null}

      <ActionMenuSheet
        items={imageSourceMenuItems({ onPick: (src) => void upload.pick(src) })}
        title="Ảnh nhóm"
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}
