import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import type { MockInProgressDto } from '../../api/mock-attempts.types';
import { useAnswerAutosave } from '../../hooks/useAnswerAutosave';
import { useAttemptAppStateEvents } from '../../hooks/useAttemptAppStateEvents';
import { useMockKeepAwake } from '../../hooks/useMockKeepAwake';
import { useMockSubmit } from '../../hooks/useMockSubmit';
import { useMockPlayerStore } from '../../store/mock-player.store';
import { isAnswered, mergeAnswers } from '../../utils/mock-player-utils';
import { PlayerBanners, type MockEndedReason } from './PlayerBanners';
import { PlayerDialogs } from './PlayerDialogs';
import { PlayerHud } from './PlayerHud';
import { PlayerNav } from './PlayerNav';
import { PlayerProgress } from './PlayerProgress';
import { QuestionNavGrid } from './QuestionNavGrid';
import { QuestionTransition } from './QuestionTransition';
import { QuestionView } from './QuestionView';

/**
 * Màn làm bài đang chạy (app.md p4-02 §3 `MockTestPlayer`). Nguồn sự thật của đáp án là `mock-player.store` (bền): chọn đáp
 * án → ghi store NGAY → `useAnswerAutosave` gửi theo lô. Đồng hồ (vòng + mm:ss + chữ cảnh báo) và tiến độ "đã trả lời n/tổng"
 * nằm ở header (không cuộn đi mất) cùng nút Nộp/Thoát; Trước/Sau ở THANH ĐÁY dính (câu dài không đẩy nút chuyển câu ra khỏi
 * màn). Nút "Nộp bài" luôn ở góc phải thanh tiêu đề, MỘT chỗ duy nhất.
 * ⚠️ Rời màn phải qua hộp thoại xác nhận (cả nút Back phần cứng): bài thi vẫn tính giờ khi thoát.
 * Tablet (`useBreakpoint`): hai cột — câu bên trái, tiến độ + lưới câu cố định bên phải; điện thoại: lưới mở bằng thanh tiến độ.
 */
export function MockPlayer({ view }: { view: MockInProgressDto }) {
  const { attempt, questions } = view;
  const id = attempt.id;
  const entry = useMockPlayerStore((state) => state.attempts[id]);
  const { isTablet } = useBreakpoint();
  const offline = useConnectionState() === 'offline';
  const [ended, setEnded] = useState<MockEndedReason | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  const saver = useAnswerAutosave(id, (code) =>
    setEnded(code === 'MOCK_004' ? 'submitted' : 'expired'),
  );
  const submit = useMockSubmit(id, saver);
  const { run } = submit;
  useAttemptAppStateEvents(id, ended === null);
  useMockKeepAwake(ended === null);

  const answers = useMemo(() => mergeAnswers(view.myAnswers, entry), [view.myAnswers, entry]);
  const answered = useMemo(
    () =>
      new Set(
        Object.values(answers)
          .filter(isAnswered)
          .map((a) => a.itemId),
      ),
    [answers],
  );
  const pending = useMemo(() => new Set(entry?.pending ?? []), [entry?.pending]);
  const flagged = useMemo(() => new Set(entry?.flagged ?? []), [entry?.flagged]);
  const index = Math.max(0, Math.min(entry?.currentIndex ?? 0, questions.length - 1));
  const question = questions[index];
  const unanswered = questions.length - answered.size;
  const locked = ended !== null || submit.isPending;

  const go = (next: number) => useMockPlayerStore.getState().setIndex(id, next);
  const expire = useCallback(() => setEnded((prev) => prev ?? 'expired'), []);

  // Hết giờ / BE báo `MOCK_003|004` ⇒ nộp (server vẫn là bên quyết định). `run` chống chạy trùng.
  useEffect(() => {
    if (ended) void run();
  }, [ended, run]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setExiting(true);
      return true;
    });
    return () => sub.remove();
  }, []);

  const grid = (
    <QuestionNavGrid
      answered={answered}
      current={index}
      flagged={flagged}
      pending={pending}
      questions={questions}
      onSelect={(i) => {
        go(i);
        setShowGrid(false);
      }}
    />
  );

  return (
    <Screen
      constrained={false}
      footer={
        <BottomActionBar contentClassName="tablet:max-w-none">
          <PlayerNav index={index} total={questions.length} onGo={go} />
        </BottomActionBar>
      }
      header={
        <View>
          <AppBar
            actions={
              <Button
                disabled={ended !== null}
                label="Nộp bài"
                loading={submit.isPending}
                size="sm"
                variant="secondary"
                onPress={() => setConfirming(true)}
              />
            }
            title="Thi thử"
            onBack={() => setExiting(true)}
          />
          <PlayerHud
            answered={answered.size}
            durationSec={attempt.durationSec}
            expanded={showGrid}
            expiresAt={attempt.expiresAt}
            serverNow={view.serverNow}
            showProgress={!isTablet}
            total={questions.length}
            onExpire={expire}
            onToggleGrid={() => setShowGrid((v) => !v)}
          />
        </View>
      }
    >
      <View className="gap-md py-md tablet:flex-row">
        <View className="gap-md tablet:flex-1">
          <PlayerBanners
            ended={ended}
            offline={offline}
            pendingCount={pending.size}
            submitFailed={submit.failed}
            onRetry={() => void run()}
          />
          {!isTablet && showGrid ? grid : null}
          {question ? (
            <QuestionTransition index={index}>
              <QuestionView
                answer={answers[question.itemId]}
                disabled={locked}
                flagged={flagged.has(question.itemId)}
                question={question}
                total={questions.length}
                onChange={saver.queue}
                onFlag={() => useMockPlayerStore.getState().toggleFlag(id, question.itemId)}
              />
            </QuestionTransition>
          ) : null}
        </View>
        {isTablet ? (
          <View className="gap-sm tablet:w-1/3">
            <PlayerProgress answered={answered.size} total={questions.length} />
            {grid}
          </View>
        ) : null}
      </View>
      <PlayerDialogs
        confirming={confirming}
        exiting={exiting}
        flaggedCount={flagged.size}
        submitting={submit.isPending}
        unanswered={unanswered}
        onCloseConfirm={() => setConfirming(false)}
        onCloseExit={() => setExiting(false)}
        onLeave={() => router.back()}
        onSubmit={() => {
          setConfirming(false);
          void run();
        }}
      />
    </Screen>
  );
}
