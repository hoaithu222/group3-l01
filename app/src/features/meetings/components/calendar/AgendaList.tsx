import { useEffect, useRef } from 'react';
import { SectionList, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { useListRefreshControl } from '@/shared/ui/screen';
import { cn } from '@/shared/utils/style/cn';

import type { MeetingListItemDto } from '../../api/meetings.types';
import { dayHeading, toDayKey } from '../../utils/meeting-time.utils';
import { MeetingCard } from '../card/MeetingCard';

export interface AgendaGroup {
  dayKey: string;
  items: MeetingListItemDto[];
}

export interface AgendaListProps {
  groups: AgendaGroup[];
  onJoin: (item: MeetingListItemDto) => void;
  onPress: (item: MeetingListItemDto) => void;
  onRefresh: () => void;
  refreshing: boolean;
  /** Cuộn tới nhóm ngày này (ngày đang chọn ở dải tuần / lưới tháng). */
  scrollToDayKey: string;
}

type Section = { data: MeetingListItemDto[]; dayKey: string };

/**
 * Danh sách theo NGÀY (agenda): header ngày dính, `MeetingCard` bên dưới. Chọn ngày ở dải tuần ⇒ cuộn tới nhóm ngày đó (hoặc nhóm
 * kế tiếp có họp nếu ngày đó trống). Kéo để làm mới. Dùng `SectionList` gốc — header dính là tính năng có sẵn, khỏi tự dựng.
 */
export function AgendaList({
  groups,
  onJoin,
  onPress,
  onRefresh,
  refreshing,
  scrollToDayKey,
}: AgendaListProps) {
  const ref = useRef<SectionList<MeetingListItemDto, Section>>(null);
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({ onRefresh, refreshing });
  const sections: Section[] = groups.map((g) => ({ data: g.items, dayKey: g.dayKey }));

  useEffect(() => {
    const index = groups.findIndex((g) => g.dayKey >= scrollToDayKey);
    if (index < 0) return;
    // Sau khi bố cục xong mới cuộn được — `setTimeout 0` nhường một nhịp cho SectionList đo.
    const timer = setTimeout(() => {
      ref.current?.scrollToLocation({
        animated: true,
        itemIndex: 0,
        sectionIndex: index,
        viewOffset: 0,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [scrollToDayKey, groups]);

  return (
    <SectionList<MeetingListItemDto, Section>
      ref={ref}
      contentContainerStyle={{ paddingBottom: 24 }}
      keyExtractor={(item) => item.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <MeetingCard item={item} onJoin={onJoin} onPress={onPress} />}
      renderSectionHeader={({ section }) => {
        // Nhóm HÔM NAY tô màu thương hiệu: agenda cuộn dài cả tháng, mắt cần một mốc để biết đâu là hôm nay. `new Date()` đọc
        // lúc SectionList gọi hàm vẽ (không phải trong thân component) nên React Compiler không ghi nhớ nó.
        const isToday = section.dayKey === toDayKey(new Date());
        return (
          // `py-sm`: tiêu đề → thẻ đầu 12 (`gap-sm` của lưới); thẻ cuối nhóm (`mb-sm`) + 12 ở đây = 24 giữa hai nhóm ngày.
          // Icon lịch là mốc nhìn cho từng nhóm ngày (hôm nay: lịch có dấu sao, màu thương hiệu) — trang trí, nghĩa nằm ở chữ.
          <View className="flex-row items-center gap-xs bg-bg-base px-md py-sm">
            <Icon
              color={isToday ? 'fg-brand' : 'fg-2'}
              name={isToday ? 'calendar-favorite' : 'calendar'}
              size={16}
              variant="twotone"
            />
            <Text
              accessibilityRole="header"
              className={cn(
                'flex-1 text-label-md font-semibold',
                isToday ? 'text-fg-brand' : 'text-fg-2',
              )}
            >
              {dayHeading(section.dayKey)}
            </Text>
          </View>
        );
      }}
      sections={sections}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled
      onScrollToIndexFailed={() => undefined}
    />
  );
}
