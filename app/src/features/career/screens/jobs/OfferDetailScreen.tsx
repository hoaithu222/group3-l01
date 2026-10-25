import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { ActionMenu } from '@/shared/ui/action-menu';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { DeclineSheet } from '../../components/jobs/DeclineSheet';
import { InterestedSheet } from '../../components/jobs/InterestedSheet';
import { OfferActionBar } from '../../components/jobs/OfferActionBar';
import { OfferDetailBody } from '../../components/jobs/OfferDetailBody';
import { ReportOfferSheet } from '../../components/jobs/ReportOfferSheet';
import { useOfferDetailActions } from '../../hooks/useOfferDetailActions';
import { useOfferEvents } from '../../hooks/useOfferEvents';
import { useOpenJd } from '../../hooks/useOpenJd';
import { useOffer } from '../../queries/offers.queries';
import { hasOfferActions } from '../../utils/offer-format';
import { isOfferGone, recruiterErrorMessage } from '../../utils/recruiter-errors';
import { offerThreadHref } from '../../utils/recruiter-routes';

/**
 * Chi tiết lời mời (app.md §3): header doanh nghiệp, nội dung, JD; hành động **Quan tâm** (`InterestedSheet`) · **Từ chối khéo** (`DeclineSheet`), menu "⋯" gom
 * "Báo cáo" + "Chặn doanh nghiệp" (AppBar chỉ có 2 khe phải); đã Quan tâm ⇒ nút "Trao đổi". ⚠️ Mở lần đầu là server chuyển `SENT → READ` (tác dụng phụ của GET).
 * Socket `offer:updated` vá tại chỗ: doanh nghiệp thu hồi/hết hạn khi đang xem ⇒ nút Quan tâm biến mất ngay. 404 ⇒ "Lời mời không còn" (không phải lỗi mạng).
 */
export function OfferDetailScreen() {
  const { offerId = '' } = useLocalSearchParams<{ offerId?: string }>();
  useOfferEvents();
  const query = useOffer(offerId);
  const actions = useOfferDetailActions(offerId);
  const jd = useOpenJd(offerId);
  const offline = useConnectionState() === 'offline';
  const offer = query.data;

  const menu = offer ? (
    <ActionMenu
      accessibilityLabel="Thêm tuỳ chọn cho lời mời"
      items={[
        {
          icon: 'alert-warning',
          key: 'report',
          label: 'Báo cáo lời mời',
          onPress: () => actions.open('report'),
        },
        {
          description: 'Không tìm thấy bạn, không gửi được lời mời, cuộc trao đổi đóng',
          icon: 'shield-user',
          key: 'block',
          label: 'Chặn doanh nghiệp',
          onPress: () => actions.open('block'),
          tone: 'danger',
        },
      ]}
      title={offer.company.name}
    />
  ) : undefined;
  const header = <AppBar actions={menu} title="Lời mời" onBack={router.back} />;

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!offer) {
    const gone = isOfferGone(query.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={gone ? undefined : [{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={
            gone
              ? 'Lời mời đã bị xoá hoặc bạn không còn quyền xem.'
              : recruiterErrorMessage(query.error)
          }
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Lời mời không còn' : 'Không tải được lời mời'}
          // 404 = không còn/mất quyền ⇒ quy ước `lock` + `warning` (cùng các màn "không còn" khác của phân hệ).
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        hasOfferActions(offer) ? (
          <OfferActionBar
            offer={offer}
            offline={offline}
            onDecline={() => actions.open('decline')}
            onInterested={() => actions.open('interested')}
            onOpenThread={() => router.push(offerThreadHref(offer.id))}
          />
        ) : undefined
      }
      header={header}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <OfferDetailBody offer={offer} opening={jd.opening} onOpenJd={() => void jd.open()} />
      <InterestedSheet
        errorMessage={actions.interestedError}
        submitting={actions.interesting}
        visible={actions.sheet === 'interested'}
        onClose={actions.close}
        onConfirm={actions.confirmInterested}
      />
      <DeclineSheet
        errorMessage={actions.declineError}
        submitting={actions.declining}
        visible={actions.sheet === 'decline'}
        onClose={actions.close}
        onConfirm={actions.confirmDecline}
      />
      <ReportOfferSheet
        offerId={offer.id}
        visible={actions.sheet === 'report'}
        onClose={actions.close}
      />
      <Dialog
        description="Doanh nghiệp sẽ không tìm thấy bạn và không gửi được lời mời mới; cuộc trao đổi hiện có sẽ đóng (bạn vẫn đọc lại được). Bạn bỏ chặn được ở Cài đặt Tìm việc."
        primaryAction={{
          label: 'Chặn',
          loading: actions.blocking,
          onPress: () => actions.confirmBlock(offer.company.id),
        }}
        secondaryAction={{ label: 'Huỷ', onPress: actions.close }}
        title={`Chặn ${offer.company.name}?`}
        variant="warning"
        visible={actions.sheet === 'block'}
        onClose={actions.close}
      />
    </Screen>
  );
}
