import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatNumber } from '@/shared/utils/format/currency.utils';
import { cn } from '@/shared/utils/style/cn';

import type { QuizResultRowDto } from '../api/live-quiz.types';
import { HERO_SURFACE, LIVE_QUIZ_ICON, LIVE_QUIZ_TONE } from '../constants/live-quiz-visuals';
import { MotionView } from './MotionView';
import { RankMedal } from './RankMedal';

interface ResultsHeroProps {
  /** Số người chơi của phiên (số hàng kết quả). */
  players: number;
  /** Hàng kết quả của TÔI; không có (chủ phòng / không tham gia) ⇒ dải tổng kết chung. */
  mine?: QuizResultRowDto;
}

/**
 * Dải đầu màn kết quả: của người chơi là huy chương hạng + số điểm cỡ lớn + số câu đúng/độ chính xác; của chủ phòng (không có
 * hàng của mình) là "Kết quả phiên thi" + số người chơi. Nảy nhẹ vào lúc hiện (tắt khi "Giảm chuyển động"). Cả dải là MỘT ô trợ
 * năng đọc trọn ("Hạng 2 trên 8 người, 900 điểm, đúng 1 trên 3 câu đã trả lời").
 */
export function ResultsHero({ mine, players }: ResultsHeroProps) {
  const accuracy =
    mine && mine.answered > 0 ? Math.round((mine.correct / mine.answered) * 100) : null;
  const speech = mine
    ? `Kết quả của bạn: hạng ${String(mine.rank)} trên ${String(players)} người, ${formatNumber(mine.score)} điểm, đúng ${String(mine.correct)} trên ${String(mine.answered)} câu đã trả lời`
    : `Kết quả phiên thi, ${String(players)} người chơi`;

  return (
    <MotionView enter="zoom">
      <View
        accessibilityLabel={speech}
        accessible
        className={cn('items-center gap-xs rounded-md p-lg', HERO_SURFACE)}
      >
        {mine ? (
          <>
            <RankMedal rank={mine.rank} size="lg" />
            <Text className="text-label-lg text-fg-2">{`Hạng ${String(mine.rank)} / ${String(players)}`}</Text>
            <Text className="text-display font-bold text-fg-1">{formatNumber(mine.score)}</Text>
            <Text className="text-label-md text-fg-2">điểm</Text>
            <View className="mt-xs flex-row flex-wrap justify-center gap-xs">
              <Badge
                label={`Đúng ${String(mine.correct)}/${String(mine.answered)}`}
                variant="success"
              />
              {accuracy === null ? null : (
                <Badge label={`Chính xác ${String(accuracy)}%`} variant="warning" />
              )}
            </View>
          </>
        ) : (
          <>
            <IconTile name={LIVE_QUIZ_ICON} size="xl" tone={LIVE_QUIZ_TONE} />
            <Text className="text-header-sm font-semibold text-fg-1">Kết quả phiên thi</Text>
            <Text className="text-body-md text-fg-2">{`${String(players)} người chơi`}</Text>
          </>
        )}
      </View>
    </MotionView>
  );
}
