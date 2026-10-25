import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AttachmentTray } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import { Thumbnail } from '@/shared/ui/card';
import { iconForMime } from '@/shared/ui/file-tile';
import { IconTile } from '@/shared/ui/icon-tile';
import { Dialog } from '@/shared/ui/modal';
import { Section } from '@/shared/ui/section';

import type { AttachmentDto } from '../../api/task-detail.types';
import { useOpenAttachment } from '../../hooks/useOpenAttachment';
import { useTaskAttachmentUpload } from '../../hooks/useTaskAttachmentUpload';
import { useDetachFromTask, useTaskAttachments } from '../../queries/task-attachments.queries';
import { formatBytes } from '../../utils/file-size';
import { AttachSourceSheet } from './AttachSourceSheet';

export interface AttachmentsSectionProps {
  attachedCount: number;
  boardId: string;
  canAttach: boolean;
  /** OWNER/ADMIN gỡ được tệp của người khác; người thường chỉ gỡ tệp mình gắn (README §6). */
  currentUserId: string;
  isAdmin: boolean;
  taskId: string;
}

function AttachmentRow({
  attachment,
  busy,
  canRemove,
  onOpen,
  onRemove,
}: {
  attachment: AttachmentDto;
  busy: boolean;
  canRemove: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const size = formatBytes(attachment.size);
  return (
    <View className="min-h-[44px] flex-row items-center gap-xs">
      <Pressable
        accessibilityLabel={`Tệp ${attachment.originalName}${size ? `, ${size}` : ''}, chạm để mở`}
        accessibilityRole="button"
        accessibilityState={{ busy }}
        className="min-h-[44px] flex-1 flex-row items-center gap-sm active:opacity-70"
        onPress={onOpen}
      >
        {attachment.thumbnailUrl ? (
          <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-2xs bg-bg-2">
            <Thumbnail aspect={1} source={{ uri: attachment.thumbnailUrl }} />
          </View>
        ) : (
          // Không có ảnh thu nhỏ: ô icon có TÔNG theo loại tệp (`iconForMime` của bộ chung — pdf/văn bản/video/âm thanh),
          // thay cho icon xám trên nền xám; cùng cỡ 48 với ô ảnh để các dòng thẳng cột.
          <IconTile
            name={attachment.kind === 'IMAGE' ? 'image' : iconForMime(attachment.mime)}
            size="lg"
            tone={attachment.kind === 'IMAGE' ? 'success' : 'info'}
          />
        )}
        <View className="flex-1">
          <Text className="text-body-md text-fg-1" numberOfLines={2}>
            {attachment.originalName}
          </Text>
          {size ? (
            <Text className="text-caption-sm text-fg-2">{busy ? 'Đang mở…' : size}</Text>
          ) : null}
        </View>
      </Pressable>
      {canRemove ? (
        <Button
          accessibilityLabel={`Gỡ tệp ${attachment.originalName}`}
          iconLeft="delete"
          iconOnly
          size="xs"
          variant="tertiary"
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}

/**
 * Tệp đính kèm của thẻ (app.md §2 `AttachmentsSection`): danh sách tệp đã gắn (thumbnail ký cho ảnh),
 * khay tiến độ của các tệp đang tải (`AttachmentTray` của bộ chung), và nút thêm (thư viện/chụp/tệp).
 * Tối đa 10 tệp/thẻ. Tệp tải xong được `useTaskAttachmentFinalizer` gắn vào thẻ rồi tự biến khỏi khay.
 */
export function AttachmentsSection({
  attachedCount,
  boardId,
  canAttach,
  currentUserId,
  isAdmin,
  taskId,
}: AttachmentsSectionProps) {
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<AttachmentDto | null>(null);
  const list = useTaskAttachments(taskId);
  const upload = useTaskAttachmentUpload(taskId, attachedCount);
  const detach = useDetachFromTask(boardId, taskId);
  const opener = useOpenAttachment();
  const attachments = list.data ?? [];

  return (
    // Cùng khuôn tiêu đề `Section tone="default"` + icon với các khối khác của chi tiết thẻ (xem `ChecklistSection`).
    <Section
      action={
        canAttach ? (
          <Button
            disabled={upload.remaining === 0}
            iconLeft="add"
            label="Thêm"
            size="sm"
            variant="secondary"
            onPress={() => setPicking(true)}
          />
        ) : undefined
      }
      icon="file-2"
      title={attachedCount > 0 ? `Đính kèm (${attachedCount})` : 'Đính kèm'}
      tone="default"
    >

      <AttachmentTray
        items={upload.items}
        onCancel={upload.cancel}
        onRemove={upload.remove}
        onRetry={upload.retry}
      />

      {attachments.map((attachment) => (
        <AttachmentRow
          key={attachment.assetId}
          attachment={attachment}
          busy={opener.busyAssetId === attachment.assetId}
          canRemove={canAttach && (isAdmin || attachment.attachedBy === currentUserId)}
          onOpen={() => void opener.open(attachment)}
          onRemove={() => setRemoving(attachment)}
        />
      ))}
      {attachedCount === 0 && upload.items.length === 0 ? (
        <Text className="text-body-md text-fg-2">Chưa có tệp đính kèm.</Text>
      ) : null}

      <AttachSourceSheet
        remaining={upload.remaining}
        visible={picking}
        onClose={() => setPicking(false)}
        onPicked={upload.addFiles}
      />
      {/* Gỡ tệp là thao tác phá huỷ chỉ với MỘT chạm vào icon nhỏ cạnh dòng — hỏi lại trước khi gỡ (tệp gỡ xong phải tải lên lại). */}
      <Dialog
        description={removing ? `Tệp "${removing.originalName}" sẽ không còn đính kèm vào thẻ này.` : ''}
        primaryAction={{
          label: 'Gỡ tệp',
          onPress: () => {
            if (removing) detach.mutate(removing.assetId);
            setRemoving(null);
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setRemoving(null) }}
        title="Gỡ tệp khỏi thẻ?"
        variant="warning"
        visible={removing !== null}
        onClose={() => setRemoving(null)}
      />
    </Section>
  );
}
