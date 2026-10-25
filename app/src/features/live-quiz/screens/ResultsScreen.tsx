import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { useAuthStore } from '@/shell/store/slices/auth';

import { BoardCard } from '../components/BoardCard';
import { RankedBoard } from '../components/RankedBoard';
import { ResultsHero } from '../components/ResultsHero';
import { WrongAnswersCard } from '../components/WrongAnswersCard';
import { LIVE_QUIZ_TONE } from '../constants/live-quiz-visuals';
import { useLiveQuizResults } from '../queries/live-quiz.queries';
import { HISTORY_HREF } from '../utils/live-quiz-routes';
import { quizErrorCode, quizErrorMessage } from '../utils/quiz-errors';
import { entriesFromResults } from '../utils/ranked-entries';

/**
 * Kết quả bền của phiên (app.md p5-01 §3 `Kết quả`). Kết quả được ghi bởi job `live-quiz.persist` — chưa xong
 * (`persisted=false` / `QUIZ_008`) thì hiện skeleton và tự thử lại mỗi 2 s (xem `useLiveQuizResults`). Bố cục: dải kết quả của
 * TÔI (huy chương hạng + điểm) → bảng xếp hạng với top 3 lên bục và phần còn lại là danh sách (dòng của tôi được nhấn) → khối
 * "Ôn lại câu sai" cho người chơi. Máy tính bảng giới hạn bề rộng cột nội dung và căn giữa. "Lịch sử thi của tôi" là icon ở
 * thanh tiêu đề (cùng chỗ với màn nhập PIN) thay cho nút chữ lẻ loi cuối danh sách.
 */
export function ResultsScreen() {
  const { sessionId = '' } = useLocalSearchParams<{ sessionId: string }>();
  const results = useLiveQuizResults(sessionId);
  const myId = useAuthStore((state) => state.user?.id);
  const data = results.data;
  const pending =
    results.isLoading || quizErrorCode(results.error) === 'QUIZ_008' || data?.persisted === false;
  const mine = data?.results.find((row) => row.userId === myId);
  const offlineError = isNetworkError(results.error);

  return (
    <Screen
      header={
        <AppBar
          actions={
            <Button
              accessibilityLabel="Lịch sử thi của tôi"
              iconLeft="history"
              iconOnly
              size="sm"
              variant="tertiary"
              onPress={() => router.push(HISTORY_HREF)}
            />
          }
          title="Kết quả thi"
          onBack={router.back}
        />
      }
    >
      {pending && !data?.results.length ? (
        // Khung xương đúng khuôn màn thật: dải kết quả của tôi (huy chương + điểm) rồi bảng xếp hạng có bục.
        <View className="gap-sm py-md">
          <Text accessibilityLiveRegion="polite" className="text-body-md text-fg-2">
            Đang tổng hợp kết quả…
          </Text>
          <Skeleton className="h-52 rounded-md" />
          <Skeleton className="h-64 rounded-md" />
        </View>
      ) : !data && offlineError ? (
        // Mất mạng ≠ lỗi máy chủ: hình + câu "ngoại tuyến" chung của bộ, "Thử lại" chữa được.
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void results.refetch() }}
          fullscreen={false}
          state="offline"
        />
      ) : !data || (results.isError && !offlineError) ? (
        // ⚠️ Mất mạng giữa lúc đã có kết quả thì GIỮ kết quả (nhánh dưới) — chỉ lỗi có phản hồi mới thay cả màn.
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void results.refetch() }]}
          description={quizErrorMessage(results.error, 'Không tải được kết quả.')}
          icon="alert-warning"
          title="Không tải được kết quả"
          tone="danger"
        />
      ) : (
        <View className="w-full gap-md py-md">
          <ResultsHero mine={mine} players={data.results.length} />
          {data.results.length === 0 ? (
            // Khối rỗng gọn có hình (tông cam của chế độ) thay dòng chữ xám lẻ loi dưới dải kết quả.
            <EmptyState
              description="Phiên không có người chơi."
              icon="user"
              size="compact"
              tone={LIVE_QUIZ_TONE}
            />
          ) : (
            <BoardCard>
              <RankedBoard
                entries={entriesFromResults(data.results)}
                meId={myId}
                variant="podium"
              />
            </BoardCard>
          )}
          {mine ? <WrongAnswersCard mine={mine} sessionId={sessionId} setId={data.setId} /> : null}
        </View>
      )}
    </Screen>
  );
}
