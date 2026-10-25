import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';
import { useFeature } from '@/shell/capabilities';

import { STUDY_MODE_META } from '../constants/study-modes.constants';
import { flashcardsHref, mockHistoryHref, mockSetupHref, quizHref } from '../utils/study-routes';
import { LiveQuizEntryRow } from './LiveQuizEntryRow';
import { EnterView } from './visual/EnterView';
import { lightTap } from './visual/light-tap';
import { StudyModeTile } from './visual/StudyModeTile';

export interface SetStudyActionsProps {
  enrolling: boolean;
  /** Bộ có ít nhất một câu chấm được tự động (`hasQuiz` của server) — không có thì ẩn ô "Quiz nhanh" (chỉ thẻ ghi nhớ thì không có gì để chấm). */
  hasQuiz: boolean;
  setId: string;
  onStartSr: () => void;
}

/**
 * Ô của lưới "Luyện tập": `grow basis-[45%]` ⇒ hai ô một hàng ở mọi cỡ, ô lẻ cuối (5 ô khi có cả Quiz nhanh + cờ `live-quiz`) giãn hết hàng.
 * Class chứ không phải hook: kéo chia đôi màn hình không vẽ lại cả lưới.
 */
const PRACTICE_CELL = 'grow basis-[45%]';

/**
 * Các cách học một bộ có mục (app.md p4-01 §3, p4-02 §3). MỘT hành động chính — nút "Học thẻ" (mang icon của chế độ `flashcards`, rung nhẹ
 * khi bấm); các cách luyện tập còn lại là khối "Luyện tập" dạng Ô có `IconTile` theo `STUDY_MODE_META` — ôn theo lịch (SM-2), Quiz nhanh (chỉ khi bộ có câu chấm được), thi thử, lịch sử
 * thi, thi đấu trực tiếp — thay cho danh sách hàng chữ (mọi ô cùng độ nổi, đều THẤP hơn nút chính). "Lịch sử thi thử" mang tông của chế độ Thi
 * thử vì nó là lối riêng của chế độ đó; "Tổ chức thi trực tiếp" (khi cờ `live-quiz` bật) mang tông của chế độ Thi đấu trực tiếp.
 *
 * ⚠️ "Ôn theo lịch" đăng ký cả bộ vào SM-2 nên có trạng thái bận (`enrolling`): ô khoá + đổi mô tả thành "Đang đăng ký ôn…" để bấm hai lần không
 * đăng ký hai lượt (`mobile-ux.md` — khoá nút khi đang gửi).
 */
export function SetStudyActions({ enrolling, hasQuiz, onStartSr, setId }: SetStudyActionsProps) {
  const liveQuiz = useFeature('live-quiz') === true;

  return (
    <View className="gap-md">
      <EnterView index={1}>
        <Button
          fullWidth
          iconLeft={STUDY_MODE_META.flashcards.icon}
          label={STUDY_MODE_META.flashcards.label}
          size="lg"
          onPress={() => {
            lightTap();
            router.push(flashcardsHref(setId));
          }}
        />
      </EnterView>
      <Section title="Luyện tập">
        <View className="flex-row flex-wrap gap-sm">
          <EnterView className={PRACTICE_CELL} index={2}>
            <StudyModeTile
              busy={enrolling}
              description={enrolling ? 'Đang đăng ký ôn…' : undefined}
              mode="sr"
              onPress={onStartSr}
            />
          </EnterView>
          {hasQuiz ? (
            <EnterView className={PRACTICE_CELL} index={3}>
              <StudyModeTile mode="quick" onPress={() => router.push(quizHref(setId))} />
            </EnterView>
          ) : null}
          <EnterView className={PRACTICE_CELL} index={4}>
            <StudyModeTile mode="mock" onPress={() => router.push(mockSetupHref(setId))} />
          </EnterView>
          <EnterView className={PRACTICE_CELL} index={5}>
            <StudyModeTile
              description="Xem lại các lượt thi trước"
              icon="history"
              mode="mock"
              title="Lịch sử thi thử"
              onPress={() => router.push(mockHistoryHref(setId))}
            />
          </EnterView>
          {liveQuiz ? (
            <EnterView className={PRACTICE_CELL} index={6}>
              <LiveQuizEntryRow setId={setId} />
            </EnterView>
          ) : null}
        </View>
      </Section>
    </View>
  );
}
