import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import type { ThemeColorKey } from '@/shared/theme';
import { Card } from '@/shared/ui/card';
import { Icon, type IconName } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import type { MockResultQuestionDto } from '../../api/mock-attempts.types';
import { correctAnswerText, describeAnswer } from '../../utils/mock-result-utils';
import {
  optionLetter,
  optionReviewState,
  optionTag,
  reviewVerdict,
  VERDICT_LABEL,
  type OptionReviewState,
  type ReviewVerdict,
} from '../../utils/mock-review-utils';
import { StudyAssetImage } from '../StudyAssetImage';
import { ReviewOptionRow } from './ReviewOptionRow';

const pill = tv(
  {
    base: 'flex-row items-center gap-3xs rounded-full px-sm py-3xs',
    variants: {
      verdict: {
        correct: 'bg-surface-success',
        wrong: 'bg-surface-error',
        blank: 'bg-surface-neutral',
      },
    },
  },
  { twMergeConfig },
);

const VERDICT_ICON: Record<ReviewVerdict, { color: ThemeColorKey; name: IconName }> = {
  blank: { color: 'fg-2', name: 'minus' },
  correct: { color: 'success', name: 'checkmark-circle' },
  wrong: { color: 'error', name: 'clear-circle' },
};

/** Trạng thái dòng "Bạn trả lời" của câu điền: bỏ trống thì trơn (không đúng/sai gì để nhãn). */
function fillState(verdict: ReviewVerdict): OptionReviewState {
  if (verdict === 'correct') return 'picked-correct';
  return verdict === 'wrong' ? 'picked-wrong' : 'plain';
}

/**
 * Một câu ở màn xem lại (app.md p4-02 §3 `MockAnswerReview`): kết luận "Đúng"/"Sai"/"Bỏ trống" bằng CHỮ + icon (không chỉ
 * màu), rồi TỪNG đáp án với trạng thái riêng (`ReviewOptionRow`: bạn chọn đúng / bạn chọn sai / đáp án đúng bạn chưa chọn),
 * và khối "Giải thích" nếu có. Câu điền: dòng "Bạn trả lời" + dòng "Đáp án đúng".
 */
export function ReviewQuestionCard({ question: q }: { question: MockResultQuestionDto }) {
  const verdict = reviewVerdict(q);
  const icon = VERDICT_ICON[verdict];
  const fill = q.type === 'FILL_BLANK' || q.options.length === 0;
  const picked = new Set(q.myAnswer?.optionIds ?? []);
  const correct = new Set(q.correctOptionIds);
  const mine = q.myAnswer ? describeAnswer(q, q.myAnswer.optionIds, q.myAnswer.text) : '—';

  return (
    <View className="px-md py-2xs">
      <Card
        title={
          <View className="flex-row items-center justify-between gap-sm">
            <Text accessibilityRole="header" className="text-body-lg font-semibold text-fg-1">
              {`Câu ${q.index + 1}`}
            </Text>
            <View className={pill({ verdict })}>
              <Icon color={icon.color} name={icon.name} size={16} variant="solid" />
              <Text className="text-label-md font-semibold text-fg-1">
                {VERDICT_LABEL[verdict]}
              </Text>
            </View>
          </View>
        }
      >
        <View className="gap-sm">
          {/* Ảnh đề + ảnh từng đáp án: xem lại phải thấy ĐÚNG thứ đã thấy lúc làm bài (màn thi cũng vẽ chúng). */}
          {q.frontMediaAssetId ? (
            <StudyAssetImage alt="Ảnh của câu hỏi" assetId={q.frontMediaAssetId} />
          ) : null}
          <Text className="text-body-lg text-fg-1">{q.prompt}</Text>
          {fill ? (
            <View className="gap-xs">
              <ReviewOptionRow
                state={fillState(verdict)}
                tag={optionTag(fillState(verdict), 'fill')}
                text={verdict === 'blank' ? 'Chưa trả lời' : mine}
              />
              {verdict === 'correct' ? null : (
                <ReviewOptionRow
                  state="missed"
                  tag={optionTag('missed')}
                  text={correctAnswerText(q)}
                />
              )}
            </View>
          ) : (
            <View className="gap-xs">
              {q.options.map((o, i) => {
                const state = optionReviewState(picked.has(o.id), correct.has(o.id));
                return (
                  <ReviewOptionRow
                    key={o.id}
                    imageAssetId={o.mediaAssetId}
                    letter={optionLetter(i)}
                    state={state}
                    tag={optionTag(state)}
                    text={o.text}
                  />
                );
              })}
            </View>
          )}
          {q.explanation ? (
            <View className="flex-row gap-xs rounded-sm bg-surface-neutral p-sm">
              <Icon color="info" name="alert-information" size={20} />
              <View className="flex-1 gap-3xs">
                <Text className="text-label-md font-semibold text-fg-1">Giải thích</Text>
                <Text className="text-body-md text-fg-2">{q.explanation}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}
