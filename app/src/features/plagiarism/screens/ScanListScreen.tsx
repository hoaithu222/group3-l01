import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton, SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticTap } from '@/shared/utils/haptics';

import { useScansInfinite } from '../api/plagiarism.queries';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { HowScoringWorksSheet } from '../components/HowScoringWorksSheet';
import { ScanStatusRow } from '../components/ScanStatusRow';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { useScanProgressSocket } from '../hooks/useScanProgressSocket';
import { errorStateOf } from '../utils/error-state';

/** Khung xương đúng dáng màn: dải banner + ba dòng lượt quét (ô icon + hai dòng chữ). */
function ScanListSkeleton() {
  return (
    <View className="gap-xl py-xs">
      <Skeleton className="h-24 rounded-md" />
      <View className="gap-sm">
        {[0, 1, 2].map((i) => (
          <View key={i} className="rounded-md bg-bg-1 p-md">
            <SkeletonParagraphWithIcon />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Danh sách lượt kiểm tra trùng lặp của nhóm (app.md §3) — OWNER/ADMIN. Huỷ/xoá làm ở màn báo cáo
 * (`ScanReportScreen`, `myActions`) — chưa làm thao tác vuốt trên từng dòng của danh sách này (điểm mở, xem báo cáo cuối).
 *
 * Mở đầu bằng `ModuleBanner` (icon `copy` — "bản giống nhau", tông `accent` khác tông `info` của phân hệ Nhóm) mang luôn
 * nút "Quét mới", nên danh sách rỗng không cần nút thứ hai. Kéo-để-làm-mới dùng `usePullRefresh` (xem lý do ở hook).
 */
export function ScanListScreen() {
  const { wsId = '' } = useLocalSearchParams<{ wsId: string }>();
  const scans = useScansInfinite(wsId, undefined);
  useRefetchOnFocus(scans);
  useScanProgressSocket();
  const pull = usePullRefresh(scans.refetch);
  const [howScoringVisible, setHowScoringVisible] = useState(false);

  const header = <AppBar title="Kiểm tra trùng lặp" onBack={router.back} />;
  const items = scans.data?.pages.flatMap((p) => p.items) ?? [];
  const openNewScan = () => {
    hapticTap();
    router.push(`/workspaces/${wsId}/plagiarism/new` as Href);
  };

  if (scans.isLoading) {
    return (
      <Screen header={header}>
        <ScreenState skeleton={<ScanListSkeleton />} state="loading" />
      </Screen>
    );
  }
  if (scans.isError) {
    const state = errorStateOf(scans.error);
    return (
      <Screen header={header}>
        <ScreenState
          action={
            state === 'forbidden'
              ? undefined
              : { label: 'Thử lại', onPress: () => void scans.refetch() }
          }
          description={
            state === 'forbidden'
              ? 'Chỉ trưởng nhóm (chủ nhóm/quản trị nhóm) dùng được tính năng này.'
              : undefined
          }
          fullscreen
          state={state}
          title={state === 'forbidden' ? 'Không xem được' : undefined}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
      <View className="gap-xl py-xs">
        <Reveal>
          <ModuleBanner
            action={<Button iconLeft="add" label="Quét mới" size="sm" onPress={openNewScan} />}
            description="So bài nộp, tài liệu và mã nguồn của nhóm để tìm các đoạn giống nhau"
            icon="copy"
            title="Đối chiếu tài liệu nhóm"
            tone="accent"
          />
        </Reveal>
        <Reveal index={1}>
          <DisclaimerBanner onOpenHowScoringWorks={() => setHowScoringVisible(true)} />
        </Reveal>
        <Reveal index={2}>
          <Section icon="history" title="Các lượt kiểm tra">
            {items.length === 0 ? (
              <EmptyState
                description="Bấm “Quét mới” ở trên, chọn tệp của nhóm rồi bắt đầu kiểm tra."
                icon="copy"
                size="compact"
                title="Chưa có lượt kiểm tra nào"
                tone="accent"
              />
            ) : (
              <View className="gap-sm">
                {items.map((scan) => (
                  <ScanStatusRow
                    key={scan.id}
                    scan={scan}
                    targetCount={scan.targetResourceIds.length}
                    onPress={() => router.push(`/workspaces/${wsId}/plagiarism/${scan.id}` as Href)}
                  />
                ))}
              </View>
            )}
            {scans.hasNextPage ? (
              <Button
                label="Xem thêm"
                loading={scans.isFetchingNextPage}
                variant="secondary"
                onPress={() => void scans.fetchNextPage()}
              />
            ) : null}
          </Section>
        </Reveal>
      </View>
      <HowScoringWorksSheet
        visible={howScoringVisible}
        onClose={() => setHowScoringVisible(false)}
      />
    </Screen>
  );
}
