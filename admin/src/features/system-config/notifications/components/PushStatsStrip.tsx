import { memo } from 'react';

import { Badge, BoxPanel, Button, Callout, CompactKpiCard, Skeleton, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate } from '@/shared/utils/format/format.utils';

import {
  PUSH_SKIP_REASON_LABELS,
  TOKEN_REVOKE_REASON_LABELS,
} from '../constants/notifications.constants';
import { usePushStats } from '../service/notifications-config.queries';
import ReasonChips from './ReasonChips';

/**
 * Số liệu push (admin.md p0-06 §2.3) — CHỈ đọc, từ `GET /admin/push/stats`:
 * push gửi 24 giờ · bị bỏ qua 24 giờ theo lý do · token bị gỡ 7 ngày. BE cache 60
 * giây nên nút "Làm mới" có thể trả lại đúng con số cũ trong khoảng đó.
 */
const PushStatsStrip = memo(function PushStatsStrip() {
  const { data, isLoading, isError, isFetching, refetch } = usePushStats();

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      headerRight={
        <Button
          loading={isFetching && !isLoading}
          size="sm"
          startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
          variant="ghost"
          onClick={() => void refetch()}
        >
          Làm mới
        </Button>
      }
      title="Số liệu thông báo đẩy"
    >
      <div className="flex flex-col gap-2 p-2">
        {isLoading && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
            intent="error"
            title="Không tải được số liệu thông báo đẩy"
          />
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-3">
              <CompactKpiCard
                color="green"
                icon="paper-plane-top-bold"
                label="Push gửi (24 giờ)"
                trailing={
                  data.push24h.failed > 0 ? (
                    <Badge color="error" size="sm" variant="tinted">
                      Lỗi {data.push24h.failed}
                    </Badge>
                  ) : undefined
                }
                value={data.push24h.sent}
              />
              <CompactKpiCard
                color="yellow"
                footer={
                  <ReasonChips
                    counts={data.push24h.skipped.byReason}
                    emptyText="Không có thông báo nào bị bỏ qua"
                    labels={PUSH_SKIP_REASON_LABELS}
                  />
                }
                icon="bell-slash-bold"
                label="Bị bỏ qua (24 giờ)"
                value={data.push24h.skipped.total}
              />
              <CompactKpiCard
                color="gray"
                footer={
                  <ReasonChips
                    counts={data.tokensRevoked7d.byReason}
                    emptyText="Không có token nào bị gỡ"
                    labels={TOKEN_REVOKE_REASON_LABELS}
                  />
                }
                icon="trash-bold"
                label="Token bị gỡ (7 ngày)"
                value={data.tokensRevoked7d.total}
              />
            </div>
            <Text size="tiny" skin="muted">
              Cập nhật lúc {formatDate(data.generatedAt, 'HH:mm DD/MM/YYYY')} · làm mới tối đa 1
              phút một lần
            </Text>
          </>
        )}
      </div>
    </BoxPanel>
  );
});

export default PushStatsStrip;
