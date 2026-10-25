import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { LoadingMore } from '@/shared/ui/progress';
import { Section } from '@/shared/ui/section';
import { SkeletonParagraph } from '@/shared/ui/skeleton';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { IntegrationEvent } from '../api/integrations.types';
import { useIntegrationEvents, useReplayEvent } from '../queries/integrations.queries';
import {
  EVENT_STATUS_BADGE,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
} from '../utils/integration-labels';

export interface WebhookEventListProps {
  integrationId: string;
  /** Mất mạng → khoá "Phát lại" (cache vẫn hiện). */
  offline: boolean;
}

const canReplay = (e: IntegrationEvent) =>
  e.replayable && (e.status === 'FAILED' || e.status === 'IGNORED');

/**
 * Log sự kiện của một kết nối (app.md §3 "Log sự kiện"): thời gian, loại, tóm tắt, trạng thái BẰNG CHỮ trong `Badge` có tông (đã đăng
 * tin · lỗi · bỏ qua · đang xử lý), lỗi; "Phát lại" cho sự kiện lỗi/bỏ qua còn trong thời gian lưu (quá hạn → BE trả `INT_006`, 429 khi
 * vượt 20 lần/giờ — interceptor toast). Cuộn thêm theo cursor.
 *
 * Tiêu đề nhóm (`Section` + icon `history`) luôn hiện — cả khi đang tải/rỗng/lỗi — để khối không "nhảy" tiêu đề khi dữ liệu về. Rỗng/lỗi
 * dùng `EmptyState` cỡ gọn: khối nằm giữa màn cấu hình dài, bản 160dp đẩy nút "Ngắt kết nối" khỏi tầm nhìn.
 */
export function WebhookEventList({ integrationId, offline }: WebhookEventListProps) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useIntegrationEvents(integrationId);
  const replay = useReplayEvent(integrationId);
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  let body: ReactNode;
  if (isLoading) {
    body = <SkeletonParagraph />;
  } else if (isError) {
    body = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
        icon="alert-warning"
        size="compact"
        title="Không tải được log sự kiện"
        tone="danger"
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        description="Sự kiện từ nhà cung cấp sẽ hiện ở đây."
        icon="history"
        size="compact"
        title="Chưa nhận sự kiện nào"
        tone="neutral"
      />
    );
  } else {
    body = (
      <Card>
        <View className="gap-sm">
          {items.map((e) => (
            <View key={e.id} className="gap-3xs">
              <View className="flex-row items-center gap-xs">
                <Text className="flex-1 text-caption-sm text-fg-2">
                  {formatDateTime(e.receivedAt)} · {EVENT_TYPE_LABELS[e.type] ?? e.type}
                </Text>
                <Badge
                  label={EVENT_STATUS_LABELS[e.status]}
                  size="sm"
                  variant={EVENT_STATUS_BADGE[e.status]}
                />
              </View>
              {e.summary ? <Text className="text-body-md text-fg-1">{e.summary}</Text> : null}
              {e.error ? <Text className="text-caption-sm text-error">{e.error}</Text> : null}
              {canReplay(e) ? (
                <View className="flex-row">
                  <Button
                    disabled={offline || replay.isPending}
                    iconLeft="reload"
                    label="Phát lại"
                    loading={replay.isPending && replay.variables === e.id}
                    size="sm"
                    variant="secondary"
                    onPress={() => replay.mutate(e.id)}
                  />
                </View>
              ) : null}
            </View>
          ))}
          {isFetchingNextPage ? <LoadingMore /> : null}
          {hasNextPage && !isFetchingNextPage ? (
            <Button
              label="Xem thêm"
              size="sm"
              variant="tertiary"
              onPress={() => void fetchNextPage()}
            />
          ) : null}
        </View>
      </Card>
    );
  }

  return (
    <Section icon="history" title="Log sự kiện">
      {body}
    </Section>
  );
}
