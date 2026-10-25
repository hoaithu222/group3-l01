import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import type { MyMentorApplication } from '../api/mentor.types';
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_VARIANT } from '../constants/mentor.constants';

export interface MyApplicationRowProps {
  application: MyMentorApplication;
  onOpenPost: (postId: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}

/**
 * Một đơn của tôi (app.md §3 "Đơn của tôi"): ảnh nhóm (`workspace.avatarUrl`, chữ viết tắt khi thiếu) + tên bài + nhóm, trạng thái bằng
 * CHỮ; được chấp nhận + đợt còn chạy → nút "Mở nhóm". `active:opacity-70`: phản hồi nhấn của vùng mở bài (hàng tự dựng của `FlashList`).
 */
export function MyApplicationRow({
  application,
  onOpenPost,
  onOpenWorkspace,
}: MyApplicationRowProps) {
  const status = APPLICATION_STATUS_LABEL[application.status];
  const canOpen = application.status === 'ACCEPTED' && application.engagement?.status === 'ACTIVE';
  const workspace = application.post.workspace;

  return (
    <View className="gap-xs border-b border-b-divider-1 px-md py-sm">
      <Pressable
        accessibilityLabel={`${application.post.title}. Nhóm ${workspace.name}. ${status}`}
        accessibilityRole="button"
        className="min-h-[44px] flex-row items-center gap-sm active:opacity-70"
        onPress={() => onOpenPost(application.post.id)}
      >
        <Avatar
          name={workspace.name}
          size="md"
          source={workspace.avatarUrl ? { uri: workspace.avatarUrl } : undefined}
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
            {application.post.title}
          </Text>
          <Text className="text-caption-sm text-fg-2">{workspace.name}</Text>
        </View>
        <Badge label={status} size="sm" variant={APPLICATION_STATUS_VARIANT[application.status]} />
      </Pressable>
      {application.rejectReason ? (
        <Text className="text-caption-lg text-fg-2">Lý do: {application.rejectReason}</Text>
      ) : null}
      {canOpen ? (
        <Button
          iconLeft="add-team"
          label="Mở nhóm"
          size="sm"
          variant="secondary"
          onPress={() => onOpenWorkspace(workspace.id)}
        />
      ) : null}
    </View>
  );
}
