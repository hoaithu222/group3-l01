import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ActionMenu } from '@/shared/ui/action-menu';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import { SrCaughtUp } from '../components/sr/SrCaughtUp';
import { SrSession } from '../components/sr/SrSession';
import { StopSrDialog } from '../components/sr/StopSrDialog';
import { SR_TITLE } from '../constants/study.constants';
import { useSrDue, useSrSummary, useSrUnenroll } from '../queries/sr.queries';
import { studyErrorMessage } from '../utils/error-info';

/**
 * Ôn theo lịch SM-2 (app.md p4-02 §3 `SrReview`) — `?setId=` giới hạn một bộ; không có ⇒ mọi bộ đã đăng ký. Đủ trạng
 * thái: tải (skeleton), lỗi + thử lại, hôm nay không còn thẻ (kèm lịch 7 ngày và "Ngừng ôn bộ này" khi có `setId`),
 * phiên ôn (`SrSession`, dựng lại khi `due` được nạp mới — "Ôn tiếp").
 */
export function SrReviewScreen() {
  const { setId } = useLocalSearchParams<{ setId?: string }>();
  const scope = setId || undefined;
  const due = useSrDue(scope);
  const summary = useSrSummary(scope, due.data?.items.length === 0);
  const unenroll = useSrUnenroll();
  const [stopping, setStopping] = useState(false);
  const onBack = () => router.back();
  const header = <AppBar title={SR_TITLE} onBack={onBack} />;

  if (due.isLoading) {
    return (
      <Screen header={header}>
        <Skeleton className="mt-md h-72 rounded-md" />
      </Screen>
    );
  }
  if (due.isError || !due.data) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void due.refetch() }]}
          description={due.error ? studyErrorMessage(due.error) : 'Không tải được thẻ cần ôn.'}
          icon="alert-warning"
          title="Không mở được phiên ôn"
          tone="danger"
        />
      </Screen>
    );
  }
  if (due.data.items.length === 0) {
    // "Ngừng ôn bộ này" là thao tác phá huỷ hiếm dùng: nằm ở menu ⋯ của thanh tiêu đề, KHÔNG làm nút duy nhất (nổi nhất) của
    // trạng thái "Đã ôn xong" — người vừa ôn xong chỉ cần biết mai ôn gì.
    const emptyHeader = scope ? (
      <AppBar
        actions={
          <ActionMenu
            accessibilityLabel="Tuỳ chọn ôn tập"
            items={[
              {
                icon: 'cancel',
                key: 'stop',
                label: 'Ngừng ôn bộ này',
                tone: 'danger',
                onPress: () => setStopping(true),
              },
            ]}
          />
        }
        title={SR_TITLE}
        onBack={onBack}
      />
    ) : (
      header
    );
    return (
      <Screen header={emptyHeader}>
        <SrCaughtUp summary={summary.data} />
        {scope ? (
          <StopSrDialog
            loading={unenroll.isPending}
            visible={stopping}
            onClose={() => setStopping(false)}
            onConfirm={() =>
              unenroll.mutate(scope, {
                onSuccess: () => {
                  setStopping(false);
                  showToast('success', 'Đã ngừng ôn bộ này.');
                  router.back();
                },
              })
            }
          />
        ) : null}
      </Screen>
    );
  }
  return (
    <SrSession
      key={due.dataUpdatedAt}
      items={due.data.items}
      remainingToday={due.data.remainingToday}
      setId={scope}
      onBack={onBack}
      onContinue={() => void due.refetch()}
    />
  );
}
