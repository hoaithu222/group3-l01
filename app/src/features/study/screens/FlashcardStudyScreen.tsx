import { router, useLocalSearchParams } from 'expo-router';

import { toErrorMessage } from '@/core/api/client.helpers';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { FlashcardSession } from '../components/flashcard/FlashcardSession';
import { useStudyItems } from '../queries/study-items.queries';
import { useStudySet } from '../queries/study-sets.queries';

/**
 * Học thẻ (app.md p4-01 §3 `FlashcardStudy`): tải bộ → phiên học (`FlashcardSession`). Màn này chỉ lo các trạng thái DỮ LIỆU
 * (tải · lỗi + thử lại · bộ rỗng); toàn bộ giao diện phiên (thẻ lật, vuốt chấm, tiến độ, tóm tắt) nằm ở `FlashcardSession`.
 * Chạy hoàn toàn TRÊN MÁY từ cache `items` (không ghi server — SR thật là p4-02).
 */
export function FlashcardStudyScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const set = useStudySet(setId);
  const items = useStudyItems(setId);

  if (items.isLoading || set.isLoading) {
    return (
      <Screen header={<AppBar title="Học thẻ" onBack={router.back} />}>
        <Skeleton className="mt-md h-72 rounded-md" />
      </Screen>
    );
  }
  if (items.isError || !items.data) {
    return (
      <Screen header={<AppBar title="Học thẻ" onBack={router.back} />}>
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
  if (items.data.items.length === 0) {
    return (
      <Screen header={<AppBar title="Học thẻ" onBack={router.back} />}>
        <EmptyState
          description="Bộ này chưa có mục nào để học."
          icon="book"
          title="Bộ chưa có mục"
          tone="success"
        />
      </Screen>
    );
  }
  // `key` theo số mục: tải lại bộ có mục mới thì phiên bắt đầu lại đúng danh sách, không giữ chỉ số cũ.
  return (
    <FlashcardSession
      key={items.data.items.length}
      items={items.data.items}
      language={set.data?.language}
      title={set.data?.title ?? 'Học thẻ'}
      onBack={() => router.back()}
    />
  );
}
