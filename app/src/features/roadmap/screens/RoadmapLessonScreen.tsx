import { isAxiosError } from 'axios';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { getErrorCode } from '@/core/api/client.helpers';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton, SkeletonParagraph } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';

import type { RoadmapLessonDto } from '../api/roadmap.types';
import { ContentTab } from '../components/lesson/ContentTab';
import { LessonFooter } from '../components/lesson/LessonFooter';
import { LessonHeader } from '../components/lesson/LessonHeader';
import { LessonTabs, type LessonTabKey } from '../components/lesson/LessonTabs';
import { MediaTab } from '../components/lesson/MediaTab';
import { ResourcesTab } from '../components/lesson/ResourcesTab';
import { SelfCheckTab } from '../components/lesson/SelfCheckTab';
import { useLessonProgress } from '../hooks/useLessonProgress';
import { useRoadmapLesson, useRoadmapMedia } from '../queries/roadmap.queries';
import { lessonCode } from '../utils/lesson-title';

/** Khung xương đúng khuôn màn thật (tiêu đề + dòng meta + hàng tab + đoạn văn) — không nhảy bố cục khi dữ liệu về. */
function LessonSkeleton() {
  return (
    <View className="gap-md px-md pt-2xs">
      <Skeleton className="h-12 w-full rounded-full" />
      <View className="gap-xs">
        <Skeleton className="h-6 w-4/5 rounded-2xs" />
        <Skeleton className="h-4 w-1/2 rounded-2xs" />
      </View>
      <SkeletonParagraph />
    </View>
  );
}

/**
 * Màn buổi học 4 tab (app.md §3). Tách thân màn (`LessonScreenBody`) khỏi phần tải/lỗi: `useLessonProgress` đòi
 * `RoadmapLessonDto` KHÔNG rỗng, mà hook không được gọi có điều kiện — `LessonScreenBody` chỉ được dựng (mount)
 * SAU khi `lesson` đã có, nên nó gọi hook đó vô điều kiện đúng luật.
 *
 * ⚠️ Ba lỗi, ba câu (mobile-ux.md "mất mạng ≠ app hỏng"): mất mạng → "ngoại tuyến" + Thử lại; `RMAP_006` (SEQUENTIAL
 * chưa mở) → "Buổi học chưa mở"; 404 → "Không tìm thấy". Bản trước gộp mất mạng vào "Không tìm thấy buổi học".
 */
export function RoadmapLessonScreen() {
  const { lessonId, subjectId } = useLocalSearchParams<{ lessonId: string; subjectId: string }>();
  const query = useRoadmapLesson(lessonId);

  if (!query.data) {
    const offline = isNetworkError(query.error);
    const locked = isAxiosError(query.error) && getErrorCode(query.error) === 'RMAP_006';
    // "Quay lại", không "Về lộ trình": màn này mở được từ thẻ "Hôm nay" (tab Của tôi) và từ link, không chỉ từ lộ trình.
    const back = { label: 'Quay lại', onPress: () => router.back() };
    return (
      <Screen
        header={<AppBar title="Buổi học" onBack={router.back} />}
        padded={false}
        scrollable={false}
      >
        {query.isLoading ? (
          <LessonSkeleton />
        ) : offline ? (
          <ScreenState
            action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
            state="offline"
          />
        ) : (
          // Cả hai ca đều là "không mở được — thử lại vô ích" ⇒ tông cam `forbidden` (quy ước 403/404 của `ScreenState`): chưa mở
          // giữ ổ khoá mặc định, bị ẩn/không còn thì hình QUYỂN SÁCH (buổi học) — trước đây ca 404 là `empty` không có hình nào.
          <ScreenState
            action={back}
            description={
              locked ? 'Hoàn thành buổi trước để mở buổi này.' : 'Buổi học đã bị ẩn hoặc không còn.'
            }
            icon={locked ? undefined : 'book'}
            state="forbidden"
            title={locked ? 'Buổi học chưa mở' : 'Không tìm thấy buổi học'}
          />
        )}
      </Screen>
    );
  }

  return <LessonScreenBody lesson={query.data} subjectId={subjectId} />;
}

function LessonScreenBody({ lesson, subjectId }: { lesson: RoadmapLessonDto; subjectId: string }) {
  const [tab, setTab] = useState<LessonTabKey>('content');
  // Ảnh nằm NGAY TRONG bài ⇒ tải media khi mở tab Nội dung (mặc định) hoặc Hình ảnh; hai tab kia không cần.
  const mediaEnabled = lesson.mediaCount > 0 && (tab === 'content' || tab === 'media');
  const mediaQuery = useRoadmapMedia(lesson.id, mediaEnabled);
  const progress = useLessonProgress(lesson, subjectId);
  const checkedCount = lesson.checklist.filter((item) =>
    progress.view.checkedItemIds.includes(item.id),
  ).length;
  // ⚠️ Thông tin buổi học cuộn CÙNG từng tab; ghim khối này sẽ ép nội dung trên máy thấp/chữ lớn.
  const lessonHeader = <LessonHeader lesson={lesson} status={progress.view.status} />;

  return (
    <Screen
      footer={
        <LessonFooter
          completing={progress.completing}
          lessonLabel={lesson.lessonLabel}
          next={lesson.next}
          prev={lesson.prev}
          status={progress.view.status}
          subjectId={subjectId}
          onComplete={progress.complete}
        />
      }
      // Chỉ ghim mã buổi và hàng tab. Tiêu đề đầy đủ + giai đoạn nằm trong vùng cuộn.
      header={<AppBar title={lessonCode(lesson.lessonLabel, lesson.number)} onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <LessonTabs
        checkedCount={checkedCount}
        checklistTotal={lesson.checklist.length}
        mediaCount={lesson.mediaCount}
        resourceCount={lesson.resources.length}
        value={tab}
        onChange={setTab}
      />
      {tab === 'content' ? (
        <ContentTab
          header={lessonHeader}
          lesson={lesson}
          media={mediaQuery.data}
          mediaLoading={mediaEnabled && mediaQuery.isLoading}
        />
      ) : null}
      {tab === 'resources' ? (
        <ResourcesTab
          header={lessonHeader}
          practiceSets={lesson.practiceSets}
          resources={lesson.resources}
        />
      ) : null}
      {tab === 'media' ? (
        <MediaTab
          blocks={lesson.blocks}
          header={lessonHeader}
          lessonId={lesson.id}
          loading={mediaQuery.isLoading}
          media={mediaQuery.data ?? []}
        />
      ) : null}
      {tab === 'selfcheck' ? (
        <SelfCheckTab
          checklist={lesson.checklist}
          completing={progress.completing}
          header={lessonHeader}
          unit={lesson.lessonLabel.toLowerCase()}
          view={progress.view}
          onComplete={progress.complete}
          onSetNote={progress.setNote}
          onSetSelfRating={progress.setSelfRating}
          onToggleItem={progress.toggleChecklistItem}
        />
      ) : null}
    </Screen>
  );
}
