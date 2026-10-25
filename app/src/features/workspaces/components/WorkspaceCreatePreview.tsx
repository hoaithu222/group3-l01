import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/utils/style/cn';

import { WORKSPACE_CARD_COVER_RATIO } from '../utils/workspace-cover';
import { WorkspaceAvatar } from './WorkspaceAvatar';
import { WorkspaceCover } from './WorkspaceCover';

export interface WorkspaceCreatePreviewProps {
  name: string | undefined;
  description: string | undefined;
}

/**
 * Xem trước TRỰC TIẾP thẻ nhóm đang tạo (app.md p1-01 §3 "preview thẻ trực tiếp") — cùng khuôn `WorkspaceCard` của danh sách
 * (bìa 3:1 · avatar chữ cái đè mép bìa · tên 2 dòng · mô tả · "Chủ nhóm"), đổi theo từng chữ người dùng gõ.
 *
 * ⚠️ Màu bìa THẬT của nhóm suy từ id do BE cấp (`coverPresetFor`) — lúc này chưa có id, nên ô xem trước dùng tông thương hiệu
 * (`violet`) và dòng chú thích nói rõ màu chọn tự động; ⛔ đừng băm một id tạm: hứa một màu rồi tạo xong ra màu khác là nói dối.
 * Cả khối là MỘT phần tử trợ năng (nhãn "Xem trước thẻ nhóm: …") — các mẩu bên trong chỉ lặp lại ô nhập ngay dưới.
 */
export function WorkspaceCreatePreview({ name, description }: WorkspaceCreatePreviewProps) {
  const shownName = name?.trim() ?? '';
  const shownDescription = description?.trim() ?? '';

  return (
    <View className="gap-xs">
      <View
        accessibilityLabel={`Xem trước thẻ nhóm: ${shownName || 'chưa có tên'}`}
        accessible
        className="overflow-hidden rounded-md bg-bg-1"
      >
        <WorkspaceCover
          aspectRatio={WORKSPACE_CARD_COVER_RATIO}
          className="rounded-none"
          coverPreset="violet"
          coverUrl={null}
          workspaceId="preview"
        />
        <View className="flex-row gap-sm px-md pb-md">
          <WorkspaceAvatar
            avatarUrl={null}
            className="-mt-6"
            fallbackIcon="add-team"
            name={shownName}
            size="lg"
          />
          <View className="flex-1 gap-2xs pt-xs">
            <Text
              className={cn('text-body-lg font-semibold', shownName ? 'text-fg-1' : 'text-fg-2')}
              numberOfLines={2}
            >
              {shownName || 'Tên nhóm của bạn'}
            </Text>
            {shownDescription ? (
              <Text className="text-caption-lg text-fg-2" numberOfLines={2}>
                {shownDescription}
              </Text>
            ) : null}
            <View className="flex-row">
              <Badge label="Chủ nhóm" size="sm" variant="brand" />
            </View>
          </View>
        </View>
      </View>
      <Text className="text-caption-lg text-fg-2">
        Màu bìa được chọn tự động. Ảnh bìa và ảnh đại diện đổi được trong Cài đặt nhóm sau khi tạo.
      </Text>
    </View>
  );
}
