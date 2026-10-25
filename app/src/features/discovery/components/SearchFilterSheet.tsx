import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { LinkButton } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { DatePicker } from '@/shared/ui/date-picker';
import { Section } from '@/shared/ui/section';
import { Select } from '@/shared/ui/select';
import { Toggle } from '@/shared/ui/toggle';

import type { DiscoveryScope } from '../api/discovery.types';
import {
  EMPTY_FILTERS,
  FILE_FILTER_LABEL,
  FILE_FILTER_OPTIONS,
  hasDateRange,
  type SearchFilters,
} from '../utils/search-params';
import { SearchAuthorList } from './SearchAuthorList';

export interface SearchFilterSheetProps {
  filters: SearchFilters;
  scope: Pick<DiscoveryScope, 'scopeId' | 'scopeType'>;
  visible: boolean;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}

/**
 * Bộ lọc tìm (app.md p1-09 §2 `SearchFilterSheet`): người gửi · khoảng ngày · có tệp/loại tệp · gồm reply luồng (chỉ kênh).
 * Sửa trên BẢN NHÁP, chỉ "Áp dụng" mới đổi bộ lọc thật — gõ dở một lựa chọn không kích hoạt lượt tìm nào (mỗi lượt tốn
 * hạn mức 30 lần/phút). Bản nháp đồng bộ lại từ bộ lọc hiện hành mỗi lần tờ MỞ (điều chỉnh state ngay trong lúc vẽ —
 * mẫu chuẩn của React thay cho effect gọi `setState`).
 *
 * ✅ Bốn trường cùng MỘT khuôn nhãn (16 semibold): "Người gửi" là `Select` (ô chọn như ô ngày ngay dưới, thay cho hàng
 * nhãn–giá trị xám), "Tệp đính kèm" là `Section tone="default"`. Hàng nút đáy là `SheetActions` [Đặt lại | Áp dụng].
 */
export function SearchFilterSheet({
  filters,
  scope,
  visible,
  onApply,
  onClose,
}: SearchFilterSheetProps) {
  const [draft, setDraft] = useState(filters);
  const [view, setView] = useState<'author' | 'main'>('main');
  const [wasVisible, setWasVisible] = useState(visible);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(filters);
      setView('main');
    }
  }

  const apply = () => {
    onApply(draft);
    onClose();
  };

  const isAuthorView = view === 'author';

  return (
    <BottomSheet
      footer={
        isAuthorView ? undefined : (
          <SheetActions
            primary={{ label: 'Áp dụng', onPress: apply }}
            secondary={{ label: 'Đặt lại', onPress: () => setDraft(EMPTY_FILTERS) }}
          />
        )
      }
      scrollable
      title={isAuthorView ? 'Người gửi' : 'Bộ lọc tìm kiếm'}
      visible={visible}
      onClose={onClose}
    >
      {isAuthorView ? (
        <View className="gap-sm">
          {/* Mũi tên là icon thật (`arrow-left-small`) thay cho ký tự "‹" gõ tay — cùng nét với bộ icon, trình đọc màn hình không xướng "‹". */}
          <LinkButton
            iconLeft="arrow-left-small"
            label="Quay lại bộ lọc"
            size="sm"
            onPress={() => setView('main')}
          />
          <SearchAuthorList
            scope={scope}
            selectedId={draft.author?.id}
            onSelect={(member) => {
              setDraft((d) => ({
                ...d,
                author: member ? { id: member.userId, name: member.name } : null,
              }));
              setView('main');
            }}
          />
        </View>
      ) : (
        <View className="gap-md">
          <Select
            label="Người gửi"
            value={draft.author?.name ?? 'Tất cả người gửi'}
            onPress={() => setView('author')}
          />

          <View className="gap-xs">
            <DatePicker
              label="Khoảng thời gian"
              mode="range"
              placeholder="Chọn khoảng ngày"
              value={draft.range}
              onChange={(range) => setDraft((d) => ({ ...d, range }))}
            />
            {hasDateRange(draft) ? (
              <LinkButton
                label="Xoá khoảng ngày"
                size="sm"
                onPress={() => setDraft((d) => ({ ...d, range: { start: null, end: null } }))}
              />
            ) : null}
          </View>

          <Section title="Tệp đính kèm" tone="default">
            <View
              accessibilityLabel="Tệp đính kèm"
              accessibilityRole="radiogroup"
              className="flex-row flex-wrap gap-xs"
            >
              <Chip
                label="Tất cả"
                role="radio"
                selected={draft.file === null}
                size="sm"
                onPress={() => setDraft((d) => ({ ...d, file: null }))}
              />
              {FILE_FILTER_OPTIONS.map((option) => (
                <Chip
                  key={option}
                  label={FILE_FILTER_LABEL[option]}
                  role="radio"
                  selected={draft.file === option}
                  size="sm"
                  onPress={() => setDraft((d) => ({ ...d, file: option }))}
                />
              ))}
            </View>
          </Section>

          {scope.scopeType === 'CHANNEL' ? (
            <Toggle
              description="Tắt để chỉ tìm trong luồng chính của kênh."
              label="Gồm tin trả lời trong luồng"
              value={draft.includeThreads}
              onChange={(includeThreads) => setDraft((d) => ({ ...d, includeThreads }))}
            />
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}
