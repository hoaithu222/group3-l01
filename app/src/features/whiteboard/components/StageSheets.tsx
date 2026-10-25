import { Dialog } from '@/shared/ui/modal';

import type { WhiteboardDetail } from '../api/whiteboard.types';
import type { useBoardMenu } from '../hooks/useBoardMenu';
import type { WhiteboardActions } from '../hooks/useWhiteboardActions';
import { useWhiteboardUiStore } from '../store/whiteboard-ui.store';
import { RenameWhiteboardSheet } from './RenameWhiteboardSheet';
import { SaveSnapshotSheet } from './SaveSnapshotSheet';
import { StylePanel } from './StylePanel';
import { TextEditSheet } from './TextEditSheet';

export interface StageSheetsProps {
  actions: WhiteboardActions;
  board: WhiteboardDetail;
  /** Chữ hiện có của phần tử đang sửa (rỗng khi tạo mới). */
  editingText: string;
  menu: ReturnType<typeof useBoardMenu>;
}

/**
 * Mọi tấm/hộp thoại của màn vẽ (kiểu vẽ, soạn chữ, đổi tên, lưu phiên bản, xác nhận lưu trữ) — tách khỏi `WhiteboardStage` để màn giữ dưới 200 dòng.
 * Kiểu vẽ áp cho lần vẽ TIẾP THEO (store) và cho phần tử đang chọn (`actions.applyStyle`); tấm soạn chữ đọc đích từ store (`textEdit`) — đóng tấm
 * KHÔNG ghi gì, chỉ "Xong" mới ghi (chữ trống khi tạo mới thì không tạo phần tử).
 */
export function StageSheets({ actions, board, editingText, menu }: StageSheetsProps) {
  const style = useWhiteboardUiStore((state) => state.style);
  const setStyle = useWhiteboardUiStore((state) => state.setStyle);
  const selectionCount = useWhiteboardUiStore((state) => state.selection.length);
  const textEdit = useWhiteboardUiStore((state) => state.textEdit);
  const setTextEdit = useWhiteboardUiStore((state) => state.setTextEdit);
  const editKind = textEdit?.mode === 'create' ? textEdit.type : 'text';

  return (
    <>
      <StylePanel
        hasSelection={selectionCount > 0}
        style={style}
        visible={menu.style.visible}
        onChange={(patch) => {
          setStyle(patch);
          if (selectionCount > 0) actions.applyStyle(patch);
        }}
        onClose={menu.style.close}
      />
      <TextEditSheet
        kind={editKind}
        text={editingText}
        visible={textEdit !== null}
        onClose={() => setTextEdit(null)}
        onSubmit={(text) => textEdit && actions.commitText(textEdit, text)}
      />
      <RenameWhiteboardSheet board={board} visible={menu.rename.visible} onClose={menu.rename.close} />
      <SaveSnapshotSheet visible={menu.version.visible} wbId={board.id} onClose={menu.version.close} />
      <Dialog
        description={`"${board.name}" sẽ chuyển sang chế độ chỉ xem cho mọi người. Bạn có thể khôi phục lại sau.`}
        primaryAction={{ label: 'Lưu trữ', loading: menu.archive.pending, onPress: menu.archive.confirm }}
        secondaryAction={{
          disabled: menu.archive.pending,
          label: 'Huỷ',
          onPress: menu.archive.dialog.close,
        }}
        title="Lưu trữ bảng trắng?"
        visible={menu.archive.dialog.visible}
        onClose={menu.archive.dialog.close}
      />
    </>
  );
}
