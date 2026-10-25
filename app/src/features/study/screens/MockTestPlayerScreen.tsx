import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { isMockResult } from '../api/mock-attempts.types';
import { MockPlayer } from '../components/mock/MockPlayer';
import { useMockPlayerHydrated } from '../hooks/useMockPlayerHydrated';
import { useMockAttempt } from '../queries/mock-attempts.queries';
import { useMockPlayerStore } from '../store/mock-player.store';
import { studyErrorMessage } from '../utils/error-info';
import { mockResultHref } from '../utils/study-routes';

const TITLE = 'Thi thử';

/**
 * Làm bài thi thử (app.md p4-02 §3 `MockTestPlayer`). Chờ store đáp án nạp xong từ đĩa rồi mới dựng `MockPlayer` (đọc
 * store lúc còn rỗng thì "khôi phục" ra không có gì). Lượt đã kết thúc (đã nộp/tự nộp lúc app ở nền) → dọn đáp án chờ
 * gửi và chuyển sang màn kết quả.
 */
export function MockTestPlayerScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const attempt = useMockAttempt(attemptId);
  const hydrated = useMockPlayerHydrated();
  const data = attempt.data;
  const finished = data !== undefined && isMockResult(data);

  useEffect(() => {
    if (!finished) return;
    useMockPlayerStore.getState().clear(attemptId);
    router.replace(mockResultHref(attemptId));
  }, [finished, attemptId]);

  if (attempt.isError) {
    return (
      <Screen header={<AppBar title={TITLE} onBack={() => router.back()} />}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void attempt.refetch() }]}
          description={studyErrorMessage(attempt.error)}
          icon="alert-warning"
          title="Không mở được bài thi"
          tone="danger"
        />
      </Screen>
    );
  }
  if (!data || isMockResult(data) || !hydrated) {
    return (
      <Screen header={<AppBar title={TITLE} onBack={() => router.back()} />}>
        {/* Khung xương theo đúng bố cục màn thi: đồng hồ, thẻ đề, đáp án — không nhảy bố cục khi đề tải xong. */}
        <View className="gap-sm py-md">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-28 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
        </View>
      </Screen>
    );
  }
  // `key` theo lượt: đổi `attemptId` (mở lượt khác) dựng lại toàn bộ state cục bộ.
  return <MockPlayer key={data.attempt.id} view={data} />;
}
