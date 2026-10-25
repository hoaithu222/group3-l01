import { FlashList } from '@shopify/flash-list';
import { useMemo } from 'react';

import type { EditorDraft } from '../../utils/editor-draft';
import { changedItems, itemDetail, itemMediaFlags, rowBadges } from '../../utils/editor-row';
import type { ItemProblem } from '../../utils/item-validation';
import type { ItemErrors } from '../../utils/map-bulk-errors';
import { ItemRow } from './ItemRow';

export interface ItemListPanelProps {
  draft: EditorDraft;
  problems: Readonly<Record<string, ItemProblem[]>>;
  serverErrors: Readonly<Record<string, ItemErrors>>;
  selectedKey?: string;
  onSelect: (key: string) => void;
  onMove: (key: string, direction: 'down' | 'up') => void;
}

/**
 * Danh sách mục thu gọn của trình soạn (app.md p4-01 §2 `ItemListPanel`) — `FlashList` vì bộ có thể tới 500 mục (README §10:
 * "form chỉ render mục đang mở"). Mỗi hàng tự mô tả (dạng, câu hỏi, đáp án, huy hiệu) qua `ItemRow`; nhãn "Mới"/"Đã sửa" so nháp
 * với bản gốc (`changedItems`, tính lại MỖI lần nháp đổi — O(số mục), cùng bậc với `computeDiff` mà `useSetEditor` đã chạy).
 */
export function ItemListPanel({
  draft,
  onMove,
  onSelect,
  problems,
  selectedKey,
  serverErrors,
}: ItemListPanelProps) {
  const changes = useMemo(() => changedItems(draft), [draft]);
  const { items, order } = draft;

  return (
    <FlashList
      data={order}
      extraData={{ changes, items, problems, selectedKey, serverErrors }}
      keyExtractor={(key) => key}
      renderItem={({ index, item: key }) => {
        const item = items[key];
        if (!item) return null;
        return (
          <ItemRow
            badges={rowBadges({
              change: changes[key],
              problems: problems[key] ?? [],
              serverError: key in serverErrors,
            })}
            detail={itemDetail(item)}
            index={index}
            item={item}
            last={index === order.length - 1}
            media={itemMediaFlags(item)}
            selected={key === selectedKey}
            onMove={onMove}
            onSelect={onSelect}
          />
        );
      }}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    />
  );
}
