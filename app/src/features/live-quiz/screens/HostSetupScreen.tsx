import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';
import { hapticTap } from '@/shared/utils/haptics';

import { MotionView } from '../components/MotionView';
import { SetupStepperRow } from '../components/SetupStepperRow';
import { SetupSummary } from '../components/SetupSummary';
import { LIVE_QUIZ_ICON, LIVE_QUIZ_TONE } from '../constants/live-quiz-visuals';
import { useCreateLiveQuiz } from '../queries/live-quiz.queries';
import { sessionHref } from '../utils/live-quiz-routes';
import { quizErrorMessage } from '../utils/quiz-errors';

/** Giới hạn khớp `LIMITS.liveQuiz` của BE (secondsPerQuestion 5–120); BE vẫn là nơi chặn cuối. */
const SECONDS = { max: 120, min: 5 } as const;
const COUNT = { max: 50, min: 1 } as const;

function newIdempotencyKey(): string {
  return `live-quiz-create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Cấu hình + tạo phiên từ một bộ học (app.md p5-01 §3 `Host setup`). `setId` đến qua route param từ màn tổng quan bộ
 * học — ⛔ không import feature `study`. Bố cục cùng khuôn các màn thiết lập khác: dải đầu tông cam → nhóm "Nội dung & thời gian"
 * (hai hàng số) → nhóm "Tuỳ chọn" (hai công tắc) → thời lượng tối thiểu của phiên; nút "Tạo phòng thi" là hành động chính
 * duy nhất. Bộ không đủ câu trắc nghiệm ⇒ `QUIZ_006` hiện thành hộp lỗi ngay dưới các nhóm.
 */
export function HostSetupScreen() {
  const { setId, workspaceId } = useLocalSearchParams<{ setId?: string; workspaceId?: string }>();
  const [count, setCount] = useState(10);
  const [seconds, setSeconds] = useState(20);
  const [shuffle, setShuffle] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(false);
  // Một khoá cho MỘT lần bấm: bấm lại sau lỗi dùng khoá mới (payload có thể đã đổi).
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const create = useCreateLiveQuiz();

  if (!setId) {
    return (
      <Screen header={<AppBar title="Tổ chức thi" onBack={router.back} />}>
        <EmptyState
          description="Mở một bộ học có câu trắc nghiệm rồi chọn “Tổ chức thi trực tiếp”."
          icon="book"
          title="Chưa chọn bộ câu hỏi"
          tone={LIVE_QUIZ_TONE}
        />
      </Screen>
    );
  }

  function submit(): void {
    if (!setId) return;
    // Rung nhẹ xác nhận hành động chính (cùng nhịp `Light` với cú chọn đáp án ở `useQuizAnswer`) — TRƯỚC `mutate`, tạo phòng mất một nhịp.
    hapticTap();
    create.mutate(
      {
        idempotencyKey,
        payload: { autoAdvance, count, secondsPerQuestion: seconds, setId, shuffle, workspaceId },
      },
      {
        onError: () => setIdempotencyKey(newIdempotencyKey()),
        onSuccess: (result) => router.replace(sessionHref(result.session.id)),
      },
    );
  }

  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button
            fullWidth
            iconLeft="play"
            label="Tạo phòng thi"
            loading={create.isPending}
            size="lg"
            variant="warning"
            onPress={submit}
          />
        </BottomActionBar>
      }
      header={<AppBar title="Tổ chức thi trực tiếp" onBack={router.back} />}
    >
      <View className="gap-xl py-md">
        <MotionView>
          <ModuleBanner
            description="Chọn số câu và thời gian mỗi câu, rồi tạo phòng để lấy mã PIN chia sẻ cho người chơi."
            icon={LIVE_QUIZ_ICON}
            title="Thiết lập phòng thi"
            tone={LIVE_QUIZ_TONE}
          />
        </MotionView>
        <MotionView index={1}>
          <Section title="Nội dung và thời gian">
            <Card className="gap-0" padded={false}>
              <SetupStepperRow
                accessibilityLabel="Số câu hỏi"
                hint={`Từ ${String(COUNT.min)} đến ${String(COUNT.max)} câu`}
                icon="book"
                max={COUNT.max}
                min={COUNT.min}
                title="Số câu hỏi"
                tone="info"
                value={count}
                onChange={setCount}
              />
              <Divider />
              <SetupStepperRow
                accessibilityLabel="Giây mỗi câu"
                hint={`Từ ${String(SECONDS.min)} đến ${String(SECONDS.max)} giây`}
                icon="timer"
                max={SECONDS.max}
                min={SECONDS.min}
                step={5}
                title="Giây mỗi câu"
                tone="warning"
                value={seconds}
                onChange={setSeconds}
              />
            </Card>
          </Section>
        </MotionView>
        <MotionView index={2}>
          <Section title="Tuỳ chọn">
            <Card>
              <Toggle label="Xáo trộn câu hỏi" value={shuffle} onChange={setShuffle} />
              <Toggle
                description="Hết giờ sẽ tự công bố đáp án và sang câu tiếp"
                label="Tự chuyển câu"
                value={autoAdvance}
                onChange={setAutoAdvance}
              />
            </Card>
          </Section>
        </MotionView>
        <MotionView index={3}>
          <SetupSummary count={count} seconds={seconds} />
        </MotionView>
        {create.isError ? (
          <Alert
            description={quizErrorMessage(create.error, 'Không tạo được phòng thi, thử lại sau')}
            tone="error"
          />
        ) : null}
      </View>
    </Screen>
  );
}
