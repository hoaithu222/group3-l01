import { memo } from 'react';

import { Button, Callout, Skeleton, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import MediaHealthCard from './components/MediaHealthCard';
import MediaRelatedFlags from './components/MediaRelatedFlags';
import MediaUsageKpi from './components/MediaUsageKpi';
import { isMediaNotConfigured, useMediaStatus } from './service/media-status.queries';
import { deriveMediaHealth } from './utils/media-health';

/**
 * Tab "Media" của `system-config` (admin.md p0-08 §2) — sức khoẻ máy chủ LiveKit, số phòng/người,
 * egress và cờ liên quan. CHỈ ĐỌC (đóng phòng/kick là nghiệp vụ p2-07, có lý do + audit).
 * Tự làm mới 30 giây khi tab trình duyệt hiện.
 *
 * `503 MEDIA_001` (thiếu `LIVEKIT_*`) là một TRẠNG THÁI hợp lệ → khối hướng dẫn, không phải lỗi;
 * lỗi mạng/5xx khác → `Callout` + "Thử lại".
 */
const MediaTab = memo(function MediaTab() {
  const { data, error, isLoading, isError, isFetching, refetch } = useMediaStatus();
  const notConfigured = isError && isMediaNotConfigured(error);
  const failed = isError && !notConfigured;

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chỉ hiện số liệu tổng hợp — không hiển thị khoá API, secret hay người trong phòng."
        icon="lock-bold"
        intent="neutral"
        variant="ghost"
      />

      <Toolbar
        right={
          <Button
            loading={isFetching}
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={16} />}
            variant="ghost"
            onClick={() => void refetch()}
          >
            Làm mới
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : failed ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
          intent="error"
          title="Không tải được trạng thái máy chủ media"
        />
      ) : (
        <>
          <MediaHealthCard health={deriveMediaHealth(data)} status={data} />
          {data && data.configured && <MediaUsageKpi status={data} />}
        </>
      )}

      <MediaRelatedFlags />
    </div>
  );
});

export default MediaTab;
