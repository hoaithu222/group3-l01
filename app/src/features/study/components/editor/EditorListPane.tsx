import { useMemo } from 'react';
import { View } from 'react-native';

import type { StudyItemType } from '../../api/study.types';
import type { EditorDraft } from '../../utils/editor-draft';
import { countNeedsFix, summarizeDraft } from '../../utils/editor-summary';
import type { ItemProblem } from '../../utils/item-validation';
import type { ItemErrors } from '../../utils/map-bulk-errors';
import { EditorEmptyState } from './EditorEmptyState';
import { EditorSummaryBar } from './EditorSummaryBar';
import { ItemListPanel } from './ItemListPanel';

export interface EditorListPaneProps {
  draft: EditorDraft;
  problems: Readonly<Record<string, ItemProblem[]>>;
  selectedKey?: string;
  serverErrors: Readonly<Record<string, ItemErrors>>;
  /** Mở tấm chọn dạng mục ("Thêm thủ công"). */
  onAdd: () => void;
  /** Mở tấm "Nhập từ CSV". */
  onImport: () => void;
  onMove: (key: string, direction: 'down' | 'up') => void;
  /** Thêm luôn một mục dạng `type` (hàng "Bắt đầu nhanh" của trạng thái rỗng). */
  onQuickAdd: (type: StudyItemType) => void;
  onSelect: (key: string) => void;
}

/**
 * Cột danh sách của trình soạn: thanh tóm tắt ("12 mục · 3 dạng", số mục cần sửa, "Nhập CSV") + danh sách mục; bộ rỗng thì
 * thay bằng `EditorEmptyState` (hai lối vào + thêm nhanh theo dạng). Nút "Thêm mục" nằm ở thanh dưới (`UnsavedBar`) — trong
 * tầm ngón cái, và luôn thấy dù danh sách dài tới đâu.
 */
export function EditorListPane({
  draft,
  onAdd,
  onImport,
  onMove,
  onQuickAdd,
  onSelect,
  problems,
  selectedKey,
  serverErrors,
}: EditorListPaneProps) {
  const summary = useMemo(
    () => summarizeDraft(draft.items, draft.order),
    [draft.items, draft.order],
  );
  const needsFix = useMemo(
    () => countNeedsFix(draft.order, problems, serverErrors),
    [draft.order, problems, serverErrors],
  );

  return (
    <View className="flex-1">
      {draft.order.length === 0 ? (
        <EditorEmptyState onAdd={onAdd} onImport={onImport} onQuickAdd={onQuickAdd} />
      ) : (
        <>
          <EditorSummaryBar needsFix={needsFix} summary={summary} onImport={onImport} />
          <ItemListPanel
            draft={draft}
            problems={problems}
            selectedKey={selectedKey}
            serverErrors={serverErrors}
            onMove={onMove}
            onSelect={onSelect}
          />
        </>
      )}
    </View>
  );
}
