import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';
import { showToast } from '@/shared/utils/toast.utils';

import { ChoiceTileRow } from '../components/mock/ChoiceTileRow';
import { ResumeAttemptDialog } from '../components/mock/ResumeAttemptDialog';
import { SetupSummary } from '../components/mock/SetupSummary';
import { TopicPicker } from '../components/mock/TopicPicker';
import { lightTap } from '../components/visual/light-tap';
import { useCreateMockAttempt } from '../queries/mock-attempts.queries';
import { useStudyItems } from '../queries/study-items.queries';
import { useStudySet } from '../queries/study-sets.queries';
import { getErrorCode, getErrorDetails, studyErrorMessage } from '../utils/error-info';
import { newLocalId } from '../utils/local-id';
import {
  buildCreatePayload,
  effectiveCount,
  MOCK_COUNTS,
  MOCK_MINUTES,
  paceSeconds,
  poolSize,
  topicCounts,
} from '../utils/mock-setup-utils';
import { mockAttemptHref } from '../utils/study-routes';

/**
 * Cấu hình thi thử (app.md p4-02 §3 `MockSetup`): "Đề của bạn" (tóm tắt cập nhật ngay), số câu và thời lượng chọn bằng ô
 * lớn, công tắc trộn câu, và (nếu bộ có thẻ chủ đề) chọn chủ đề; nút "Bắt đầu" là hành động chính duy nhất ở thanh đáy.
 * Ngưỡng đạt để BE dùng mặc định. Số câu có sẵn / chủ đề lấy từ mục của bộ (`useStudyItems` — thường đã có trong cache
 * vì màn tổng quan tải trước); không tải được thì các phần đó ẩn đi, việc bắt đầu KHÔNG bị chặn (BE quyết: `MOCK_001`).
 */
export function MockSetupScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const set = useStudySet(setId);
  const items = useStudyItems(setId);
  const create = useCreateMockAttempt(setId);
  const [count, setCount] = useState<(typeof MOCK_COUNTS)[number]>(20);
  const [minutes, setMinutes] = useState<(typeof MOCK_MINUTES)[number]>(20);
  const [shuffle, setShuffle] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  /** `MOCK_002` → id lượt đang dở, mở `ResumeAttemptDialog`. */
  const [pendingId, setPendingId] = useState<string | null>(null);

  const itemList = items.data?.items;
  const topics = useMemo(() => (itemList ? topicCounts(itemList) : []), [itemList]);
  const pool = itemList ? poolSize(itemList, tags) : null;
  const questions = effectiveCount(count, pool);

  function start(): void {
    // Rung nhẹ xác nhận hành động chính (cùng `lightTap` của "Học thẻ"/"Ôn ngay") — TRƯỚC `mutate`, vì tạo đề có thể mất một nhịp.
    lightTap();
    create.mutate(
      {
        idempotencyKey: newLocalId('mock-create'),
        payload: buildCreatePayload({ count, minutes, shuffle, tags }),
      },
      {
        onError: (error) => {
          const code = getErrorCode(error);
          const pending = getErrorDetails(error)?.attemptId;
          if (code === 'MOCK_002' && typeof pending === 'string') {
            setPendingId(pending);
          } else if (code === 'MOCK_001') {
            showToast('error', 'Bộ học chưa có câu trắc nghiệm.');
          } else {
            showToast('error', studyErrorMessage(error));
          }
        },
        onSuccess: (created) => router.replace(mockAttemptHref(created.attempt.id)),
      },
    );
  }

  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button
            fullWidth
            iconRight="arrow-right-small"
            label="Bắt đầu"
            loading={create.isPending}
            variant="info"
            onPress={start}
          />
        </BottomActionBar>
      }
      header={<AppBar title="Thi thử" onBack={() => router.back()} />}
    >
      <View className="gap-xl py-md">
        <SetupSummary
          count={questions}
          minutes={minutes}
          pace={paceSeconds(minutes, questions)}
          pool={pool}
          requested={count}
          setTitle={set.data?.title ?? 'Bộ học'}
          shuffle={shuffle}
          topicCount={tags.length}
        />
        {pool === 0 ? (
          <Alert
            description="Bộ học chưa có câu trắc nghiệm, Đúng/Sai hay điền nào để thi thử. Thêm câu vào bộ rồi quay lại."
            tone="warning"
          />
        ) : null}
        {/* Icon nhỏ trước mỗi tiêu đề nhóm = mốc để mắt quét nhanh màn thiết lập dài (3–4 nhóm); trang trí, nghĩa nằm ở chữ. */}
        <Section icon="contact-list" title="Số câu">
          <ChoiceTileRow
            label="Số câu"
            options={MOCK_COUNTS}
            unit="câu"
            value={count}
            onChange={setCount}
          />
        </Section>
        <Section icon="timer" title="Thời lượng">
          <ChoiceTileRow
            label="Thời lượng"
            options={MOCK_MINUTES}
            unit="phút"
            value={minutes}
            onChange={setMinutes}
          />
        </Section>
        <Section icon="setting" title="Tuỳ chọn">
          <Card>
            <Toggle
              description="Thứ tự câu hỏi và các đáp án đổi ngẫu nhiên mỗi lượt."
              label="Trộn câu hỏi và đáp án"
              value={shuffle}
              onChange={setShuffle}
            />
          </Card>
        </Section>
        {topics.length > 0 ? (
          <Section icon="filter" title="Chủ đề (tuỳ chọn)">
            <TopicPicker selected={tags} topics={topics} onChange={setTags} />
          </Section>
        ) : null}
      </View>
      <ResumeAttemptDialog
        visible={pendingId !== null}
        onClose={() => setPendingId(null)}
        onResume={() => {
          if (pendingId) router.replace(mockAttemptHref(pendingId));
          setPendingId(null);
        }}
      />
    </Screen>
  );
}
