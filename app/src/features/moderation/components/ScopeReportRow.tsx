import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { ReportTargetType, ScopeReportItem } from '../api/moderation.types';
import {
  REPORT_REASON_LABEL,
  REPORT_TARGET_LABEL,
  RESOLUTION_LABEL,
} from '../constants/moderation.constants';
import { cleanExcerpt } from '../utils/excerpt';

export interface ScopeReportRowProps {
  item: ScopeReportItem;
  onPress: (item: ScopeReportItem) => void;
}

/**
 * Ô icon theo LOẠI ĐÍCH — mắt quét ra ngay đây là báo cáo tin, người, kênh hay nhóm chat mà chưa cần đọc chữ. Tông xoay vòng để phân
 * biệt (không mang nghĩa nghiêm trọng); ⛔ không `danger` — hàng báo cáo không phải thao tác phá huỷ.
 */
const TARGET_ART: Record<ReportTargetType, { icon: IconName; tone: IconTileTone }> = {
  MESSAGE: { icon: 'chat-bubble', tone: 'brand' },
  USER: { icon: 'user', tone: 'info' },
  CHANNEL: { icon: 'chat-bubble', tone: 'accent' },
  CONVERSATION: { icon: 'add-team', tone: 'success' },
};

/**
 * Một NHÓM báo cáo cùng đích (app.md p1-08 §2 `ScopeReportRow`): loại đích + nơi xảy ra, số báo cáo, các
 * lý do, thời điểm mới nhất, và — CHỈ khi BE trả `preview` (người xem đọc được phạm vi) — trích đoạn tin.
 * Không có `preview` thì hiện đúng metadata, ⛔ không tự bịa "nội dung" và không lộ người báo cáo.
 *
 * Số báo cáo là huy hiệu `warning` (cần xem xét), kết quả xử lý là huy hiệu CHỮ (`success` đã gỡ/cảnh cáo, `neutral` không cần xử lý).
 */
export function ScopeReportRow({ item, onPress }: ScopeReportRowProps) {
  const target = REPORT_TARGET_LABEL[item.targetType];
  const title = item.scope?.name ? `${target} · ${item.scope.name}` : target;
  const reasons = item.reasons.map((reason) => REPORT_REASON_LABEL[reason]).join(', ');
  const countLabel = `${String(item.reportCount)} báo cáo`;
  const art = TARGET_ART[item.targetType];

  return (
    <Pressable
      accessibilityLabel={`${title}, ${countLabel}, ${reasons}`}
      accessibilityRole="button"
      className="flex-row items-start gap-sm border-b border-divider-1 px-md py-sm active:opacity-70"
      onPress={() => onPress(item)}
    >
      <IconTile name={art.icon} tone={art.tone} />
      <View className="flex-1 gap-3xs">
        <View className="flex-row items-center justify-between gap-sm">
          <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {title}
          </Text>
          <Badge label={countLabel} size="sm" variant="warning" />
        </View>

        {item.preview ? (
          <Text className="text-body-md text-fg-2" numberOfLines={2}>
            {item.preview.deleted
              ? 'Tin nhắn đã bị gỡ'
              : `${item.preview.authorName ? `${item.preview.authorName}: ` : ''}${cleanExcerpt(item.preview.excerpt)}`}
          </Text>
        ) : null}

        <Text className="text-caption-sm text-fg-2">
          {reasons} · {formatRelative(item.latestAt)}
        </Text>
        {item.resolution ? (
          <View className="flex-row">
            <Badge
              label={RESOLUTION_LABEL[item.resolution]}
              size="sm"
              variant={item.resolution === 'NO_ACTION' ? 'neutral' : 'success'}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
