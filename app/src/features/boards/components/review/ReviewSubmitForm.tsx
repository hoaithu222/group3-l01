import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';

import type { useReviewSubmitForm } from '../../hooks/useReviewSubmitForm';
import { SCORE10_MAX } from '../../utils/review-score';
import { scoreProblemText } from '../../utils/review-text';
import { ReviewDecisionPicker } from './ReviewDecisionPicker';
import { ReviewTotalBar } from './ReviewTotalBar';
import { RubricScoreInput } from './RubricScoreInput';

export interface ReviewSubmitFormProps {
  feedbackMax: number;
  form: ReturnType<typeof useReviewSubmitForm>;
}

/**
 * Thân form chấm (p4-05 app.md §3 `ReviewSubmit`): quyết định · điểm (theo tiêu chí, hoặc MỘT ô 0–10 khi bảng không dùng tiêu chí) ·
 * tổng · nhận xét. Lỗi hiện Ở ĐÚNG Ô sau lần bấm Gửi đầu tiên (không mắng từ lúc mới mở): tiêu chí thiếu/ngoài khoảng, nhận xét trống
 * khi Yêu cầu sửa. Nhận xét là ô UNCONTROLLED (`defaultValue`) — IME-safe: ghi đè `value` giữa lúc bộ gõ Telex đang ghép dấu làm
 * mất dấu trên Android.
 *
 * Người chấm KHÔNG thấy kết quả người khác trước khi tự nộp — màn này không có dữ liệu đó (BE che, `review-visibility`).
 */
export function ReviewSubmitForm({ feedbackMax, form }: ReviewSubmitFormProps) {
  const { attempted, draft, edit, feedbackMissing, mine, problems, rubric } = form;
  const disabled = form.isSubmitting;
  const errorAt = (key: string, max: number): string | undefined => {
    const problem = problems[key];
    return problem && (attempted || form.error?.code === 'REVIEW_002') ? scoreProblemText(problem, max) : undefined;
  };
  const setScore = (id: string, value: number) => edit({ score: { ...draft.score, scores: { ...draft.score.scores, [id]: value } } });

  return (
    <View className="gap-xl">
      {form.error ? <Alert description={form.error.message} tone={form.error.code === 'RES_003' ? 'warning' : 'error'} /> : null}
      {form.offline ? <Alert description="Kết nối lại mạng để gửi kết quả chấm. Nháp của bạn vẫn được giữ." tone="warning" /> : null}

      <Section icon="checkmark-circle" title="Quyết định">
        <ReviewDecisionPicker disabled={disabled} value={form.decision} onChange={(decision) => edit({ decision })} />
        {attempted && form.decision === null ? (
          <Alert description="Chọn Duyệt hoặc Yêu cầu sửa trước khi gửi." tone="warning" />
        ) : null}
      </Section>

      <Section icon="star" title={rubric.length > 0 ? 'Điểm theo tiêu chí' : 'Điểm'}>
        <Card>
          <View className="gap-lg">
            {rubric.length > 0 ? (
              rubric.map((criterion) => (
                <RubricScoreInput
                  key={criterion.id}
                  description={criterion.description}
                  disabled={disabled}
                  error={errorAt(criterion.id, criterion.maxScore)}
                  label={criterion.label}
                  max={criterion.maxScore}
                  value={draft.score.scores[criterion.id] ?? null}
                  onChange={(value) => setScore(criterion.id, value)}
                />
              ))
            ) : (
              <RubricScoreInput
                description="Bảng không dùng tiêu chí — cho điểm chung từ 0 đến 10."
                disabled={disabled}
                error={errorAt('score10', SCORE10_MAX)}
                label="Điểm"
                max={SCORE10_MAX}
                value={draft.score.free}
                onChange={(value) => edit({ score: { ...draft.score, free: value } })}
              />
            )}
            <ReviewTotalBar freeScore={rubric.length === 0} preview={form.preview} />
          </View>
        </Card>
      </Section>

      <Section icon="chat-bubble" title="Nhận xét">
        <Input
          key={mine?.id}
          accessibilityLabel="Nhận xét"
          defaultValue={draft.feedback}
          disabled={disabled}
          hint={`${draft.feedback.length}/${feedbackMax}`}
          maxLength={feedbackMax}
          message={attempted && feedbackMissing ? 'Vui lòng ghi nhận xét khi yêu cầu sửa' : undefined}
          messageTone="error"
          multiline
          placeholder={form.decision === 'REQUEST_CHANGES' ? 'Nêu rõ cần sửa gì cho người làm thẻ' : 'Nhận xét cho người làm thẻ (không bắt buộc)'}
          required={form.decision === 'REQUEST_CHANGES'}
          onChangeText={(feedback) => edit({ feedback })}
        />
      </Section>
    </View>
  );
}
