import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { Dialog } from '@/shared/ui/modal';
import { Reveal } from '@/shared/ui/motion';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { httpStatusOf, isNetworkError } from '@/shared/utils/errors';
import { hapticSuccess, hapticTap } from '@/shared/utils/haptics';

import { ListingHero } from '../components/ListingHero';
import { ListingPreview } from '../components/ListingPreview';
import { ReportListingSheet } from '../components/ReportListingSheet';
import { useBuyListing } from '../hooks/useBuyListing';
import { useWithdrawListing } from '../hooks/useWithdrawListing';
import { useListingDetail } from '../queries/listings.queries';
import { formatCoins } from '../utils/listing-format';
import { marketplaceErrorCode, marketplaceErrorMessage } from '../utils/marketplace-errors';

/** Lỗi tải chi tiết, theo đúng NGUYÊN NHÂN: mất mạng (thử lại chữa được) ≠ chợ đóng ≠ tin không còn (404/403 — thử lại vẫn vậy) ≠ lỗi khác. */
function DetailError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = marketplaceErrorCode(error);
  if (isNetworkError(error)) {
    return <ScreenState action={{ label: 'Thử lại', onPress: onRetry }} state="offline" />;
  }
  if (code === 'COIN_008') {
    return (
      <EmptyState description={marketplaceErrorMessage(error)} icon="store" title="Chợ tài liệu chưa mở" tone="warning" />
    );
  }
  const status = httpStatusOf(error);
  if (status === 404 || status === 403) {
    return (
      <ScreenState
        description="Tin niêm yết đã bị gỡ hoặc đang tạm ẩn."
        state="forbidden"
        title="Tài liệu không còn khả dụng"
      />
    );
  }
  return (
    <ScreenState
      action={code ? undefined : { label: 'Thử lại', onPress: onRetry }}
      description={code ? marketplaceErrorMessage(error) : undefined}
      state="error"
      title="Không tải được tài liệu"
    />
  );
}

/**
 * Chi tiết listing + mua (app.md §3 "Chi tiết listing"): đầu trang (loại · giá · lượt mua · người bán), giới thiệu + nhãn, preview giới hạn,
 * nút Mua ở thanh ĐÁY (luôn trong tầm ngón cái, kèm giá), Gỡ tin (có hộp thoại xác nhận — không hoàn tác) và Báo cáo (luôn hiện).
 * `listing HIDDEN` → BE trả 404 trung tính cho người ngoài (không phải người bán) ⇒ "Tài liệu không còn khả dụng", không có "Thử lại".
 */
export function ListingDetailScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const detail = useListingDetail(listingId ?? null);
  const user = useAuthStore((state) => state.user);
  const buy = useBuyListing();
  const withdraw = useWithdrawListing();
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const header = <AppBar title="Chi tiết tài liệu" onBack={router.back} />;

  if (detail.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-xl py-xs">
          <Skeleton className="h-56 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Screen header={header}>
        <DetailError error={detail.error} onRetry={() => void detail.refetch()} />
      </Screen>
    );
  }

  const listing = detail.data;
  const isMine = user !== null && user.id === listing.sellerId;
  const canBuy = !isMine && listing.status === 'ACTIVE' && !listing.purchased;
  const canWithdraw = isMine && (listing.status === 'ACTIVE' || listing.status === 'PENDING_REVIEW');
  const hasIntro = Boolean(listing.description) || listing.tags.length > 0;

  return (
    <Screen
      footer={
        canBuy ? (
          <BottomActionBar>
            <Button
              fullWidth
              label={`Mua với ${formatCoins(listing.price)}`}
              loading={buy.isPending}
              onPress={() => {
                hapticTap();
                buy.mutate(listing, { onSuccess: () => hapticSuccess() });
              }}
            />
          </BottomActionBar>
        ) : undefined
      }
      header={header}
      refreshing={detail.isRefetching}
      onRefresh={() => void detail.refetch()}
    >
      <View className="gap-xl py-xs">
        <Reveal>
          <ListingHero isMine={isMine} listing={listing} />
        </Reveal>

        {isMine && listing.status === 'HIDDEN' && listing.hiddenReason ? (
          <Alert description={listing.hiddenReason} title="Tin đã bị ẩn" tone="error" />
        ) : null}
        {isMine && listing.status === 'PENDING_REVIEW' ? (
          <Alert description="Tin của bạn đang chờ quản trị viên duyệt." tone="warning" />
        ) : null}
        {buy.isError ? <Alert description={marketplaceErrorMessage(buy.error)} tone="error" /> : null}
        {listing.purchased ? (
          <Alert description="Bạn đã mua tài liệu này — xem trong Tin của tôi > Đã mua." tone="success" />
        ) : null}

        {hasIntro ? (
          <Reveal index={1}>
            <Section icon="document" title="Giới thiệu">
              <Card>
                {listing.description ? <Text className="text-body-md text-fg-1">{listing.description}</Text> : null}
                {listing.tags.length > 0 ? (
                  // Nhãn KHÔNG bấm được ⇒ `Badge` (nhãn), không phải `Chip` (control) — Chip trần vẫn đọc là "nút" mà bấm không có gì.
                  <View className="flex-row flex-wrap gap-xs">
                    {listing.tags.map((tag) => (
                      <Badge key={tag} label={`#${tag}`} size="sm" variant="brand" />
                    ))}
                  </View>
                ) : null}
              </Card>
            </Section>
          </Reveal>
        ) : null}

        <ListingPreview contentType={listing.contentType} preview={listing.preview} />

        <View className="flex-row items-start gap-xs">
          <Icon color="fg-2" name="alert-information" size="sm" />
          <Text className="flex-1 text-caption-sm text-fg-2">Nội dung do người dùng tạo. Xu không quy đổi ra tiền.</Text>
        </View>

        <View className="gap-xs">
          {canWithdraw ? (
            <Button
              fullWidth
              iconLeft="delete"
              label="Gỡ tin niêm yết"
              variant="danger-secondary"
              onPress={() => setConfirmingWithdraw(true)}
            />
          ) : null}
          <Button fullWidth iconLeft="alert-warning" label="Báo cáo tin này" variant="tertiary" onPress={() => setReportOpen(true)} />
        </View>
      </View>

      <ReportListingSheet listingId={listing.id} visible={reportOpen} onClose={() => setReportOpen(false)} />
      {/* ⛔ Gỡ tin không có đường mở bán lại trong app ⇒ hỏi lại trước khi gửi (trước đây bấm là gỡ ngay). */}
      <Dialog
        description="Tin sẽ ngừng hiện trên chợ tài liệu. Thao tác này không hoàn tác được."
        primaryAction={{
          label: 'Gỡ tin',
          loading: withdraw.isPending,
          onPress: () =>
            withdraw.mutate(listing.id, {
              onSettled: () => setConfirmingWithdraw(false),
              onSuccess: () => hapticSuccess(),
            }),
        }}
        secondaryAction={{ label: 'Giữ tin', onPress: () => setConfirmingWithdraw(false) }}
        title="Gỡ tin niêm yết?"
        variant="warning"
        visible={confirmingWithdraw}
        onClose={() => setConfirmingWithdraw(false)}
      />
    </Screen>
  );
}
