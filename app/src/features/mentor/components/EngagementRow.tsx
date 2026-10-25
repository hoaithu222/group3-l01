import { Text, View } from 'react-native';

import { MentorTag } from '@/shared/mentor';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';

import type { MentorEngagement } from '../api/mentor.types';
import { remainingText } from '../utils/mentor-format';

export interface EngagementRowProps {
  engagement: MentorEngagement;
  now: number;
  /** `team` = màn quản lý của nhóm (tên cố vấn, gia hạn); `mentor` = tab "Đang cố vấn" (tên nhóm, mở nhóm chat). */
  perspective: 'mentor' | 'team';
  onEnd: (engagement: MentorEngagement) => void;
  onExtend?: (engagement: MentorEngagement) => void;
  onOpenChat?: (conversationId: string) => void;
  onOpenWorkspace?: (workspaceId: string) => void;
}

/** Một đợt cố vấn (app.md §3 `EngagementRow`): hạn còn lại bằng CHỮ, mở nhóm/nhóm chat, gia hạn (nhóm), kết thúc (có xác nhận ở màn). */
export function EngagementRow({
  engagement,
  now,
  onEnd,
  onExtend,
  onOpenChat,
  onOpenWorkspace,
  perspective,
}: EngagementRowProps) {
  const remaining = remainingText(engagement.endsAt, now);
  const title = perspective === 'team' ? engagement.mentor.name : engagement.workspace.name;
  const conversationId = engagement.conversationId;
  // Góc nhìn cố vấn ⇒ avatar là NHÓM, có ảnh nhóm (`workspace.avatarUrl`) thì vẽ; góc nhìn nhóm ⇒ cố vấn (DTO không có ảnh) ⇒ chữ viết tắt.
  const avatarUrl = perspective === 'mentor' ? engagement.workspace.avatarUrl : null;

  return (
    <View className="gap-sm border-b border-b-divider-1 py-sm">
      <View className="flex-row items-center gap-sm">
        <Avatar name={title} size="md" source={avatarUrl ? { uri: avatarUrl } : undefined} />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {engagement.post.title}
          </Text>
        </View>
        <MentorTag remaining={remaining} />
      </View>
      <View className="flex-row flex-wrap gap-xs">
        {perspective === 'mentor' && onOpenWorkspace ? (
          <Button
            iconLeft="add-team"
            label="Mở nhóm"
            size="sm"
            variant="secondary"
            onPress={() => onOpenWorkspace(engagement.workspace.id)}
          />
        ) : null}
        {conversationId && onOpenChat ? (
          <Button
            iconLeft="chat-bubble"
            label="Mở nhóm chat"
            size="sm"
            variant="secondary"
            onPress={() => onOpenChat(conversationId)}
          />
        ) : null}
        {onExtend ? (
          <Button
            iconLeft="calendar"
            label="Gia hạn"
            size="sm"
            variant="secondary"
            onPress={() => onExtend(engagement)}
          />
        ) : null}
        <Button
          label={perspective === 'mentor' ? 'Kết thúc cố vấn' : 'Kết thúc'}
          size="sm"
          variant="danger-secondary"
          onPress={() => onEnd(engagement)}
        />
      </View>
    </View>
  );
}
