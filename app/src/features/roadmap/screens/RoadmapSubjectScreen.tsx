import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { EmptyState } from '@/shared/ui/empty-state';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { isNetworkError } from '@/shared/utils/errors';
import { showToast } from '@/shared/utils/toast.utils';

import { CapstoneRow } from '../components/subject/CapstoneRow';
import { EnrollSheet } from '../components/subject/EnrollSheet';
import { LessonRow } from '../components/subject/LessonRow';
import { PhaseHeader } from '../components/subject/PhaseHeader';
import { PhaseTabs } from '../components/subject/PhaseTabs';
import { SubjectHeader } from '../components/subject/SubjectHeader';
import { SubjectSkeleton } from '../components/subject/SubjectSkeleton';
import { phaseTone } from '../constants/roadmap.constants';
import { usePullRefresh } from '../hooks/usePullRefresh';
import { useSubjectInsights } from '../hooks/useSubjectInsights';
import { useRoadmapSubject } from '../queries/roadmap.queries';
import { roadmapLessonHref } from '../utils/roadmap-routes';

/**
 * Tổng quan MỘT môn (app.md §3): thẻ tiến độ + nút "Học tiếp Buổi N" (`SubjectHeader`) · dải tháng có tiến độ
 * (`PhaseTabs`) · thẻ tháng (`PhaseHeader`) · đường thời gian các buổi (`LessonRow`) kết thúc bằng dự án cuối tháng
 * (`CapstoneRow`) · `EnrollSheet`. `subjectId` nhận cả id lẫn slug (route `[subjectId]` dùng chung cho cả hai lối vào
 * — thẻ môn mở bằng slug, thẻ "Hôm nay" mở bằng id).
 *
 * ✅ Mở màn ở THÁNG ĐANG HỌC (tháng chứa buổi kế tiếp — `insights.currentPhaseId`), không phải luôn T1: học tới tháng 5
 * thì không phải bấm qua bốn tab mới thấy buổi cần học.
 */
export function RoadmapSubjectScreen() {
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const query = useRoadmapSubject(subjectId);
  // Màn nằm dưới stack khi mở một buổi rồi quay lại — vẫn mounted nên không tự tải lại; tiến độ vừa
  // hoàn thành ở màn buổi chỉ hiện đúng khi dữ liệu đã cũ VÀ vừa focus lại (`useRefetchOnFocus`).
  useRefetchOnFocus(query);
  const subject = query.data;
  const insights = useSubjectInsights(subject);
  const [phaseId, setPhaseId] = useState<string | undefined>();
  const [enrollVisible, setEnrollVisible] = useState(false);
  // Vòng quay chỉ khi NGƯỜI DÙNG kéo — làm mới ngầm sau khi hoàn thành buổi không vẽ vòng đè lên thẻ tiến độ.
  const pull = usePullRefresh(() => query.refetch());
  const refreshControl = useListRefreshControl(pull);

  const phases = useMemo(
    () => [...(subject?.phases ?? [])].sort((a, b) => a.index - b.index),
    [subject?.phases],
  );
  const lessons = useMemo(
    () => [...(subject?.lessons ?? [])].sort((a, b) => a.number - b.number),
    [subject?.lessons],
  );
  const activePhaseId = phaseId ?? insights?.currentPhaseId ?? phases[0]?.id;
  const activePhase = phases.find((phase) => phase.id === activePhaseId);
  const lessonsInPhase = lessons.filter((lesson) => lesson.phaseId === activePhaseId);
  const unit = subject?.lessonLabel.toLowerCase() ?? 'buổi';
  const offline = isNetworkError(query.error);

  const openLesson = (lessonId: string) => {
    if (subject) router.push(roadmapLessonHref(subject.id, lessonId));
  };

  const continueToLesson = () => {
    const target =
      insights && !insights.finished && insights.nextLesson ? insights.nextLesson : lessons[0];
    if (target) openLesson(target.id);
  };

  return (
    <Screen
      header={<AppBar title={subject?.title ?? 'Lộ trình'} onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      {query.isLoading ? (
        <SubjectSkeleton />
      ) : !subject || !insights ? (
        offline ? (
          <ScreenState
            action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
            state="offline"
          />
        ) : (
          // Mất quyền/404 giữ tông cam của `forbidden`, nhưng hình là BẢN ĐỒ lộ trình (icon mặc định của môn) — nói đúng
          // "cái gì" không còn, thay vì ổ khoá chung chung.
          <ScreenState
            description="Lộ trình không còn tồn tại hoặc đã bị ẩn."
            icon="navigation-map"
            state="forbidden"
            title="Lộ trình không còn"
          />
        )
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-md pb-xl"
            refreshControl={refreshControl}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            {/* Ba khối ĐẦU màn hiện lần lượt (một lần lúc mở màn, tự tắt khi "Giảm chuyển động"). ⛔ Không bọc hàng buổi học:
                đổi tháng là cả danh sách gắn lại ⇒ mỗi lần chạm một tháng lại chờ hiệu ứng, và đường nối giữa các nút bị vẽ rời. */}
            <Reveal>
              <SubjectHeader
                insights={insights}
                subject={subject}
                onContinue={continueToLesson}
                onEnroll={() => setEnrollVisible(true)}
              />
            </Reveal>
            {phases.length > 0 ? (
              <Reveal index={1}>
                <PhaseTabs
                  phases={phases}
                  stats={insights.phases}
                  unit={unit}
                  value={activePhaseId ?? ''}
                  onChange={setPhaseId}
                />
              </Reveal>
            ) : null}
            {activePhase ? (
              <Reveal className="px-md" index={2}>
                <PhaseHeader
                  optionalCount={lessonsInPhase.filter((lesson) => lesson.optional).length}
                  phase={activePhase}
                  stats={insights.phases[activePhase.id]}
                  tone={phaseTone(activePhase)}
                  unit={unit}
                />
              </Reveal>
            ) : null}
            {lessonsInPhase.length === 0 ? (
              // Tháng chưa có buổi nào (giáo trình đang soạn) — khối rỗng gọn có hình, thay dòng chữ xám lẻ loi.
              <EmptyState
                description="Nội dung tháng này đang được soạn."
                icon="edit"
                size="compact"
                title="Chưa có buổi học"
                tone="success"
              />
            ) : (
              <View className="px-md">
                {lessonsInPhase.map((lesson, index) => (
                  <LessonRow
                    key={lesson.id}
                    enrolled={insights.enrolled}
                    insight={insights.lessons[lesson.id]}
                    isLast={index === lessonsInPhase.length - 1 && !activePhase?.capstone}
                    lesson={lesson}
                    lessonLabel={subject.lessonLabel}
                    status={subject.progress[lesson.id]}
                    today={insights.today}
                    onPress={() =>
                      insights.lessons[lesson.id]?.state === 'locked'
                        ? showToast('info', `Hoàn thành ${unit} trước để mở ${unit} này.`)
                        : openLesson(lesson.id)
                    }
                  />
                ))}
                {activePhase?.capstone ? (
                  <CapstoneRow
                    capstone={activePhase.capstone}
                    ready={insights.phases[activePhase.id]?.state === 'done'}
                  />
                ) : null}
              </View>
            )}
          </ScrollView>
          <EnrollSheet
            subject={subject}
            visible={enrollVisible}
            onClose={() => setEnrollVisible(false)}
          />
        </>
      )}
    </Screen>
  );
}
