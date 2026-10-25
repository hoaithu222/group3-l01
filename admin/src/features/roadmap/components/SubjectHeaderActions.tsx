import { Button, Menu, type MenuOption } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import type { RoadmapSubjectStatus } from '../types/roadmap.types';

/** Thao tác cần hộp thoại lý do — `SubjectDetailPage` giữ state và render `ReasonDialog` tương ứng. */
export type SubjectAction = 'unpublish' | 'archive' | 'delete';

interface SubjectHeaderActionsProps {
  status: RoadmapSubjectStatus;
  canDelete: boolean;
  /** Đang gọi xuất bản (`publish.isPending` của trang). */
  publishing: boolean;
  onPublish: () => void;
  onEdit: () => void;
  /** Mở hộp thoại lý do của thao tác (trang `setAction`). */
  onAction: (action: SubjectAction) => void;
}

/**
 * Cụm nút mép PHẢI thanh header của `SubjectDetailPage` (trang chỉ render khi có `roadmap:update`).
 *
 * ⛔ CHỈ MỘT nút chữ (thao tác CHÍNH theo trạng thái: Xuất bản HOẶC Gỡ xuất bản) + menu "⋯". Bảng tên
 *    canh giữa TUYỆT ĐỐI từ xl (1280px) mà cụm phải còn gánh dãy icon toàn cục + khối user (~280px):
 *    ba nút chữ (~270px) đẩy mép trái cụm phải về ~710px, trong khi bảng tên của một tên lộ trình dài
 *    chạm tới ~830px ⇒ ĐÈ lên tiêu đề ở đúng laptop 14". Sửa thông tin · Lưu trữ · Xoá lộ trình vào "⋯".
 */
export default function SubjectHeaderActions({
  status,
  canDelete,
  publishing,
  onPublish,
  onEdit,
  onAction,
}: SubjectHeaderActionsProps) {
  const overflowOptions: MenuOption[] = [{ key: 'edit', label: 'Sửa thông tin' }];
  if (status !== 'ARCHIVED') overflowOptions.push({ key: 'archive', label: 'Lưu trữ' });
  if (canDelete) overflowOptions.push({ key: 'delete', label: 'Xoá lộ trình', danger: true });

  const handleSelect = (option: MenuOption) => {
    if (option.key === 'edit') onEdit();
    else if (option.key === 'archive' || option.key === 'delete') onAction(option.key);
  };

  return (
    <div className="flex items-center gap-1.5">
      {status !== 'PUBLISHED' && status !== 'ARCHIVED' && (
        <Button loading={publishing} size="sm" variant="primary" onClick={onPublish}>
          Xuất bản
        </Button>
      )}
      {status === 'PUBLISHED' && (
        <Button size="sm" variant="stroke" onClick={() => onAction('unpublish')}>
          Gỡ xuất bản
        </Button>
      )}
      {/* `modal={false}`: mục menu mở tiếp hộp thoại (`SubjectFormModal` / `ReasonDialog`) — menu modal
          để lại body kẹt `pointer-events: none` sau khi đóng hộp thoại (xem kit2 `Menu`). */}
      <Menu
        align="end"
        modal={false}
        options={overflowOptions}
        trigger={
          <Button aria-label="Thao tác khác" size="sm" variant="ghost">
            <SystemIcon name="ellipsis-vertical-outline" size={14} />
          </Button>
        }
        onSelect={handleSelect}
      />
    </div>
  );
}
