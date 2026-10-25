import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

import {
  addDraft,
  moveDraft,
  removeDraft,
  updateDraft,
  type ColumnDraft,
  type ColumnLimits,
} from '../utils/columns-draft';
import { ColumnEditorRow } from './ColumnEditorRow';

export interface ColumnsEditorProps {
  disabled?: boolean;
  drafts: readonly ColumnDraft[];
  /** Lỗi hiện phía trên danh sách (kiểm client hoặc `TASK_007/008` từ BE). */
  error?: string | null;
  limits: ColumnLimits;
  onChange: (drafts: ColumnDraft[]) => void;
}

/**
 * Sửa danh sách cột: đổi tên, đổi loại, đặt giới hạn WIP, Lên/Xuống, thêm, xoá
 * (`app.md` §2 `ColumnsEditor`). Dùng cho cả "Tuỳ chỉnh" khi tạo bảng và màn Cài
 * đặt; kiểm hợp lệ (2–12 cột, đúng một DONE) ở `validateDrafts`, BE kiểm lại.
 *
 * ⚠️ Xoá cột còn thẻ / đổi loại cột đang có thẻ do BE từ chối (`TASK_007`,
 * `TASK_008`) — màn gọi hiện thông điệp đó qua `error`; client không đoán số thẻ.
 */
export function ColumnsEditor({ disabled = false, drafts, error, limits, onChange }: ColumnsEditorProps) {
  return (
    <View className="gap-sm">
      {error ? <Alert description={error} tone="error" /> : null}

      {drafts.map((draft, index) => (
        <ColumnEditorRow
          key={draft.key}
          canMoveDown={index < drafts.length - 1}
          canMoveUp={index > 0}
          disabled={disabled}
          draft={draft}
          index={index}
          titleMax={limits.columnTitleMax}
          onChange={(patch) => onChange(updateDraft(drafts, draft.key, patch))}
          onMove={(direction) => onChange(moveDraft(drafts, draft.key, direction))}
          onRemove={() => onChange(removeDraft(drafts, draft.key))}
        />
      ))}

      <Button
        disabled={disabled || drafts.length >= limits.columnsMax}
        iconLeft="add"
        label="Thêm cột"
        variant="secondary"
        onPress={() => onChange(addDraft(drafts))}
      />
    </View>
  );
}
