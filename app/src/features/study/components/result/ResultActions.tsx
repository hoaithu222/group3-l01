import { router } from 'expo-router';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { mockHistoryHref, mockSetupHref, srReviewHref } from '../../utils/study-routes';

/**
 * Các lối đi tiếp SAU khi xem điểm, dạng hàng có mũi tên (hành động CHÍNH duy nhất — "Xem lại đáp án" — nằm ở thanh đáy của
 * màn): ôn các câu sai (bản sắc `sr`), thi lại (bản sắc `mock`), lịch sử của bộ. "Thi lại" chỉ hiện khi thanh đáy đang là
 * "Xem lại đáp án" (`showRetake`) — lượt không có câu để xem lại thì "Thi lại" đã là nút chính, không lặp hai chỗ.
 */
export function ResultActions({ setId, showRetake }: { setId: string; showRetake: boolean }) {
  const arrow = <Icon color="fg-2" name="arrow-right-small" size="sm" />;
  return (
    <Card>
      <ListItem
        divider
        emphasis="title"
        label="Ôn các câu sai"
        leading={
          <IconTile name={STUDY_MODE_META.sr.icon} size="sm" tone={STUDY_MODE_META.sr.tone} />
        }
        trailing={arrow}
        onPress={() => router.push(srReviewHref(setId))}
      />
      {showRetake ? (
        <ListItem
          divider
          emphasis="title"
          label="Thi lại"
          leading={
            <IconTile name={STUDY_MODE_META.mock.icon} size="sm" tone={STUDY_MODE_META.mock.tone} />
          }
          trailing={arrow}
          onPress={() => router.replace(mockSetupHref(setId))}
        />
      ) : null}
      <ListItem
        emphasis="title"
        label="Lịch sử thi của bộ này"
        leading={<IconTile name="history" size="sm" tone="neutral" />}
        trailing={arrow}
        onPress={() => router.push(mockHistoryHref(setId))}
      />
    </Card>
  );
}
