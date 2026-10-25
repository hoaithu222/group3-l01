import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Button } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';

import type { BoardDetail } from '../../api/boards.types';
import { usePutColumns } from '../../queries/boards.queries';
import {
  draftsDiffer,
  toDrafts,
  toInputs,
  validateDrafts,
  type ColumnDraft,
  type ColumnLimits,
} from '../../utils/columns-draft';
import { getErrorCode, getErrorDetails } from '../../utils/error-details';
import { ColumnsEditor } from '../ColumnsEditor';

/**
 * Câu báo cho lỗi lưu cột. `TASK_007 { columnId, taskCount }` kèm TÊN cột và số
 * thẻ + gợi ý chuyển thẻ (`app.md` §4 "Settings cột"); các mã khác dùng câu đã
 * dịch trong `ERROR_CODE_MESSAGES`.
 */
export function describeColumnsError(
  error: unknown,
  board: Pick<BoardDetail, 'columns'>,
): string | null {
  if (!error) return null;
  if (getErrorCode(error) === 'TASK_007') {
    const details = getErrorDetails(error);
    const title = board.columns.find((column) => column.id === details?.columnId)?.title;
    const count = typeof details?.taskCount === 'number' ? details.taskCount : null;
    return `Cột${title ? ` "${title}"` : ''} còn ${count ?? 'một số'} thẻ. Hãy chuyển thẻ sang cột khác trước khi xoá cột.`;
  }
  if (getErrorCode(error) === 'RES_003') {
    return 'Bảng đã được người khác thay đổi. Đã tải lại phiên bản mới — kiểm tra rồi bấm Lưu lần nữa.';
  }
  return toErrorMessage(error);
}

/** Cột của bảng: sửa bằng `ColumnsEditor`, lưu bằng `PUT /boards/:id/columns` kèm `expectedVersion`. */
export function BoardColumnsSection({
  board,
  limits,
  onConflict,
}: {
  board: BoardDetail;
  limits: ColumnLimits;
  onConflict: () => void;
}) {
  const [drafts, setDrafts] = useState<ColumnDraft[]>(() => toDrafts(board.columns));
  const [clientError, setClientError] = useState<string | null>(null);
  const putColumns = usePutColumns(board.id);

  const save = () => {
    const problem = validateDrafts(drafts, limits);
    setClientError(problem);
    if (problem) return;
    putColumns.mutate(
      { columns: toInputs(drafts), expectedVersion: board.version },
      {
        onError: (error) => getErrorCode(error) === 'RES_003' && onConflict(),
        onSuccess: (dto) => setDrafts(toDrafts(dto.columns)),
      },
    );
  };

  return (
    <Section icon="chart-1" title="Cột">
      <View className="gap-sm">
        <ColumnsEditor
          drafts={drafts}
          error={clientError ?? describeColumnsError(putColumns.error, board)}
          limits={limits}
          onChange={setDrafts}
        />
        <Button
          disabled={!draftsDiffer(drafts, board.columns)}
          label="Lưu cột"
          loading={putColumns.isPending}
          onPress={save}
        />
      </View>
    </Section>
  );
}
