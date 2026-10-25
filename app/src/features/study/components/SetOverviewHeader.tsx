import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { StudyItemDto, StudyItemType, StudySetDetailDto } from '../api/study.types';
import { ITEM_TYPE_META, VISIBILITY_META } from '../constants/study.constants';
import { EnterView } from './visual/EnterView';
import { SetCoverBanner } from './visual/SetCoverBanner';
import { StatPill } from './visual/StatPill';

export interface SetOverviewHeaderProps {
  /** Mục đã tải (nếu có) — để đếm theo loại; chưa có thì chỉ hiện tổng `itemCount`. */
  items?: readonly StudyItemDto[];
  set: StudySetDetailDto;
}

/** Cùng bảng màu icon phạm vi với `StudySetCard` — một phạm vi luôn cùng màu ở danh sách và ở đây. */
const VISIBILITY_INK = { PRIVATE: 'fg-2', PUBLIC: 'info', WORKSPACE: 'success' } as const;

function countByType(items: readonly StudyItemDto[]): [StudyItemType, number][] {
  const counts = new Map<StudyItemType, number>();
  items.forEach((item) => counts.set(item.type, (counts.get(item.type) ?? 0) + 1));
  return [...counts.entries()];
}

/**
 * Đầu màn tổng quan bộ (app.md p4-01 §3 `SetOverview`) dạng HERO: ảnh bìa (hoặc mảng màu suy từ tiêu đề) → tiêu đề → tác giả + ngày cập nhật
 * → mô tả → hàng viên số liệu (tổng số mục, phạm vi bằng icon + CHỮ, số mục THEO LOẠI khi đã tải mục) → thẻ #tag. Bộ bị ẩn (tác giả vẫn thấy)
 * có banner "Đã bị ẩn do vi phạm" kèm lý do nằm TRÊN cùng, ngoài thẻ hero — ST-19.
 *
 * ⚠️ Chỉ dữ liệu THẬT của API: số liệu là `itemCount` + đếm `items` đã tải; không có "lượt học", "tiến độ" hay "điểm" nào ở đây vì bộ học
 * chưa có nguồn số liệu đó. Tiêu đề xuất hiện đúng MỘT lần dưới dạng chữ (bìa là trang trí, ẩn khỏi trình đọc màn hình).
 */
export function SetOverviewHeader({ items, set }: SetOverviewHeaderProps) {
  const visibility = VISIBILITY_META[set.visibility];
  const types = items ? countByType(items) : [];

  return (
    <View className="gap-sm">
      {set.status === 'HIDDEN' ? (
        <Alert
          description={set.hiddenReason ?? 'Bộ học vi phạm quy định nên đã bị ẩn khỏi người khác.'}
          title="Đã bị ẩn do vi phạm"
          tone="warning"
        />
      ) : null}

      <EnterView>
        <View className="overflow-hidden rounded-md bg-bg-1">
          <SetCoverBanner
            assetId={set.coverAssetId}
            thumbUrl={set.coverThumbUrl}
            title={set.title}
          />
          <View className="gap-sm p-md">
            <Text accessibilityRole="header" className="text-header-md font-semibold text-fg-1">
              {set.title}
            </Text>
            <View className="flex-row items-center gap-xs">
              {set.owner ? <Avatar name={set.owner.name} size="xs" /> : null}
              <Text className="flex-1 text-caption-lg text-fg-2">
                {set.owner ? `${set.owner.name} · ` : ''}
                {`cập nhật ${formatDate(set.updatedAt)}`}
              </Text>
            </View>

            {set.description ? (
              <Text className="text-body-md text-fg-2">{set.description}</Text>
            ) : null}

            <View className="flex-row flex-wrap gap-xs">
              <StatPill icon="copy" label={`${set.itemCount} mục`} />
              <StatPill
                icon={visibility.icon}
                iconColor={VISIBILITY_INK[set.visibility]}
                label={visibility.label}
              />
              {types.map(([type, count]) => (
                <StatPill
                  key={type}
                  icon={ITEM_TYPE_META[type].icon}
                  label={`${ITEM_TYPE_META[type].label}: ${count}`}
                />
              ))}
            </View>

            {set.tags.length > 0 ? (
              <View className="flex-row flex-wrap gap-xs">
                {set.tags.map((tag) => (
                  <StatPill key={tag} label={`#${tag}`} tone="brand" />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </EnterView>
    </View>
  );
}
