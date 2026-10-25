import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { Button, LinkButton } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime, formatRelative } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';

import type { AttachmentDto, TaskCommentView } from '../../api/task-detail.types';
import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { canEditComment } from '../../utils/comment-feed';
import { MarkdownView } from '../MarkdownView';

export interface CommentItemProps {
  comment: TaskCommentView;
  currentUserId: string;
  /** OWNER/ADMIN xoá được bình luận của người khác (kèm lý do, có audit). */
  isAdmin: boolean;
  mentionLabel: (userId: string) => string;
  onDelete: (comment: TaskCommentView) => void;
  onDiscard: (comment: TaskCommentView) => void;
  onEdit: (comment: TaskCommentView) => void;
  onOpenAttachment: (attachment: AttachmentDto) => void;
  onRetry: (comment: TaskCommentView) => void;
}

/**
 * Một bình luận (app.md §2 `CommentItem`): avatar, tên, giờ, nội dung Markdown + chip nhắc tên, tệp đính
 * kèm, "đã sửa", menu Sửa (≤ 15 phút, chỉ của mình) / Xoá (của mình, hoặc ADMIN — kèm lý do). Bản CỤC BỘ:
 * "Đang gửi…" mờ đi; "Không gửi được" kèm Thử lại (dùng lại ĐÚNG `clientCommentId`) / Bỏ.
 *
 * ⚠️ Có thể sửa hay không tính lúc MỞ menu (`Date.now()` trong handler) chứ không lúc vẽ — render phải
 * thuần (React Compiler). Máy chủ vẫn là nơi quyết định cuối (`TASK_015` nếu quá giờ).
 */
export function CommentItem({
  comment,
  currentUserId,
  isAdmin,
  mentionLabel,
  onDelete,
  onDiscard,
  onEdit,
  onOpenAttachment,
  onRetry,
}: CommentItemProps) {
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const mine = comment.author.id === currentUserId;
  const canDelete = !comment.localStatus && (mine || isAdmin);
  const canEdit =
    mine &&
    openedAt !== null &&
    canEditComment(comment, openedAt, FALLBACK_TASK_LIMITS.commentEditWindowSeconds);
  const closeMenu = () => setOpenedAt(null);

  return (
    <View
      className={cn('flex-row gap-xs py-xs', comment.localStatus === 'sending' && 'opacity-60')}
    >
      <Avatar
        name={comment.author.name}
        size="sm"
        source={comment.author.avatarUrl ? { uri: comment.author.avatarUrl } : undefined}
      />
      <View className="flex-1 gap-2xs">
        <View className="flex-row items-center justify-between gap-xs">
          <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {comment.author.name}
          </Text>
          <Text
            accessibilityLabel={formatDateTime(comment.createdAt)}
            className="text-caption-sm text-fg-2"
          >
            {comment.localStatus === 'sending' ? 'Đang gửi…' : formatRelative(comment.createdAt)}
          </Text>
          {canDelete ? (
            <Button
              accessibilityLabel="Tuỳ chọn bình luận"
              iconLeft="more"
              iconOnly
              size="xs"
              variant="tertiary"
              onPress={() => setOpenedAt(Date.now())}
            />
          ) : null}
        </View>

        {comment.deletedAt ? (
          <Text className="text-body-md italic text-fg-2">Bình luận đã bị xoá.</Text>
        ) : (
          <MarkdownView mentionLabel={mentionLabel} source={comment.content} />
        )}
        {comment.editedAt ? <Text className="text-caption-sm text-fg-2">đã sửa</Text> : null}

        {comment.attachments.map((attachment) => (
          <Pressable
            key={attachment.assetId}
            accessibilityLabel={`Tệp ${attachment.originalName}, chạm để mở`}
            accessibilityRole="button"
            className="min-h-[44px] flex-row items-center gap-xs rounded-xs bg-bg-2 px-xs active:opacity-70"
            onPress={() => onOpenAttachment(attachment)}
          >
            <Icon
              color="fg-2"
              name={attachment.kind === 'IMAGE' ? 'image' : 'document'}
              size={20}
            />
            <Text className="flex-1 text-label-md text-fg-1" numberOfLines={1}>
              {attachment.originalName}
            </Text>
          </Pressable>
        ))}
        {comment.attachmentCount > comment.attachments.length &&
        comment.localStatus === undefined ? (
          <Text className="text-caption-sm text-fg-2">{`${comment.attachmentCount} tệp đính kèm`}</Text>
        ) : null}

        {comment.localStatus === 'failed' ? (
          <View className="flex-row items-center gap-xs">
            <Icon color="error" name="alert-warning" size={16} />
            <Text className="flex-1 text-caption-lg text-error">Không gửi được</Text>
            <LinkButton label="Thử lại" tone="danger" onPress={() => onRetry(comment)} />
            <LinkButton label="Bỏ" onPress={() => onDiscard(comment)} />
          </View>
        ) : null}
      </View>

      <ActionMenuSheet
        items={[
          {
            description: canEdit ? undefined : 'Chỉ sửa được trong 15 phút đầu.',
            disabled: !canEdit,
            hidden: !mine,
            icon: 'edit',
            key: 'edit',
            label: 'Sửa bình luận',
            onPress: () => onEdit(comment),
          },
          {
            hidden: !canDelete,
            icon: 'delete',
            key: 'delete',
            label: 'Xoá bình luận',
            onPress: () => onDelete(comment),
            tone: 'danger',
          },
        ]}
        title="Bình luận"
        visible={openedAt !== null}
        onClose={closeMenu}
      />
    </View>
  );
}
