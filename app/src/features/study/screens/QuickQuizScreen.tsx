import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { QuickQuizSession } from '../components/quiz/QuickQuizSession';
import { STUDY_MODE_META } from '../constants/study-modes.constants';
import { useStudyItems } from '../queries/study-items.queries';
import { useStudySet } from '../queries/study-sets.queries';
import { quizItems } from '../utils/quick-quiz-items';
import { setEditHref } from '../utils/study-routes';

const TITLE = STUDY_MODE_META.quick.label;

/**
 * Quiz nhanh (chế độ luyện tập chỉ phía app): tải bộ → phiên làm từng câu (`QuickQuizSession`). Màn này chỉ lo các trạng thái DỮ LIỆU — đang tải · lỗi + thử lại ·
 * bộ KHÔNG có câu chấm được (chỉ thẻ ghi nhớ, hoặc rỗng) — nội dung phiên nằm ở `QuickQuizSession`. Dùng lại cache `items` của Học thẻ/Thi thử (không API mới); chạy
 * hoàn toàn TRÊN MÁY, không ghi điểm/XP lên server.
 */
export function QuickQuizScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const set = useStudySet(setId);
  const items = useStudyItems(setId);
  const pool = useMemo(() => quizItems(items.data?.items ?? []), [items.data]);
  const header = <AppBar title={TITLE} onBack={() => router.back()} />;

  if (items.isLoading || set.isLoading) {
    return (
      <Screen header={header}>
        <Skeleton className="mt-md h-72 rounded-md" />
      </Screen>
    );
  }
  if (items.isError || !items.data) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void items.refetch() }]}
          description={
            items.error ? toErrorMessage(items.error) : 'Không tải được nội dung bộ học.'
          }
          icon="alert-warning"
          title="Không mở được bộ học"
          tone="danger"
        />
      </Screen>
    );
  }
  if (pool.length === 0) {
    const editable = set.data?.myPermissions.edit === true && set.data.status === 'ACTIVE';
    return (
      <Screen header={header}>
        <EmptyState
          actions={[
            ...(editable
              ? [{ label: 'Thêm câu hỏi', onPress: () => router.push(setEditHref(setId)) }]
              : []),
            { label: 'Về bộ học', onPress: () => router.back() },
          ]}
          description="Quiz nhanh chỉ dùng câu trắc nghiệm, đúng/sai và điền chỗ trống — bộ này chưa có câu nào. Thẻ ghi nhớ thì học ở chế độ Học thẻ."
          icon={STUDY_MODE_META.quick.icon}
          title="Chưa có câu để làm Quiz"
          tone={STUDY_MODE_META.quick.tone}
        />
      </Screen>
    );
  }
  // `key` theo số câu: bộ vừa sửa (thêm/bớt câu) thì phiên bắt đầu lại từ thiết lập, không giữ lượt cũ trên danh sách đã đổi.
  return (
    <QuickQuizSession
      key={pool.length}
      pool={pool}
      setTitle={set.data?.title}
      onLeave={() => router.back()}
    />
  );
}
