import { View } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import type { MyStudySetOption } from '../api/marketplace.types';
import { CONTENT_TYPE_VISUAL } from '../constants/marketplace.constants';
import { useMyPublicStudySets } from '../queries/my.queries';

export interface ContentPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: MyStudySetOption) => void;
}

/**
 * Chọn nội dung để niêm yết (app.md §2 "Niêm yết"). ⚠️ P1 CHỈ hỗ trợ bộ học PUBLIC của tôi trong tấm này — chợ cũng cho niêm yết `RESOURCE`
 * (be.md §5, BE đã hỗ trợ đầy đủ), nhưng `Resource` gắn theo TỪNG nhóm (`GET /workspaces/:id/resources`, không có "mọi tài liệu của tôi" gộp
 * qua các nhóm) nên một tấm chọn tài liệu cần thêm bước chọn nhóm/thư mục — ngoài phạm vi thời gian của lượt này, xem báo cáo bàn giao.
 *
 * Hàng có ô icon bộ học (cùng tông với lưới chợ); rỗng là `EmptyState` gọn nói CÁCH khắc phục (đổi chế độ hiển thị), không phải một dòng chữ trơn.
 *
 * ⛔ `padded={false}`: `SheetList` đã cấp lề 16 — trước đây tấm để `padded` mặc định (thân cũng `px-4`) nên hàng thụt 32dp, lệch hẳn
 * tiêu đề. Khung xương/rỗng/lỗi cũng nằm trong `SheetList` để cùng một lề.
 */
export function ContentPickerSheet({ onClose, onSelect, visible }: ContentPickerSheetProps) {
  const sets = useMyPublicStudySets();
  const visual = CONTENT_TYPE_VISUAL.STUDY_SET;
  const items = sets.data ?? [];

  return (
    <BottomSheet
      description="Chỉ bộ học công khai (PUBLIC) mới niêm yết được."
      padded={false}
      scrollable
      title="Chọn bộ học"
      visible={visible}
      onClose={onClose}
    >
      <SheetList accessibilityRole="list" className="pb-md">
        {sets.isLoading ? (
          // Khung xương CÙNG HÌNH hàng bộ học (ô icon + chữ) — không phải ba thanh xám trơn.
          <View>
            <SkeletonParagraphWithIcon className="py-xs" />
            <SkeletonParagraphWithIcon className="py-xs" />
            <SkeletonParagraphWithIcon className="py-xs" />
          </View>
        ) : sets.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void sets.refetch() }]}
            icon="alert-warning"
            size="compact"
            title="Không tải được danh sách bộ học"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            description="Đổi chế độ hiển thị của bộ học sang công khai (PUBLIC) rồi quay lại đây."
            icon={visual.icon}
            size="compact"
            title="Chưa có bộ học công khai"
            tone={visual.tone}
          />
        ) : (
          items.map((option, index) => (
            <ListItem
              key={option.id}
              className="py-xs"
              divider={index < items.length - 1}
              emphasis="title"
              label={option.title}
              labelNumberOfLines={2}
              leading={<IconTile name={visual.icon} size="sm" tone={visual.tone} />}
              value={`${formatNumber(option.itemCount)} mục`}
              onPress={() => onSelect(option)}
            />
          ))
        )}
      </SheetList>
    </BottomSheet>
  );
}
