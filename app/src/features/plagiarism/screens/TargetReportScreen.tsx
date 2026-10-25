import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import { useSectionContext, useSectionsInfinite } from '../api/plagiarism.queries';
import { ComparisonViewer } from '../components/ComparisonViewer';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { MatchSectionRow } from '../components/MatchSectionRow';
import { useSectionNavigator } from '../hooks/useSectionNavigator';
import { errorStateOf } from '../utils/error-state';

/** Khung xương: ba dòng đoạn trùng + hai khối đối chiếu. */
function TargetSkeleton() {
  return (
    <View className="gap-xl py-xs">
      <View className="gap-xs">
        <Skeleton className="h-14 rounded-sm" />
        <Skeleton className="h-14 rounded-sm" />
        <Skeleton className="h-14 rounded-sm" />
      </View>
      <Skeleton className="h-40 rounded-md" />
    </View>
  );
}

/**
 * Danh sách đoạn trùng của MỘT tệp đích + viewer đối chiếu (app.md §3).
 *
 * Lỗi tải có nhánh riêng — bản cũ không xét `isError` nên mất sóng hiện "Không có đoạn trùng" (kết luận SAI). "Xem thêm
 * đoạn" là `Button` thật (bản cũ là `<Text onPress>` không vai `button`, vùng chạm ~20dp).
 */
export function TargetReportScreen() {
  const { scanId = '', resourceId = '' } = useLocalSearchParams<{
    scanId: string;
    resourceId: string;
  }>();
  const sections = useSectionsInfinite(scanId, resourceId, undefined);
  const flat = useMemo(() => sections.data?.pages.flatMap((p) => p.items) ?? [], [sections.data]);
  const nav = useSectionNavigator(flat);
  const context = useSectionContext(scanId, nav.section?.id ?? null);

  const header = <AppBar title="Đoạn trùng" onBack={router.back} />;

  if (sections.isLoading) {
    return (
      <Screen header={header}>
        <ScreenState skeleton={<TargetSkeleton />} state="loading" />
      </Screen>
    );
  }

  if (sections.isError) {
    const state = errorStateOf(sections.error);
    return (
      <Screen header={header}>
        <ScreenState
          action={
            state === 'forbidden'
              ? undefined
              : { label: 'Thử lại', onPress: () => void sections.refetch() }
          }
          fullscreen
          state={state}
        />
      </Screen>
    );
  }

  if (flat.length === 0) {
    return (
      <Screen header={header}>
        <View className="py-xs">
          <EmptyState
            description="Tệp này không có đoạn trùng nào được ghi nhận."
            icon="checkmark-circle"
            title="Không có đoạn trùng"
            tone="success"
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <View className="gap-xl py-xs">
        <DisclaimerBanner />
        <Section icon="copy" title="Các đoạn trùng">
          <View className="gap-xs">
            {flat.map((section) => (
              <MatchSectionRow
                key={section.id}
                section={section}
                selected={nav.section?.id === section.id}
                onSelect={nav.selectSection}
              />
            ))}
          </View>
          {sections.hasNextPage ? (
            <Button
              label="Xem thêm đoạn"
              loading={sections.isFetchingNextPage}
              size="sm"
              variant="secondary"
              onPress={() => void sections.fetchNextPage()}
            />
          ) : null}
        </Section>
        <Section icon="view" title="Đối chiếu">
          <ComparisonViewer
            context={context.data}
            error={context.isError}
            loading={context.isLoading}
            position={nav.position}
            onNext={nav.goNext}
            onPrev={nav.goPrev}
            onRetry={() => void context.refetch()}
          />
        </Section>
      </View>
    </Screen>
  );
}
