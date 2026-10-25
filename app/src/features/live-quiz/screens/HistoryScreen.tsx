import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';

import { HistoryItemCard } from '../components/HistoryItemCard';
import { MotionView } from '../components/MotionView';
import { useLiveQuizHistory } from '../queries/live-quiz.queries';
import { joinHref, resultsHref } from '../utils/live-quiz-routes';
import { quizErrorMessage } from '../utils/quiz-errors';

/**
 * Lịch sử thi trực tiếp của tôi (`GET /me/live-quiz/history`, cursor, mới → cũ).
 * Mỗi lượt là một `HistoryItemCard` (`Card onPress`, tiêu đề = tên bộ, mang vai `button`) — huy chương hạng, điểm, số câu đúng
 * và thanh tỉ lệ; không tự dựng `Pressable` + `Text`. Thẻ hiện lần lượt (rise, tối đa 8 thẻ đầu để danh sách dài không chờ).
 */
export function HistoryScreen() {
  const history = useLiveQuizHistory();
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen
      header={<AppBar title="Lịch sử thi trực tiếp" onBack={router.back} />}
      refreshing={history.isRefetching}
      onRefresh={() => void history.refetch()}
    >
      {history.isLoading ? (
        // Khung xương ĐÚNG khuôn thẻ lượt thi (tiêu đề + huy chương/điểm + thanh tỉ lệ) — ba thẻ, không nhảy bố cục khi dữ liệu về.
        <View className="gap-sm py-md">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </View>
      ) : history.isError && items.length === 0 && isNetworkError(history.error) ? (
        // Mất mạng ≠ lỗi máy chủ (`mobile-ux.md`): hình + câu "ngoại tuyến" chung của bộ, "Thử lại" chữa được.
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void history.refetch() }}
          fullscreen={false}
          state="offline"
        />
      ) : history.isError && items.length === 0 ? (
        // Chỉ thay danh sách bằng lỗi khi CHƯA có gì để xem: làm mới hỏng mà vẫn còn bản đã tải thì giữ bản đó.
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void history.refetch() }]}
          description={quizErrorMessage(history.error)}
          icon="alert-warning"
          title="Không tải được lịch sử"
          tone="danger"
        />
      ) : items.length === 0 ? (
        <EmptyState
          actions={[{ label: 'Nhập mã PIN', onPress: () => router.push(joinHref()) }]}
          description="Tham gia một phòng thi bằng mã PIN để bắt đầu."
          icon="history"
          title="Chưa có lượt thi nào"
          tone="warning"
        />
      ) : (
        <View className="gap-sm py-md">
          {items.map((item, index) => (
            <MotionView key={item.sessionId} index={index}>
              <HistoryItemCard
                item={item}
                onPress={() => router.push(resultsHref(item.sessionId))}
              />
            </MotionView>
          ))}
          {history.hasNextPage ? (
            <Button
              label="Tải thêm"
              loading={history.isFetchingNextPage}
              variant="tertiary"
              onPress={() => void history.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
