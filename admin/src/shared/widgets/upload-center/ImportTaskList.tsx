/**
 * ImportTaskList — danh sách thẻ tác vụ chạy dài của MỘT góc màn hình.
 *
 * Cũng như `UploadQueueCard`, thành phần này KHÔNG tự neo — `ProgressCenter`
 * lo chỗ đứng. Ở đây chỉ lọc theo góc, xếp mới nhất lên trên và cắt còn
 * `MAX_VISIBLE` thẻ: quá số đó thì rail cao quá nửa màn và che mất nội dung
 * người dùng đang làm việc.
 */

import { memo, useCallback, useEffect } from 'react';

import { Button } from '@/shared/ui';

import ProgressToast from './progress-toast';
import {
  useImportProgressStore,
  type ImportProgressPosition,
  type ImportProgressTask,
} from './import-progress.store';

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 10_000;

const STATUS_MAP = { processing: 'running', success: 'success', error: 'error' } as const;

interface ItemProps {
  task: ImportProgressTask;
  onClose: (id: string) => void;
}

const ImportTaskItem = memo(function ImportTaskItem({ task, onClose }: ItemProps) {
  const isRunning = task.status === 'processing';
  const handleClose = useCallback(() => onClose(task.id), [onClose, task.id]);

  // Xong rồi thì tự đóng — nếu không, sau một đợt nhập nhiều tệp người dùng
  // phải bấm tay từng thẻ.
  const autoDismissMs = task.autoDismissMs ?? AUTO_DISMISS_MS;
  useEffect(() => {
    if (isRunning) return;
    const timer = setTimeout(handleClose, autoDismissMs);
    return () => clearTimeout(timer);
  }, [isRunning, handleClose, autoDismissMs]);

  return (
    <ProgressToast
      actions={
        isRunning ? undefined : (
          <Button size="sm" variant="stroke" onClick={handleClose}>
            Đóng
          </Button>
        )
      }
      message={task.message}
      progress={isRunning ? task.progress : undefined}
      status={STATUS_MAP[task.status]}
      subtitle={task.fileName}
      title={task.label}
    />
  );
});

export interface ImportTaskListProps {
  /** Chỉ hiện task đã khai đúng góc này. Task không khai → `bottom-right`. */
  position: ImportProgressPosition;
}

const ImportTaskList = memo(function ImportTaskList({ position }: ImportTaskListProps) {
  const tasks = useImportProgressStore((s) => s.tasks);
  const remove = useImportProgressStore((s) => s.remove);

  const visible = [...tasks]
    .filter((t) => (t.position ?? 'bottom-right') === position)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((task) => (
        <ImportTaskItem key={task.id} task={task} onClose={remove} />
      ))}
    </>
  );
});

export default ImportTaskList;
