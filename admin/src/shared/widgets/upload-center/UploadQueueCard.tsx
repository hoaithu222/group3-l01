/**
 * UploadQueueCard — MỘT thẻ tổng kết hàng đợi tải lên.
 *
 * Thẻ này KHÔNG tự neo vào góc màn hình: nó chỉ là nội dung, còn chỗ đứng do
 * `ProgressCenter` quyết định. Xem docblock của `ProgressCenter` để biết vì sao
 * (hai panel tự neo cùng một góc thì chồng lên nhau).
 *
 * Hàng đợi rỗng → trả `null`, không chiếm chỗ trong rail.
 *
 * Nạp việc cho nó từ màn bất kỳ:
 *   const { enqueue } = useUploadQueue();
 *   enqueue(files, (file, { onProgress, signal }) => api.upload(file, onProgress, signal));
 */

import { memo } from 'react';

import { useBeforeUnload } from '@/shared/hooks/dom';
import { Button } from '@/shared/ui';

import ProgressToast from './progress-toast';
import { useUploadQueue } from './useUploadQueue';

const UploadQueueCard = memo(function UploadQueueCard() {
  const { tasks, summary, retry, clear, cancel } = useUploadQueue();
  const { total, done, failed, active, allDone } = summary;

  // Còn tệp đang tải dở → tải lại trang / đóng tab sẽ hỏi xác nhận.
  useBeforeUnload(Boolean(active));

  if (tasks.length === 0) return null;

  const status = active ? 'running' : allDone ? 'success' : 'error';
  const title = active ? 'Đang tải lên' : allDone ? 'Tải lên hoàn tất' : 'Tải lên thất bại';
  const subtitle = active
    ? `${active.name} (${done + 1}/${total})`
    : allDone
      ? `Đã tải lên ${done}/${total} tệp`
      : `${done}/${total} tệp xong · ${failed} tệp lỗi`;

  return (
    <ProgressToast
      actions={
        active ? (
          <Button size="sm" variant="stroke" onClick={cancel}>
            Hủy
          </Button>
        ) : allDone ? (
          <Button size="sm" variant="primary" onClick={clear}>
            Đóng
          </Button>
        ) : (
          <>
            <Button size="sm" variant="stroke" onClick={clear}>
              Bỏ qua
            </Button>
            <Button size="sm" variant="primary" onClick={retry}>
              Thử lại
            </Button>
          </>
        )
      }
      progress={active ? active.progress : undefined}
      status={status}
      subtitle={subtitle}
      title={title}
    />
  );
});

export default UploadQueueCard;
