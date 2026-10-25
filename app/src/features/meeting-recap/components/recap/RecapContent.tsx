import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';
import { formatDate, formatTime } from '@/shared/utils/format/date.utils';

import type { RecapDto } from '../../api/meeting-recap.types';
import { RecapAttachments } from './RecapAttachments';
import { RecapStatusBanner } from './RecapStatusBanner';
import { RecapView } from './RecapView';

/** "25/09/2026 · 09:00 – 10:15" — thiếu một đầu thì chỉ hiện đầu có. */
function actualTime(recap: RecapDto): string | null {
  if (!recap.startedAt && !recap.endedAt) return null;
  const day = formatDate(recap.startedAt ?? recap.endedAt);
  const range = [formatTime(recap.startedAt), formatTime(recap.endedAt)].filter(Boolean).join(' – ');
  return `${day} · ${range}`;
}

/**
 * Thân màn XEM biên bản: dải trạng thái (chỉ người sửa — người xem luôn thấy bản đã công bố), giờ họp thực tế (ô đồng hồ + nhãn), nội
 * dung markdown-lite trong thẻ có tiêu đề, tệp đính kèm (chạm để mở qua URL ký). Không có nút — nút ở `BottomActionBar` của màn.
 * Khe 24 giữa các khối (`gap-xl`, lưới của `screen-layout.md`); tiêu đề nhóm có icon để quét nhanh biên bản dài.
 */
export function RecapContent({ recap }: { recap: RecapDto }) {
  const time = actualTime(recap);
  const editor = recap.myActions.canEdit || recap.myActions.canPublish;

  return (
    <View className="gap-xl py-xs">
      {editor ? <RecapStatusBanner recap={recap} /> : null}
      {time ? (
        <View accessibilityLabel={`Giờ họp thực tế: ${time}`} accessible className="flex-row items-center gap-sm">
          <IconTile name="clock" size="md" tone="info" />
          <View className="flex-1 gap-3xs">
            <Text className="text-caption-lg text-fg-2">Giờ họp thực tế</Text>
            <Text className="text-label-lg font-semibold text-fg-1">{time}</Text>
          </View>
        </View>
      ) : null}
      <Section icon="document" title="Nội dung biên bản">
        <Card>
          {recap.content.trim() === '' ? (
            <Text className="text-body-md italic text-fg-2">Biên bản chưa có nội dung — xem tệp đính kèm.</Text>
          ) : (
            <RecapView source={recap.content} />
          )}
        </Card>
      </Section>
      <RecapAttachments attachments={recap.attachments} />
    </View>
  );
}
