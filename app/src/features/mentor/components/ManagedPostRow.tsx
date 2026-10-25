import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { MentorManagedPost } from '../api/mentor.types';
import { POST_STATUS_LABEL } from '../constants/mentor.constants';
import { deadlineText, mentorsNeededText } from '../utils/mentor-format';

export interface ManagedPostRowProps {
  post: MentorManagedPost;
  closing?: boolean;
  onClose: (post: MentorManagedPost) => void;
  onOpen: (post: MentorManagedPost) => void;
}

/** Một bài của nhóm ở màn quản lý (app.md §3): trạng thái + số đơn chờ bằng chữ; chạm → duyệt đơn; "Đóng bài" khi chưa đóng. */
export function ManagedPostRow({ closing, onClose, onOpen, post }: ManagedPostRowProps) {
  const status = post.hidden ? 'Đã bị ẩn' : POST_STATUS_LABEL[post.status];
  return (
    <View className="gap-xs border-b border-b-divider-1 py-sm">
      {/* `active:opacity-70`: phản hồi nhấn của vùng mở danh sách đơn (Pressable tự dựng, không có dáng "đang bấm" riêng). */}
      <Pressable
        accessibilityLabel={`${post.title}. ${status}. ${post.pendingCount} đơn đang chờ`}
        accessibilityRole="button"
        className="min-h-[44px] flex-row items-center gap-sm active:opacity-70"
        onPress={() => onOpen(post)}
      >
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
            {post.title}
          </Text>
          <View className="flex-row items-center gap-3xs">
            <Icon color="fg-2" name="add-team" size={14} />
            <Text className="flex-1 text-caption-sm text-fg-2">
              {mentorsNeededText(post.mentorsNeeded, post.activeEngagements)} ·{' '}
              {deadlineText(post.expiresAt)}
            </Text>
          </View>
        </View>
        <View className="items-end gap-3xs">
          <Badge
            label={status}
            size="sm"
            variant={post.status === 'OPEN' && !post.hidden ? 'success' : 'neutral'}
          />
          {post.pendingCount > 0 ? (
            <Badge label={`${post.pendingCount} đơn chờ`} size="sm" variant="warning" />
          ) : null}
        </View>
      </Pressable>
      {post.status !== 'CLOSED' ? (
        <Button
          iconLeft="lock"
          label="Đóng bài"
          loading={closing}
          size="sm"
          variant="neutral-secondary"
          onPress={() => onClose(post)}
        />
      ) : null}
    </View>
  );
}
