import { memo } from 'react';

import { ListLoadError } from '@/features/o2o';
import { EmptyState, Skeleton, Surface, Text, Toggle } from '@/shared/ui';

import { usePartnerShops } from '../service/partner.queries';
import ShopAccountCard from './ShopAccountCard';

export interface PartnerAccountTabProps {
  /** Âm báo đơn mới — trạng thái do `PartnerPage` giữ (cùng nguồn với `usePartnerAlerts`) để công tắc có hiệu lực ngay. */
  soundOn: boolean;
  onSoundChange: (next: boolean) => void;
}

/**
 * Tab "Tài khoản" (admin.md p6-05 §2.4): thẻ từng tiệm (trạng thái duyệt, bật/tắt Nhận đơn) + tuỳ chọn ÂM BÁO đơn mới của trình duyệt
 * này (lưu localStorage — mỗi máy tính ở quầy tự nhớ, không lưu lên máy chủ).
 */
const PartnerAccountTab = memo(function PartnerAccountTab({
  soundOn,
  onSoundChange,
}: PartnerAccountTabProps) {
  const { data: shops, error, isPending, isError, refetch } = usePartnerShops();

  return (
    <div className="flex flex-col gap-3">
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError && !shops ? (
        <ListLoadError
          error={error}
          title="Không tải được thông tin tiệm"
          onRetry={() => void refetch()}
        />
      ) : !shops || shops.length === 0 ? (
        <EmptyState
          description="Tài khoản của bạn chưa gắn với tiệm in nào."
          title="Chưa có tiệm in"
        />
      ) : (
        shops.map((s) => <ShopAccountCard key={s.id} shop={s} />)
      )}
      <Surface className="flex flex-col gap-2" padding="lg" rounded>
        <Toggle
          checked={soundOn}
          label="Phát âm báo khi có đơn mới"
          onCheckedChange={onSoundChange}
        />
        <Text size="small" skin="muted">
          Chỉ áp dụng cho trình duyệt này. Trình duyệt có thể chặn âm thanh cho tới khi bạn bấm vào
          trang ít nhất một lần.
        </Text>
      </Surface>
    </div>
  );
});

export default PartnerAccountTab;
