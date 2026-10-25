import { useState } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';

import type { SrDueItemDto, SrRating } from '../../api/sr.types';
import type { StudyItemDto } from '../../api/study.types';
import { SR_TITLE } from '../../constants/study.constants';
import { useSrReview, useSrSummary } from '../../queries/sr.queries';
import { getErrorCode, getHttpStatus, studyErrorMessage } from '../../utils/error-info';
import { backText, cardMedia, frontLines } from '../../utils/item-summary';
import { newLocalId } from '../../utils/local-id';
import { commitHaptic, tickHaptic } from '../flashcard/card-haptics';
import { FlashcardDeck } from '../flashcard/FlashcardDeck';
import { FlashcardFlipper } from '../flashcard/FlashcardFlipper';
import { cardCounter, passedPercent, type RatingStats } from '../flashcard/study-progress';
import { StudyProgressHeader } from '../flashcard/StudyProgressHeader';
import { RiseIn } from '../flashcard/RiseIn';
import { StudyAudioButton } from '../StudyAudioButton';
import { SrFeedbackButtons } from './SrFeedbackButtons';
import { SrSessionSummary } from './SrSessionSummary';

const NO_STATS: RatingStats = { AGAIN: 0, EASY: 0, GOOD: 0, HARD: 0 };

/** `backText`/`frontLines` nhận `StudyItemDto` — thẻ SR mang cùng trường nội dung, chỉ khác khoá (`itemId`). */
function asItem(card: SrDueItemDto): StudyItemDto {
  return { ...card, id: card.itemId, order: 0, updatedAt: card.nextReviewAt, version: 0 };
}

function notifyReviewError(error: unknown): void {
  const code = getErrorCode(error);
  if (code === 'SR_001' || getHttpStatus(error) === 404)
    showToast('info', 'Thẻ không còn khả dụng.');
  else if (code === 'SR_003') showToast('info', 'Đã đạt giới hạn số thẻ ôn hôm nay.');
  else showToast('error', studyErrorMessage(error));
}

export interface SrSessionProps {
  items: readonly SrDueItemDto[];
  onBack: () => void;
  /** "Ôn tiếp N thẻ" — nạp lại hàng đợi (màn cha refetch `due` và dựng phiên mới). */
  onContinue: () => void;
  remainingToday: number;
  setId?: string;
}

/**
 * Một phiên ôn (app.md p4-02 §3 `SrReview`): đầu phiên (tiến độ "8/24" + tên bộ của thẻ, tông xanh lá của chế độ) → bộ bài (thẻ lật 3D,
 * thẻ kế lấp ló, thẻ mới "trồi lên") → bốn ô đánh giá kèm khoảng ôn dự kiến (`sm2-preview`). Chấm XONG là sang thẻ kế NGAY — không
 * chờ mạng: lượt chấm chạy nền với `clientReviewId` cố định và tự gửi lại khi mất mạng (`useSrReview`). Hết thẻ → `SrSessionSummary`.
 *
 * Không vuốt để chấm (khác Học thẻ): có BỐN mức nên không có cử chỉ hai chiều nào thay được — chấm luôn bằng ô bấm. Bố cục giống
 * `FlashcardSession`: đầu phiên trên cùng, dưới là thẻ | cột nút (ngang: 2×2 trong cột 1/3). Thẻ cũ trượt ra (`FlashcardDeck`, `exiting`)
 * còn thẻ mới trồi lên. Nút loa NẰM NGOÀI thẻ (thẻ là một nút trợ năng) — `key` theo thẻ để thẻ cũ dừng.
 */
export function SrSession({ items, onBack, onContinue, remainingToday, setId }: SrSessionProps) {
  const review = useSrReview(notifyReviewError);
  const { isLandscape } = useBreakpoint();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState(NO_STATS);
  const card = items[index];
  const finished = card === undefined;
  const summary = useSrSummary(setId, finished);
  const position = cardCounter(index, items.length);
  const header = <AppBar title={SR_TITLE} onBack={onBack} />;

  const rate = (rating: SrRating) => {
    if (!card) return;
    commitHaptic();
    review.mutate({
      clientReviewId: newLocalId('srr'),
      itemId: card.itemId,
      rating,
      reviewedAt: new Date().toISOString(),
    });
    setStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    setFlipped(false);
    setIndex((i) => i + 1);
  };

  if (!card) {
    return (
      <Screen header={header}>
        <View className="py-md">
          <SrSessionSummary
            remainingToday={remainingToday}
            stats={stats}
            summary={summary.data}
            onContinue={onContinue}
            onDone={onBack}
          />
        </View>
      </Screen>
    );
  }

  const item = asItem(card);
  return (
    <Screen constrained={!isLandscape} header={header} scrollable={false}>
      <View className="flex-1 gap-sm py-md landscape:gap-xs landscape:py-xs">
        <StudyProgressHeader
          counter={position}
          mode="sr"
          percent={passedPercent(index, items.length)}
          subtitle={card.setTitle}
        />
        <View className="flex-1 gap-sm landscape:flex-row landscape:gap-md">
          <View className="flex-1">
            <FlashcardDeck cardKey={card.itemId} remaining={items.length - index - 1}>
              <FlashcardFlipper
                backText={backText(item)}
                explanation={card.explanation}
                flipped={flipped}
                frontLines={frontLines(item)}
                frontText={card.prompt}
                media={cardMedia(item)}
                mode="sr"
                position={position}
                onFlip={() => setFlipped((f) => !f)}
              />
            </FlashcardDeck>
          </View>
          <View className="gap-sm landscape:w-1/3 landscape:justify-center">
            {card.audioAssetId ? (
              <View className="flex-row justify-center">
                <StudyAudioButton key={card.itemId} assetId={card.audioAssetId} label="Nghe phát âm" />
              </View>
            ) : null}
            {flipped ? (
              <RiseIn>
                <SrFeedbackButtons
                  progress={{
                    easiness: card.easiness,
                    interval: card.interval,
                    repetition: card.repetition,
                  }}
                  onRate={rate}
                />
              </RiseIn>
            ) : (
              <Button
                fullWidth
                label="Hiện đáp án"
                variant="success"
                onPress={() => {
                  tickHaptic();
                  setFlipped(true);
                }}
              />
            )}
          </View>
        </View>
      </View>
    </Screen>
  );
}
