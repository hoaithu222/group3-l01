import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { OfferComposer } from '../../components/jobs/OfferComposer';
import { OfferThreadList } from '../../components/jobs/OfferThreadList';
import { useOfferEvents } from '../../hooks/useOfferEvents';
import { useOfferThread } from '../../hooks/useOfferThread';
import { useOffer } from '../../queries/offers.queries';
import { isOfferGone, recruiterErrorMessage } from '../../utils/recruiter-errors';

/**
 * Trao đổi trong lời mời (app.md §3): chỉ mở sau khi Quan tâm. Tin trạng thái SENDING/FAILED theo `clientMessageId`; `RECR_008` (bị khoá/chặn/công ty tạm ngưng)
 * hoặc `threadOpen = false` ⇒ ô soạn bị THAY bằng "Cuộc trao đổi đã đóng" (đọc lại tin cũ vẫn được). Socket `offer:updated` khoá thread khi đang gõ ⇒ ô soạn đổi ngay.
 * Bố cục: danh sách chiếm hết, ô soạn dính đáy trong `KeyboardStickyView` (cùng bình luận thẻ của bảng công việc).
 */
export function OfferThreadScreen() {
  const { offerId = '' } = useLocalSearchParams<{ offerId?: string }>();
  useOfferEvents();
  const offer = useOffer(offerId);
  const thread = useOfferThread(offerId);
  const companyName = offer.data?.company.name ?? 'Doanh nghiệp';
  const header = <AppBar title={offer.data?.company.name ?? 'Trao đổi'} onBack={router.back} />;

  if (thread.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          <Skeleton className="h-12 w-3/4 rounded-md" />
          <Skeleton className="h-12 w-1/2 self-end rounded-md" />
          <Skeleton className="h-12 w-2/3 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (thread.isError && thread.rows.length === 0) {
    const gone = isOfferGone(thread.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={gone ? undefined : [{ label: 'Thử lại', onPress: thread.refetch }]}
          description={
            gone
              ? 'Lời mời đã bị xoá hoặc bạn không còn quyền xem.'
              : recruiterErrorMessage(thread.error)
          }
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Lời mời không còn' : 'Không tải được cuộc trao đổi'}
          // 404 = không còn/mất quyền ⇒ `lock` + `warning`, cùng quy ước với chi tiết lời mời.
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  const closed = thread.closed || offer.data?.threadOpen === false;

  return (
    <Screen
      constrained={false}
      contentClassName="flex-1"
      header={header}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1">
        <OfferThreadList
          companyName={companyName}
          hasOlder={thread.hasOlder}
          isFetchingOlder={thread.isFetchingOlder}
          rows={thread.rows}
          onLoadOlder={thread.loadOlder}
          onRetry={thread.retry}
        />
      </View>
      {offer.data ? <OfferComposer closed={closed} onSend={thread.send} /> : null}
    </Screen>
  );
}
