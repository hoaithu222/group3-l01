/**
 * ProgressCenter — ĐIỂM MOUNT DUY NHẤT của mọi thẻ tiến trình neo góc màn hình.
 *
 * Mount một lần ở `AppProvider`. Các store phía sau là global nên panel dùng
 * chung cho mọi màn và sống sót khi đổi route / đóng modal.
 *
 * ── Vì sao một rail thay vì mỗi panel tự neo ────────────────────────────────
 * Bản gốc bên dự án PMS có hai component tự neo `fixed`: `UploadCenter` ở
 * `bottom-4` và `ImportProgressCenter` ở `bottom-20`. Con số 20 (80px) là ĐOÁN
 * chiều cao của cái kia — mà thẻ tải lên cao ~130px khi đang chạy, nên chạy
 * đồng thời là thẻ nhập ĐÈ LÊN thẻ tải lên, chỉ hở đúng hàng nút dưới cùng.
 * Đã dựng lại và chụp được đúng cảnh đó.
 *
 * Rail này neo MỘT lần cho cả góc rồi xếp con bằng `flex-col` + `gap`, nên
 * không còn con số nào phải đoán: thêm thẻ, đổi chiều cao thẻ, ẩn thẻ — bố cục
 * tự đúng.
 *
 *   ┌ góc dưới TRÁI ┐            ┌ góc dưới PHẢI ┐
 *   │ ImportTask…   │            │ ImportTask…   │  ← task khai position
 *   └───────────────┘            │ UploadQueue   │  ← thẻ tải lên luôn ở đây
 *                                └───────────────┘
 */

import { memo } from 'react';

import ImportTaskList from './ImportTaskList';
import UploadQueueCard from './UploadQueueCard';

/**
 * `z-1000`: overlay của modal trong app ở `z-50`. Để thấp hơn là thông báo bị
 * che đúng lúc người dùng cần nhìn nhất.
 *
 * `pointer-events-none` ở rail + `pointer-events-auto` ở thẻ: rail chiếm một
 * cột 384px chạy dọc mép màn, để bắt chuột thì nó nuốt cả click vào nội dung
 * phía sau ngay cả khi đang RỖNG.
 */
const RAIL =
  'pointer-events-none fixed bottom-4 z-1000 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 *:pointer-events-auto';

const ProgressCenter = memo(function ProgressCenter() {
  return (
    <>
      <div aria-live="polite" className={`${RAIL} right-4`} role="status">
        <ImportTaskList position="bottom-right" />
        <UploadQueueCard />
      </div>

      <div aria-live="polite" className={`${RAIL} left-4`} role="status">
        <ImportTaskList position="bottom-left" />
      </div>
    </>
  );
});

export default ProgressCenter;
