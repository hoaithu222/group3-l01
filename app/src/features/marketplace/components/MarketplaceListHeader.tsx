import { View } from 'react-native';

import { ModuleBanner } from '@/shared/ui/banner';
import { Chip } from '@/shared/ui/chip';
import { Icon, type IconName } from '@/shared/ui/icon';
import { Reveal } from '@/shared/ui/motion';
import { SearchInput, type UseSearchInputResult } from '@/shared/ui/search';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import type { ListingSort } from '../api/marketplace.types';
import { MARKETPLACE_TONE } from '../constants/marketplace.constants';

const CONTENT_TYPE_TABS = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'STUDY_SET', label: 'Bộ học' },
  { key: 'RESOURCE', label: 'Tài liệu' },
];

/** Icon chỉ bổ trợ — nhãn chữ vẫn là thứ nói "sắp xếp theo gì" (`flash` = "đang được mua nhiều", gần nhất trong bộ icon). */
const SORT_OPTIONS: { icon: IconName; key: ListingSort; label: string }[] = [
  { icon: 'clock', key: 'new', label: 'Mới nhất' },
  { icon: 'flash', key: 'popular', label: 'Phổ biến' },
  { icon: 'money', key: 'price', label: 'Giá thấp' },
];

export interface MarketplaceListHeaderProps {
  contentType: string;
  searchProps: UseSearchInputResult['inputProps'];
  sort: ListingSort;
  onContentTypeChange: (key: string) => void;
  onSortChange: (sort: ListingSort) => void;
}

/**
 * Đầu danh sách chợ (`ListHeaderComponent`): dải đầu phân hệ · ô tìm · tab loại nội dung · chip sắp xếp.
 *
 * ✅ Dải đầu nói điều thanh tiêu đề chưa nói — nhãn "Nội dung do người dùng tạo" (app.md §7) và "xu không quy đổi ra tiền" — nên không
 * lặp chữ "Chợ tài liệu" của `AppBar`. ⛔ Ô tìm/tab/chip KHÔNG bọc `Reveal`: thứ người dùng thao tác phải bấm được ngay.
 * Sắp xếp là CHIP một-lựa-chọn (`role="radio"` trong `radiogroup`) thay cho hàng tab thứ hai: hai hàng tab chồng nhau đọc như hai cấp điều hướng.
 */
export function MarketplaceListHeader({
  contentType,
  onContentTypeChange,
  onSortChange,
  searchProps,
  sort,
}: MarketplaceListHeaderProps) {
  return (
    <View className="gap-md pb-sm">
      <Reveal>
        <ModuleBanner
          description="Nội dung do người dùng tạo và chia sẻ, mua bằng xu. Xu không quy đổi ra tiền."
          icon="fn/mua-sam"
          title="Tài liệu từ cộng đồng"
          tone={MARKETPLACE_TONE}
        />
      </Reveal>
      <SearchInput {...searchProps} placeholder="Tìm bộ học, tài liệu…" />
      <Tabs
        items={CONTENT_TYPE_TABS}
        value={contentType}
        variant="pill"
        onChange={(key) => {
          if (key !== contentType) hapticSelection();
          onContentTypeChange(key);
        }}
      />
      <View
        accessibilityLabel="Sắp xếp"
        accessibilityRole="radiogroup"
        className="flex-row flex-wrap gap-xs"
      >
        {SORT_OPTIONS.map((option) => {
          const selected = option.key === sort;
          return (
            <Chip
              key={option.key}
              label={option.label}
              leading={<Icon color={selected ? 'fg-brand' : 'fg-2'} name={option.icon} size="sm" />}
              role="radio"
              selected={selected}
              size="sm"
              onPress={() => {
                if (!selected) hapticSelection();
                onSortChange(option.key);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
