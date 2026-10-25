import { memo, useMemo, useState } from 'react';

import {
  Badge,
  Button,
  ConfirmWithReasonModal,
  EmptyState,
  Skeleton,
  Table,
  Text,
} from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { useLocationReviews, useSetReviewHidden } from '../../service/o2o-locations.queries';
import type { AdminLocationReview } from '../../types/o2o.types';
import ListLoadError from '../shared/ListLoadError';

export interface LocationReviewsPanelProps {
  locationId: string;
  /** `o2o:update` — thiếu thì chỉ xem, không ẩn/hiện đánh giá. */
  canUpdate: boolean;
}

/** Đánh giá đang chờ xác nhận ẩn (`hidden: true`) hoặc hiện lại (`hidden: false`). */
interface PendingReview {
  review: AdminLocationReview;
  hidden: boolean;
}

/**
 * Tab "Đánh giá" của ngăn kéo địa điểm (admin.md p6-05 §2.1): MỌI đánh giá kể cả đã ẩn, cursor + "Tải thêm". Ẩn/hiện qua
 * `ConfirmWithReasonModal` (lý do vào nhật ký; BE tính lại điểm trung bình trong cùng giao dịch). Người viết chỉ hiện TÊN
 * (BE không trả email) — vận hành cần liên hệ thì tra ở phân hệ Người dùng.
 */
const LocationReviewsPanel = memo(function LocationReviewsPanel({
  locationId,
  canUpdate,
}: LocationReviewsPanelProps) {
  const q = useLocationReviews(locationId, true);
  const setHidden = useSetReviewHidden();
  const [pending, setPending] = useState<PendingReview | null>(null);
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  const columns = useMemo<TableColumn<AdminLocationReview>[]>(
    () => [
      {
        key: 'author',
        header: 'Người viết',
        width: 150,
        cell: (r) => <span className="block truncate">{r.author.name}</span>,
      },
      {
        key: 'score',
        header: 'Sao · Ồn',
        width: 90,
        cell: (r) => (
          <span className="tabular-nums">
            {r.rating}★ · {r.noise}/5
          </span>
        ),
      },
      {
        key: 'comment',
        header: 'Bình luận',
        width: 260,
        cell: (r) =>
          r.comment ? (
            <span className="line-clamp-3 break-words">{r.comment}</span>
          ) : (
            <span className="text-fg-4">—</span>
          ),
      },
      {
        key: 'createdAt',
        header: 'Lúc',
        width: 130,
        cell: (r) => (
          <span className="tabular-nums text-caption-12">
            {formatDate(r.createdAt, 'HH:mm DD/MM/YYYY')}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Hiển thị',
        width: 170,
        cell: (r) => (
          <div className="flex items-center gap-2">
            <Badge color={r.hiddenAt ? 'neutral' : 'success'} variant="tinted">
              {r.hiddenAt ? 'Đã ẩn' : 'Đang hiện'}
            </Badge>
            {canUpdate ? (
              <Button
                size="xs"
                variant="stroke"
                onClick={() => setPending({ review: r, hidden: !r.hiddenAt })}
              >
                {r.hiddenAt ? 'Hiện lại' : 'Ẩn'}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canUpdate],
  );

  if (q.isPending) return <Skeleton className="h-32 w-full" />;
  if (q.isError && !q.data) {
    return (
      <ListLoadError
        error={q.error}
        title="Không tải được đánh giá"
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (rows.length === 0) {
    return <EmptyState description="Chưa có ai đánh giá địa điểm này." title="Chưa có đánh giá" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table columns={columns} data={rows} pagination={false} rowKey={(r) => r.id} />
      {q.hasNextPage ? (
        <Button
          className="self-center"
          disabled={q.isFetchingNextPage}
          size="sm"
          variant="stroke"
          onClick={() => void q.fetchNextPage()}
        >
          Tải thêm
        </Button>
      ) : (
        <Text className="self-center" size="tiny" skin="muted">
          Đã hiện hết {rows.length} đánh giá.
        </Text>
      )}
      <ConfirmWithReasonModal
        confirmTone={pending?.hidden ? 'danger' : 'primary'}
        impact={
          pending?.hidden
            ? 'Đánh giá bị ẩn khỏi người dùng và điểm trung bình của địa điểm được tính lại ngay.'
            : 'Đánh giá hiện lại với người dùng và điểm trung bình của địa điểm được tính lại ngay.'
        }
        open={pending !== null}
        title={pending?.hidden ? 'Ẩn đánh giá vi phạm' : 'Hiện lại đánh giá'}
        onConfirm={async (reason) => {
          if (!pending) return;
          await setHidden.mutateAsync({ id: pending.review.id, reason, hidden: pending.hidden });
          setPending(null);
        }}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </div>
  );
});

export default LocationReviewsPanel;
