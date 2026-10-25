import { Text, View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Badge } from '@/shared/ui/badge';
import { Chip } from '@/shared/ui/chip';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import type { StudyItemDto } from '../../api/study.types';
import { useFlashcardSession } from '../../hooks/useFlashcardSession';
import { progressText } from '../../utils/flashcard-session';
import { backText, cardMedia, frontLines } from '../../utils/item-summary';
import { StudyAudioButton } from '../StudyAudioButton';
import { StudyTtsButton } from '../StudyTtsButton';
import { FlashcardControls } from './FlashcardControls';
import { FlashcardDeck } from './FlashcardDeck';
import { FlashcardFlipper } from './FlashcardFlipper';
import { FlashcardSummary } from './FlashcardSummary';
import { cardStatus, passedPercent } from './study-progress';
import { StudyProgressHeader } from './StudyProgressHeader';
import { useDeckSwipe } from './useDeckSwipe';

export interface FlashcardSessionProps {
  items: readonly StudyItemDto[];
  /** Ngôn ngữ của bộ học (`StudySet.language`) — "en" bật nút đọc bằng giọng máy khi mục chưa có âm thanh thật. */
  language?: string | null;
  onBack: () => void;
  title: string;
}

/**
 * Một phiên Học thẻ (app.md p4-01 §3): đầu phiên (tiến độ + Xáo trộn) → bộ bài (thẻ lật 3D, vuốt phải = "Đã thuộc", vuốt trái =
 * "Chưa thuộc", thẻ kế lấp ló) → số "đã thuộc/chưa thuộc" + âm thanh + nút chấm/Trước/Sau → tóm tắt. Chạy hoàn toàn TRÊN MÁY từ
 * cache `items` (không ghi server — SR thật là p4-02): mất mạng vẫn học được nếu bộ đã tải. Mọi loại mục đều lật được.
 *
 * ── Bố cục ───────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Đầu phiên luôn trên cùng (thấp ~48dp). Dọc: thẻ → nút. NGANG (`landscape:`): thẻ bên trái, cột nút bên phải (1/3) — chiều cao còn
 * ~290dp không đủ xếp chồng mà vẫn chừa chỗ cho thẻ. Số "đã thuộc/chưa thuộc" nằm CẠNH nút chấm (nơi mắt đang nhìn khi bấm) thay vì ở
 * đầu phiên. `constrained` (trần 720dp `max-w-content` của `Screen`) tắt khi nằm ngang: hai cột cần cả bề rộng.
 * ⚠️ Hành vi ĐỔI so với bản Fling: vuốt giờ CHẤM thẻ (trước đây vuốt trái/phải chỉ chuyển thẻ); duyệt không chấm dùng "Trước/Sau".
 *
 * Nút loa NẰM NGOÀI thẻ: thẻ là một nút trợ năng (con bên trong bị gộp, TalkBack không tới được) và vùng vuốt/lật không được nuốt
 * cú chạm vào nút. `key` theo thẻ: sang thẻ khác là trình phát mới (thẻ cũ dừng), không phát lẫn.
 */
export function FlashcardSession({ items, language, onBack, title }: FlashcardSessionProps) {
  const session = useFlashcardSession(items);
  const { isLandscape } = useBreakpoint();
  const { state } = session;
  const card = session.card;
  const swipe = useDeckSwipe({ cardKey: card?.id ?? 'end', onDecide: session.markKnown });
  const header = <AppBar title={title} onBack={onBack} />;

  if (session.finished) {
    return (
      <Screen header={header}>
        <FlashcardSummary
          known={state.known.length}
          total={session.total}
          unknown={state.unknown.length}
          onBack={onBack}
          onRestart={() => session.restartAll(false)}
          onRetryUnknown={session.retryUnknown}
        />
      </Screen>
    );
  }

  return (
    <Screen constrained={!isLandscape} header={header} scrollable={false}>
      <View className="flex-1 gap-sm py-md landscape:gap-xs landscape:py-xs">
        <StudyProgressHeader
          counter={progressText(state)}
          mode="flashcards"
          percent={passedPercent(state.index, session.total)}
          trailing={
            <Chip
              label="Xáo trộn"
              role="checkbox"
              selected={state.shuffled}
              size="sm"
              onPress={() => session.restartAll(!state.shuffled)}
            />
          }
        />
        <View className="flex-1 gap-sm landscape:flex-row landscape:gap-md">
          <View className="flex-1">
            {card ? (
              <FlashcardDeck
                cardKey={card.id}
                remaining={session.total - state.index - 1}
                swipe={swipe}
              >
                <FlashcardFlipper
                  backText={backText(card)}
                  explanation={card.explanation}
                  flipped={state.flipped}
                  frontLines={frontLines(card)}
                  frontText={card.prompt}
                  media={cardMedia(card)}
                  position={progressText(state)}
                  status={cardStatus(card.id, state.known, state.unknown)}
                  onFlip={session.flip}
                />
              </FlashcardDeck>
            ) : null}
            <Text className="text-center text-caption-sm text-fg-2 landscape:hidden">
              Chạm thẻ để lật · Vuốt phải: đã thuộc · Vuốt trái: chưa thuộc
            </Text>
          </View>
          <View className="gap-sm landscape:w-1/3 landscape:justify-center">
            <View className="flex-row flex-wrap justify-center gap-xs">
              <Badge label={`${state.known.length} đã thuộc`} size="sm" variant="success" />
              <Badge label={`${state.unknown.length} chưa thuộc`} size="sm" variant="warning" />
            </View>
            {card?.audioAssetId ? (
              <View className="flex-row justify-center">
                <StudyAudioButton key={card.id} assetId={card.audioAssetId} label="Nghe phát âm" />
              </View>
            ) : card && language === 'en' ? (
              <View className="flex-row justify-center">
                <StudyTtsButton key={card.id} text={card.prompt} />
              </View>
            ) : null}
            <FlashcardControls
              canPrevious={state.index > 0}
              onKnown={() => swipe.dismiss('known')}
              onNext={session.next}
              onPrevious={session.previous}
              onUnknown={() => swipe.dismiss('unknown')}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}
