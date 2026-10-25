import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { isMockResult } from '../api/mock-attempts.types';
import { ResultActions } from '../components/result/ResultActions';
import { ScoreSummary } from '../components/result/ScoreSummary';
import { TagBarList } from '../components/result/TagBarList';
import { TagRadarChart } from '../components/result/TagRadarChart';
import { WeakTopics } from '../components/result/WeakTopics';
import { useMockAttempt } from '../queries/mock-attempts.queries';
import { studyErrorMessage } from '../utils/error-info';
import { RADAR_MIN_TAGS } from '../utils/mock-result-utils';
import { mockReviewHref, mockSetupHref } from '../utils/study-routes';

const TITLE = 'Kết quả thi thử';

/**
 * Kết quả một lượt đã kết thúc (app.md p4-02 §3 `MockResult`): ĐIỂM là tâm điểm (`ScoreSummary`: vòng điểm + Đạt/Chưa đạt
 * bằng chữ + icon + nhận xét + Đúng/Sai/Bỏ trống), rồi chủ đề nên ôn (`WeakTopics`) và điểm theo chủ đề (≥ 3 thẻ: radar CẠNH
 * danh sách thanh; ít hơn: chỉ danh sách), rồi lối đi tiếp (`ResultActions`). Lượt của người khác hoặc không tồn tại → BE
 * trả 404 ⇒ màn lỗi có nút thử lại.
 *
 * ⚠️ MỘT hành động chính ở thanh đáy ("Xem lại đáp án"; lượt không có câu để xem lại thì "Thi lại"); các lối còn lại
 * (ôn câu sai, thi lại, lịch sử) là HÀNG có mũi tên — trước đây bốn nút rộng hết bề ngang, không nút nào là "chính".
 */
export function MockResultScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const query = useMockAttempt(attemptId);
  const data = query.data;
  const header = <AppBar title={TITLE} onBack={() => router.back()} />;

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-md">
          <Skeleton className="h-96 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (query.isError || !data || !isMockResult(data)) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={query.error ? studyErrorMessage(query.error) : 'Lượt thi chưa có kết quả.'}
          icon="alert-warning"
          title="Không mở được kết quả"
          tone="danger"
        />
      </Screen>
    );
  }

  const { attempt, questions } = data;
  const hasReview = questions.length > 0;
  return (
    <Screen
      footer={
        <BottomActionBar>
          {hasReview ? (
            <Button
              fullWidth
              iconRight="arrow-right-small"
              label="Xem lại đáp án"
              variant="info"
              onPress={() => router.push(mockReviewHref(attempt.id))}
            />
          ) : (
            <Button
              fullWidth
              label="Thi lại"
              variant="info"
              onPress={() => router.replace(mockSetupHref(attempt.setId))}
            />
          )}
        </BottomActionBar>
      }
      header={header}
    >
      <View className="gap-md py-md">
        {data.lateAnswersIgnored === true ? (
          <Alert
            description="Một số đáp án được gửi sau giờ nên không được tính. Điểm chỉ tính các câu đã lưu kịp."
            tone="warning"
          />
        ) : null}
        <ScoreSummary attempt={attempt} />
        {attempt.byTag.length > 0 ? (
          <>
            <WeakTopics scores={attempt.byTag} />
            <Card title="Điểm theo chủ đề">
              <View className="gap-md tablet:flex-row tablet:items-center">
                {attempt.byTag.length >= RADAR_MIN_TAGS ? (
                  <View className="tablet:w-1/2">
                    <TagRadarChart scores={attempt.byTag} />
                  </View>
                ) : null}
                <View className="tablet:flex-1">
                  <TagBarList scores={attempt.byTag} />
                </View>
              </View>
            </Card>
          </>
        ) : null}
        <ResultActions setId={attempt.setId} showRetake={hasReview} />
      </View>
    </Screen>
  );
}
