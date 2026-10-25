import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { LinkButton } from '@/shared/ui/button';
import { DatePicker } from '@/shared/ui/date-picker';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { Toggle } from '@/shared/ui/toggle';

import type { WorkspaceSearchType } from '../api';
import { scopeFilterLabel } from '../utils/filter-labels';
import { EMPTY_FILTERS, hasDateRange, type SearchFilters } from '../utils/search-params';
import { SearchAuthorPicker } from './SearchAuthorPicker';
import { SearchScopePicker } from './SearchScopePicker';

type SheetView = 'author' | 'main' | 'scope';
type Scope = NonNullable<SearchFilters['scope']>;

export interface SearchFilterSheetProps {
  filters: SearchFilters;
  /** Khách: không có danh sách thành viên (BE 404) và không tìm được tin 1-1 → ẩn hai bộ lọc đó. */
  isGuest: boolean;
  /** Tab đang mở — `hasFile` chỉ có nghĩa ở Tin nhắn. */
  type: WorkspaceSearchType;
  visible: boolean;
  workspaceId: string;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
  /** "Chỉ trong kênh này": chuyển sang màn tìm trong MỘT kênh/nhóm chat của p1-09. */
  onOpenScopeSearch: (scope: Scope) => void;
}

const VIEW_TITLE: Record<SheetView, string> = {
  author: 'Người gửi',
  main: 'Bộ lọc tìm kiếm',
  scope: 'Phạm vi tìm',
};

const ARROW = <Icon color="fg-2" name="arrow-right-small" size="sm" />;

/**
 * Bộ lọc tìm toàn nhóm (app.md p5-04 §2 `SearchFilterSheet`): người gửi · khoảng ngày · có tệp · gồm tin 1-1 · phạm vi
 * (kênh/nhóm chat). Sửa trên BẢN NHÁP, chỉ "Áp dụng" mới đổi bộ lọc thật — gõ dở một lựa chọn không kích hoạt lượt tìm nào
 * (mỗi lượt tốn hạn mức 30 lần/phút). Bản nháp đồng bộ lại từ bộ lọc hiện hành mỗi lần tờ MỞ (điều chỉnh state ngay trong
 * lúc vẽ, không dùng effect). Có phạm vi thì hiện "Chỉ trong kênh này" → màn tìm p1-09 của kênh/nhóm chat đó.
 */
export function SearchFilterSheet({
  filters,
  isGuest,
  type,
  visible,
  workspaceId,
  onApply,
  onClose,
  onOpenScopeSearch,
}: SearchFilterSheetProps) {
  const [draft, setDraft] = useState(filters);
  const [view, setView] = useState<SheetView>('main');
  const [wasVisible, setWasVisible] = useState(visible);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(filters);
      setView('main');
    }
  }

  const patch = (next: Partial<SearchFilters>) => setDraft((current) => ({ ...current, ...next }));
  const apply = () => {
    onApply(draft);
    onClose();
  };
  const isMain = view === 'main';
  const scope = draft.scope;

  return (
    <BottomSheet
      footer={
        isMain ? (
          /* ✅ `SheetActions` thay cho cặp `Button fullWidth` tự ghép trong `flex-row`: chia đôi bề ngang, PHỤ trái – CHÍNH phải,
             cùng dáng mọi tấm khác. ⛔ Đừng bọc thêm `px-md pt-sm` — vùng `footer` của `BottomSheet` đã có sẵn. */
          <SheetActions
            primary={{ label: 'Áp dụng', onPress: apply }}
            secondary={{ label: 'Đặt lại', onPress: () => setDraft(EMPTY_FILTERS) }}
          />
        ) : undefined
      }
      scrollable
      title={VIEW_TITLE[view]}
      visible={visible}
      onClose={onClose}
    >
      {isMain ? (
        <View className="gap-lg">
          {isGuest ? null : (
            <ListItem
              label="Người gửi"
              trailing={ARROW}
              value={draft.author?.name ?? 'Tất cả'}
              onPress={() => setView('author')}
            />
          )}

          <View className="gap-xs">
            <ListItem
              label="Phạm vi"
              trailing={ARROW}
              value={scope ? scopeFilterLabel(scope) : 'Toàn nhóm'}
              onPress={() => setView('scope')}
            />
            {scope ? (
              <LinkButton
                label={scope.type === 'CHANNEL' ? 'Chỉ trong kênh này' : 'Chỉ trong nhóm chat này'}
                size="sm"
                onPress={() => onOpenScopeSearch(scope)}
              />
            ) : null}
          </View>

          <View className="gap-xs">
            <DatePicker
              label="Khoảng thời gian"
              mode="range"
              placeholder="Chọn khoảng ngày"
              value={draft.range}
              onChange={(range) => patch({ range })}
            />
            {hasDateRange(draft) ? (
              <LinkButton
                label="Xoá khoảng ngày"
                size="sm"
                onPress={() => patch({ range: { start: null, end: null } })}
              />
            ) : null}
          </View>

          {type === 'messages' ? (
            <Toggle
              description="Chỉ hiện tin nhắn có ảnh, video hoặc tệp."
              label="Chỉ tin có tệp đính kèm"
              value={draft.hasFile}
              onChange={(hasFile) => patch({ hasFile })}
            />
          ) : null}

          {isGuest ? null : (
            <Toggle
              description="Tin nhắn 1-1 với người còn trong nhóm này."
              label="Gồm tin nhắn riêng"
              value={draft.includeDirect}
              onChange={(includeDirect) => patch({ includeDirect })}
            />
          )}
        </View>
      ) : (
        <View className="gap-sm">
          <LinkButton
            iconLeft="arrow-left-small"
            label="Quay lại bộ lọc"
            size="sm"
            onPress={() => setView('main')}
          />
          {view === 'author' ? (
            <SearchAuthorPicker
              selectedId={draft.author?.id}
              workspaceId={workspaceId}
              onSelect={(author) => {
                patch({ author: author ? { id: author.userId, name: author.name } : null });
                setView('main');
              }}
            />
          ) : (
            <SearchScopePicker
              selected={draft.scope}
              workspaceId={workspaceId}
              onSelect={(next) => {
                patch({ scope: next });
                setView('main');
              }}
            />
          )}
        </View>
      )}
    </BottomSheet>
  );
}
