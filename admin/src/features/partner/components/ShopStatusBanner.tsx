import { memo } from 'react';

import { Callout } from '@/shared/ui';

import { usePartnerShops } from '../service/partner.queries';

/**
 * Báo trên đầu hàng đợi khi tiệm KHÔNG nhận được đơn: chưa duyệt / đang tạm ngưng (kèm lý do) hoặc đang TẮT "Nhận đơn". Quyền của
 * cổng cấp theo tiệm ĐÃ DUYỆT nên tiệm bị tạm ngưng thường bị đẩy ra `/403` sau ≤ 60 giây; banner phủ khoảng chờ đó và trường hợp
 * chỉ tắt nhận đơn (khách khi đó không đặt được đơn mới — dễ tưởng "không ai đặt"). Tiệm ổn (đã duyệt + đang nhận) → không hiện gì.
 */
const ShopStatusBanner = memo(function ShopStatusBanner() {
  const { data: shops } = usePartnerShops();
  const issues = (shops ?? []).filter((s) => s.status !== 'APPROVED' || !s.acceptingOrders);
  if (issues.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {issues.map((s) => {
        if (s.status === 'SUSPENDED') {
          return (
            <Callout
              key={s.id}
              description={s.suspendedReason ?? 'Liên hệ vận hành để biết thêm.'}
              intent="error"
              title={`Tiệm ${s.displayName} đang tạm ngưng`}
            />
          );
        }
        if (s.status === 'PENDING') {
          return (
            <Callout
              key={s.id}
              description="Vận hành đang xem xét — bạn sẽ nhận đơn ngay sau khi tiệm được duyệt."
              intent="warning"
              title={`Tiệm ${s.displayName} đang chờ duyệt`}
            />
          );
        }
        return (
          <Callout
            key={s.id}
            description='Khách không đặt được đơn mới ở tiệm này. Bật lại ở tab "Tài khoản".'
            intent="warning"
            title={`Tiệm ${s.displayName} đang tắt nhận đơn`}
          />
        );
      })}
    </div>
  );
});

export default ShopStatusBanner;
