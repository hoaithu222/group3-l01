import { Text, View } from 'react-native';

import { AttachmentProgress } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { formatDateTime } from '@/shared/utils/format/date.utils';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';

import type { RecordingDto, RecordingStatus } from '../../api/meeting-recap.types';
import { isPlayable, retentionNote, spokenDuration } from '../../utils/recording-format.utils';
import { RecordingStatusBadge } from './RecordingStatusBadge';

export interface RecordingListItemProps {
  /** Tiến độ tải về (0..1) khi CHÍNH bản này đang tải; `null` = không tải. */
  downloadProgress: number | null;
  /** Giờ SERVER (ms) do màn giữ trong state — tính "Tự xoá sau N ngày". */
  nowMs: number;
  offline: boolean;
  recording: RecordingDto;
  retrying: boolean;
  onCancelDownload: () => void;
  onMore: () => void;
  onPlay: () => void;
  onRetry: () => void;
}

/**
 * Tông ô "cuộn phim" đầu thẻ — CÙNG họ màu với `RecordingStatusBadge` (sẵn sàng xanh lá · đang ghi cam · đang xử lý xanh · lỗi đỏ). BE
 * không trả ảnh xem trước của video nên ô icon thay chỗ cho thumbnail; trang trí thuần, trạng thái bằng CHỮ nằm ở huy hiệu.
 */
const TILE_TONE: Record<RecordingStatus, IconTileTone> = {
  FAILED: 'danger',
  PROCESSING: 'info',
  READY: 'success',
  RECORDING: 'warning',
  STARTING: 'warning',
  STOPPING: 'info',
};

/**
 * Một bản ghi trong danh sách (app.md §3 `RecordingListItem`): ô icon theo trạng thái, ngày giờ bắt đầu, thời lượng + dung lượng, trạng
 * thái bằng chữ, "Tự xoá sau N ngày". READY → "Xem"; FAILED mà `canRetry` → "Thử lại"; menu (Tải về/Xoá) chỉ khi có quyền. Mất mạng: ẩn
 * hành động, chỉ còn thông tin.
 */
export function RecordingListItem(props: RecordingListItemProps) {
  const { downloadProgress, nowMs, offline, recording } = props;
  const meta = [spokenDuration(recording.durationSec), formatFileSize(recording.fileSizeBytes)].filter(Boolean).join(' · ');
  const retention = recording.status === 'READY' ? retentionNote(recording.retentionExpiresAt, nowMs) : null;
  const hasMenu = recording.myActions.canDownload || recording.myActions.canDelete;

  return (
    <Card className="gap-sm">
      <View className="flex-row items-start gap-sm">
        <IconTile name={isPlayable(recording) ? 'play' : 'video-camera'} size="lg" tone={TILE_TONE[recording.status]} />
        <View className="flex-1 gap-2xs">
          <View className="flex-row items-center justify-between gap-sm">
            <Text className="flex-1 text-label-lg font-semibold text-fg-1">{formatDateTime(recording.startedAt)}</Text>
            <RecordingStatusBadge status={recording.status} />
          </View>
          {meta ? (
            <View className="flex-row items-center gap-2xs">
              <Icon color="fg-2" name="timer" size={14} />
              <Text className="flex-1 text-body-md text-fg-2">{meta}</Text>
            </View>
          ) : null}
          {retention ? (
            <View className="flex-row items-center gap-2xs">
              <Icon color="fg-2" name="history" size={14} />
              <Text className="flex-1 text-caption-lg text-fg-2">{retention}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {recording.error ? <Text className="text-caption-lg text-error">{recording.error}</Text> : null}
      {downloadProgress !== null ? (
        <View className="gap-2xs">
          <AttachmentProgress label={`Đang tải bản ghi ${String(Math.round(downloadProgress * 100))}%`} progress={downloadProgress * 100} />
          <Button label="Huỷ tải" size="xs" variant="neutral-tertiary" onPress={props.onCancelDownload} />
        </View>
      ) : null}
      {offline ? null : (
        <View className="flex-row flex-wrap gap-xs">
          {isPlayable(recording) ? <Button iconLeft="play" label="Xem" size="sm" onPress={props.onPlay} /> : null}
          {recording.myActions.canRetry ? (
            <Button iconLeft="reload" label="Thử lại" loading={props.retrying} size="sm" variant="secondary" onPress={props.onRetry} />
          ) : null}
          {hasMenu ? (
            <Button accessibilityLabel="Tuỳ chọn bản ghi" iconLeft="more" iconOnly size="sm" variant="neutral-secondary" onPress={props.onMore} />
          ) : null}
        </View>
      )}
    </Card>
  );
}
