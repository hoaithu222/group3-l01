import { memo } from 'react';
import { Link } from 'react-router-dom';

import { BoxPanel, Badge, Button, Callout, Skeleton, Text } from '@/shared/ui';

import { usePushProviderStatus } from '../service/notifications-config.queries';
import type { PushProviderStatus } from '../types/notifications-config.types';

interface ProviderRowProps {
  name: string;
  hint: string;
  configured: boolean;
  /** Nhãn khi đã cấu hình. */
  onLabel: string;
  /** Nhãn khi chưa cấu hình. */
  offLabel: string;
  /** Chưa cấu hình mà vẫn chấp nhận được (VoIP chưa cần) → xám thay vì cảnh báo. */
  offColor: 'warning' | 'neutral';
}

const ProviderRow = memo(function ProviderRow({
  name,
  hint,
  configured,
  onLabel,
  offLabel,
  offColor,
}: ProviderRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-col">
        <Text size="small" weight="medium">
          {name}
        </Text>
        <Text size="tiny" skin="muted">
          {hint}
        </Text>
      </div>
      <Badge color={configured ? 'success' : offColor} dot size="sm" variant="tinted">
        {configured ? onLabel : offLabel}
      </Badge>
    </div>
  );
});

/** "Đã cấu hình (sandbox)" — môi trường chỉ là mặc định theo env, xem `PushProviderStatus.voip`. */
function voipOnLabel(status: PushProviderStatus): string {
  if (status.voip.environment === 'SANDBOX') return 'Đã cấu hình (sandbox)';
  if (status.voip.environment === 'PRODUCTION') return 'Đã cấu hình (production)';
  return 'Đã cấu hình';
}

/**
 * Trạng thái nhà cung cấp push (admin.md p0-06 §2.1) — CHỈ đọc. Dữ liệu từ
 * `GET /admin/push/status` gồm cờ/enum; card không hiện khoá, project id hay
 * bất kỳ định danh nào của nhà cung cấp (BE cũng không trả).
 */
const PushProviderCard = memo(function PushProviderCard() {
  const { data, isLoading, isError, refetch } = usePushProviderStatus();

  return (
    <BoxPanel border="hairline" className="h-auto" title="Nhà cung cấp thông báo đẩy">
      <div className="flex flex-col gap-2 p-2">
        {isLoading && <Skeleton className="h-12 w-full" />}

        {isError && (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
            intent="error"
            title="Không tải được trạng thái nhà cung cấp"
          />
        )}

        {data && (
          <>
            <ProviderRow
              configured={data.fcm.configured}
              hint="Gửi thông báo tới Android và iOS"
              name="Firebase Cloud Messaging (FCM)"
              offColor="warning"
              offLabel="Chưa cấu hình (push tắt)"
              onLabel="Đã cấu hình"
            />
            <ProviderRow
              configured={data.voip.configured}
              hint="Đổ chuông cuộc gọi đến trên iPhone"
              name="APNs VoIP"
              offColor="neutral"
              offLabel="Chưa cấu hình"
              onLabel={voipOnLabel(data)}
            />
            {!data.pushEnabled && (
              <Callout
                description={
                  <span>
                    Cờ “Thông báo đẩy” đang tắt trên máy chủ nên push thử sẽ báo chưa cấu hình. Hộp
                    thư và cập nhật thời gian thực vẫn hoạt động.{' '}
                    <Link className="text-link hover:underline" to="/system-config?tab=features">
                      Bật ở tab Tính năng
                    </Link>
                  </span>
                }
                intent="warning"
                title="Tính năng thông báo đẩy đang tắt"
              />
            )}
          </>
        )}
      </div>
    </BoxPanel>
  );
});

export default PushProviderCard;
