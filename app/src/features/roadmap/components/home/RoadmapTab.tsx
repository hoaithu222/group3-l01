import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useNow } from '@/shared/hooks/useNow';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Reveal } from '@/shared/ui/motion';
import { useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';

import type { RoadmapSubjectCardDto } from '../../api/roadmap.types';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { useRoadmapSubjects, useRoadmapToday } from '../../queries/roadmap.queries';
import { todayDay } from '../../utils/roadmap-dates';
import { roadmapSubjectHref } from '../../utils/roadmap-routes';
import { SubjectCard } from './SubjectCard';

/** Nhãn "Hôm nay/Ngày mai" chỉ đổi theo ngày — 5 phút/lần là đủ để qua nửa đêm nhãn tự đúng. */
const NOW_REFRESH_MS = 5 * 60_000;

/**
 * Tab "Lộ trình" của `StudyHomeScreen` (app.md §3): danh sách môn đã xuất bản, không phân trang
 * (`LIMITS.roadmap.subjectsMax` = 50, be.md §9). Thay thế nguyên khối `StudySetList` khi tab này đang chọn.
 *
 * ✅ "Thông minh" hơn danh sách phẳng:
 *  · Tách **Đang học** / **Khám phá thêm** — môn đang học xếp theo lần học GẦN NHẤT (thứ tự của `GET /roadmap/today`,
 *    BE sắp theo `lastActivityAt`), nên môn vừa học luôn ở trên cùng.
 *  · Mỗi thẻ đang học ghép buổi kế tiếp + ngày dự kiến từ `today` (cùng khoá cache với thẻ "Hôm nay" ở tab Của tôi —
 *    không tốn thêm lần gọi nào khi đã mở tab đó).
 *  · Vòng quay kéo-để-làm-mới chỉ hiện khi NGƯỜI DÙNG kéo (`usePullRefresh`) — trước đây nó hiện cả lúc làm mới ngầm
 *    và đè lên tên thẻ đầu tiên.
 */
export function RoadmapTab() {
  const subjectsQuery = useRoadmapSubjects();
  const todayQuery = useRoadmapToday();
  // Tab này đứng yên mounted dưới stack khi mở một môn/buổi rồi quay lại — tiến độ/buổi "Hôm nay" vừa
  // đổi chỉ hiện đúng khi dữ liệu đã cũ VÀ vừa focus lại màn Học (`useRefetchOnFocus`).
  useRefetchOnFocus(subjectsQuery);
  useRefetchOnFocus(todayQuery);
  const today = todayDay(useNow(NOW_REFRESH_MS));
  const pull = usePullRefresh(() => Promise.all([subjectsQuery.refetch(), todayQuery.refetch()]));
  const refreshControl = useListRefreshControl(pull);

  const { learning, nextBySubject, others } = useMemo(() => {
    const todayItems = todayQuery.data ?? [];
    const order = new Map(todayItems.map((item, index) => [item.subject.id, index]));
    const all = subjectsQuery.data ?? [];
    const rank = (subject: RoadmapSubjectCardDto) =>
      order.get(subject.id) ?? Number.MAX_SAFE_INTEGER;
    return {
      learning: all.filter((subject) => subject.myEnrollment).sort((a, b) => rank(a) - rank(b)),
      nextBySubject: new Map(todayItems.map((item) => [item.subject.id, item])),
      others: all.filter((subject) => !subject.myEnrollment),
    };
  }, [subjectsQuery.data, todayQuery.data]);

  const openSubject = (subject: RoadmapSubjectCardDto) =>
    router.push(roadmapSubjectHref(subject.slug));

  if (subjectsQuery.isLoading) {
    return (
      <View className="gap-md px-md pt-xs">
        <Skeleton className="h-44 rounded-md" />
        <Skeleton className="h-36 rounded-md" />
      </View>
    );
  }

  if (subjectsQuery.isError) {
    return (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void subjectsQuery.refetch() }}
        description={
          isNetworkError(subjectsQuery.error) ? undefined : toErrorMessage(subjectsQuery.error)
        }
        state={isNetworkError(subjectsQuery.error) ? 'offline' : 'error'}
        title={
          isNetworkError(subjectsQuery.error) ? undefined : 'Không tải được danh sách lộ trình'
        }
      />
    );
  }

  if (learning.length === 0 && others.length === 0) {
    return (
      <ScreenState
        description="Lộ trình sẽ sớm có mặt."
        icon="book"
        state="empty"
        title="Chưa có lộ trình nào"
      />
    );
  }

  // Chỉ đặt tiêu đề nhóm khi có CẢ HAI nhóm — một nhóm duy nhất thì tiêu đề chỉ chiếm chỗ mà không phân biệt gì.
  const grouped = learning.length > 0 && others.length > 0;
  const renderCards = (items: readonly RoadmapSubjectCardDto[]) => (
    <View className="gap-md">
      {items.map((subject) => (
        <SubjectCard
          key={subject.id}
          next={nextBySubject.get(subject.id)}
          subject={subject}
          today={today}
          onOpen={openSubject}
        />
      ))}
    </View>
  );

  // Hai nhóm hiện lần lượt lúc mở tab (một lần mỗi lần gắn vào cây, tự tắt khi "Giảm chuyển động") — cả nhóm là MỘT khối nên
  // danh sách dài không biến thành chuỗi hiệu ứng từng thẻ.
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-xl pb-xl pt-xs"
      refreshControl={refreshControl}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {learning.length > 0 ? (
        <Reveal>
          {grouped ? (
            <Section className="gap-xs" title="Đang học" titleClassName="px-md" tone="default">
              {renderCards(learning)}
            </Section>
          ) : (
            renderCards(learning)
          )}
        </Reveal>
      ) : null}
      {others.length > 0 ? (
        <Reveal index={1}>
          {grouped ? (
            <Section className="gap-xs" title="Khám phá thêm" titleClassName="px-md" tone="default">
              {renderCards(others)}
            </Section>
          ) : (
            renderCards(others)
          )}
        </Reveal>
      ) : null}
    </ScrollView>
  );
}
