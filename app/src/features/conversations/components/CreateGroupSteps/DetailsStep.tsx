import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { assetErrorMessage } from '@/core/uploads/mime';
import { useDisplayImageUpload } from '@/core/uploads/use-display-image-upload';
import { imageSourceMenuItems } from '@/shared/media';
import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { ProgressRing } from '@/shared/ui/progress-ring';

import { LIMITS } from '../../conversations.constants';

export interface DetailsStepProps {
  title: string;
  onTitleChange: (title: string) => void;
  onAvatarAssetId: (assetId: string | undefined) => void;
}

/**
 * Bước 3 (app.md §3) — tên bắt buộc (đếm 80) + ảnh tuỳ chọn (chụp/thư viện, `useDisplayImageUpload` khoá
 * `group-avatar:new` — cùng hộp thoại chọn nguồn ảnh với avatar cá nhân/nhóm đã tồn tại, `imageSourceMenuItems`).
 * Nhóm CHƯA có id lúc này nên chỉ giữ `assetId` trong state của màn cha (`CreateGroupScreen`), gửi kèm lúc tạo nhóm
 * — khác `GroupAvatarPicker` (nhóm đã tồn tại) là PATCH luôn khi ảnh tải xong.
 */
export function DetailsStep({ title, onTitleChange, onAvatarAssetId }: DetailsStepProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const avatar = useDisplayImageUpload({ onReady: onAvatarAssetId, slot: 'group-avatar:new' });

  return (
    <View className="items-center gap-lg px-md">
      <View className="items-center gap-xs">
        <Pressable
          accessibilityHint="Chạm để chọn ảnh nhóm"
          accessibilityLabel="Ảnh nhóm"
          accessibilityRole="button"
          className="relative active:opacity-80"
          disabled={avatar.busy}
          onPress={() => setMenuOpen(true)}
        >
          {/* 64dp (cùng cỡ ảnh nhóm ở màn Thông tin) + huy hiệu máy ảnh góc dưới-phải: đọc ra ngay là "chạm để thêm ảnh", cùng dáng
            `GroupAvatarPicker` của nhóm đã tồn tại. */}
          <Avatar
            fallbackIcon="add-image"
            name={title || undefined}
            size="xl"
            source={avatar.previewUri ? { uri: avatar.previewUri } : undefined}
          />
          {avatar.busy ? (
            <View className="absolute inset-0 items-center justify-center rounded-full bg-overlay">
              <ProgressRing indeterminate label="Đang tải ảnh nhóm" size={32} />
            </View>
          ) : null}
          <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-hairline border-border-1 bg-bg-1">
            <Icon color="fg-brand" name="add-image" size={14} />
          </View>
        </Pressable>
        <Text className="text-caption-sm text-fg-2">Ảnh nhóm (không bắt buộc)</Text>
      </View>

      <View className="w-full">
        <Input
          label="Tên nhóm"
          maxLength={LIMITS.conversation.titleMax}
          message={`${String(title.length)}/${String(LIMITS.conversation.titleMax)}`}
          messageTone="hint"
          placeholder="Đặt tên cho nhóm"
          required
          value={title}
          onChangeText={onTitleChange}
        />
      </View>

      {avatar.failed ? (
        <Alert
          actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={avatar.retry} />}
          description={assetErrorMessage(avatar.errorCode)}
          tone="error"
        />
      ) : null}

      <ActionMenuSheet
        items={imageSourceMenuItems({ onPick: (src) => void avatar.pick(src) })}
        title="Ảnh nhóm"
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </View>
  );
}
