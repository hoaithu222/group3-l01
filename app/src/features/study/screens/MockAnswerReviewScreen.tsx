import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { isMockResult } from '../api/mock-attempts.types';
import { ReviewQuestionCard } from '../components/mock/ReviewQuestionCard';
import { ReviewSummaryBar } from '../components/mock/ReviewSummaryBar';
import { useMockAttempt } from '../queries/mock-attempts.queries';
import { studyErrorMessage } from '../utils/error-info';
import { reviewCounts } from '../utils/mock-review-utils';

const TITLE = 'Xem lại đáp án';

/**
 * Xem lại đáp án của một lượt đã kết thúc (app.md p4-02 §1 `results/[attemptId]/review`): đếm Đúng/Sai/Bỏ trống, chip lọc
 * "Chỉ câu sai", rồi `FlashList` các câu — mỗi đáp án có trạng thái riêng (icon + chữ, không chỉ màu). Dùng lại cache
 * `detail` của màn kết quả nên mở tức thì; lượt chưa kết thúc/404 → màn lỗi.
 */
export function MockAnswerReviewScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const query = useMockAttempt(attemptId);
  const [wrongOnly, setWrongOnly] = useState(false);
  const data = query.data;
  const result = data && isMockResult(data) ? data : undefined;
  const counts = useMemo(() => reviewCounts(result?.questions ?? []), [result]);
  const shown = useMemo(
    () =>
      wrongOnly ? (result?.questions ?? []).filter((q) => !q.correct) : (result?.questions ?? []),
    [result, wrongOnly],
  );
  const header = <AppBar title={TITLE} onBack={() => router.back()} />;

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-md">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-56 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (query.isError || !result) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={query.error ? studyErrorMessage(query.error) : 'Lượt thi chưa có kết quả.'}
          icon="alert-warning"
          title="Không mở được đáp án"
          tone="danger"
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} padded={false} scrollable={false}>
      <View className="flex-1 gap-xs py-xs">
        <ReviewSummaryBar
          counts={counts}
          shown={shown.length}
          total={result.questions.length}
          wrongOnly={wrongOnly}
          onToggleWrongOnly={() => setWrongOnly((v) => !v)}
        />
        {shown.length === 0 ? (
          <EmptyState
            description="Bạn đã trả lời đúng tất cả các câu."
            icon="checkmark-circle"
            title="Không có câu sai"
            tone="success"
          />
        ) : (
          <FlashList
            contentContainerStyle={{ paddingBottom: 24 }}
            data={shown}
            keyExtractor={(q) => q.itemId}
            renderItem={({ item }) => <ReviewQuestionCard question={item} />}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Screen>
  );
}
