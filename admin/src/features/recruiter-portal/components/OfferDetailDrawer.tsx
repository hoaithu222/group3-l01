import { memo } from 'react';
import type { ReactNode } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { Button, Callout, ConfirmDialog, Divider, Drawer, EmptyState, Skeleton } from '@/shared/ui';

import { useOffer, useWithdrawOffer } from '../service/offer.queries';
import { errorStatusOf } from '../utils/portal-errors';
import OfferDetailPanel from './OfferDetailPanel';
import OfferThread from './OfferThread';

export interface OfferDetailDrawerProps {
  companyId: string | undefined;
  /** `null` = đóng. */
  offerId: string | null;
  /** `recruiter:create` — thu hồi cần doanh nghiệp còn được duyệt (BE `companyScope({ approved })`). */
  canWithdraw: boolean;
  onClose: () => void;
}

/** Lời mời còn "mở" (BE `OPEN_OFFER_STATUSES`) — chỉ khi đó mới thu hồi được. */
const OPEN_STATUSES = ['SENT', 'READ', 'INTERESTED'];

/**
 * Ngăn kéo chi tiết lời mời (admin.md p6-08 §2.6): nội dung + thread + **Thu hồi** (`ConfirmDialog`, khi SENT/READ/INTERESTED, có quyền). `open` suy từ `offerId` (URL `?offerId=`,
 * deep-link `offers/:id` redirect về đây để danh sách vẫn ở phía sau). Ba trạng thái tải KHÔNG gộp: đang tải · 404 ("lời mời không còn", KHÔNG "Thử lại") · lỗi tạm thời (Callout + "Thử lại").
 * Thu hồi KHÔNG hoàn lại lượt gửi — nói rõ trong hộp xác nhận.
 */
const OfferDetailDrawer = memo(function OfferDetailDrawer({
  companyId,
  offerId,
  canWithdraw,
  onClose,
}: OfferDetailDrawerProps) {
  const { data: offer, isLoading, isError, error, refetch } = useOffer(companyId, offerId);
  const withdraw = useWithdrawOffer(companyId);
  const confirm = useDisclosure();

  let body: ReactNode;
  let footer: ReactNode = null;
  if (offer) {
    body = (
      <div className="flex flex-col gap-4">
        <OfferDetailPanel offer={offer} />
        <Divider />
        <OfferThread offer={offer} />
      </div>
    );
    if (canWithdraw && OPEN_STATUSES.includes(offer.status)) {
      footer = (
        <Button size="sm" skin="danger" variant="stroke" onClick={confirm.open}>
          Thu hồi lời mời
        </Button>
      );
    }
  } else if (isError && errorStatusOf(error) === 404) {
    body = (
      <EmptyState
        description="Lời mời không còn tồn tại hoặc không thuộc doanh nghiệp của bạn."
        icon="inbox-bold"
        size="sm"
        title="Không tìm thấy lời mời"
      />
    );
  } else if (isError) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được lời mời"
      />
    );
  } else if (isLoading) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="w-full" height={48} />
        <Skeleton className="w-full" height={160} />
      </div>
    );
  }

  return (
    <>
      <Drawer
        footer={footer}
        open={offerId !== null}
        side="right"
        size="lg"
        title={offer?.title ?? 'Lời mời'}
        onOpenChange={(next) => !next && onClose()}
      >
        {body}
      </Drawer>
      <ConfirmDialog
        actionLabel="Thu hồi lời mời"
        description="Lời mời chuyển sang “Đã thu hồi” và trao đổi bị khoá ngay. Lượt gửi đã dùng KHÔNG được hoàn lại."
        open={confirm.isOpen}
        title="Thu hồi lời mời?"
        variant="delete"
        onConfirm={() => {
          if (offerId) withdraw.mutate(offerId);
        }}
        onOpenChange={(next) => !next && confirm.close()}
      />
    </>
  );
});

export default OfferDetailDrawer;
