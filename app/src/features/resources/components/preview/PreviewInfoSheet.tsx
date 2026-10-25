import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { ListItem } from '@/shared/ui/list';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { ResourceDto } from '../../api';
import { formatSize } from '../../utils/format-size';
import { resourceTypeMeta } from '../../utils/resource-icon';

export interface PreviewInfoSheetProps {
  onClose: () => void;
  resource: ResourceDto | undefined;
  visible: boolean;
}

/**
 * "Thông tin" của tệp (app.md p3-01 §3): tên ĐẦY ĐỦ (danh sách chỉ hiện 2 dòng), loại, dung lượng, người tải, ngày.
 *
 * Người tải lên có `Avatar` (ảnh nếu BE trả `avatarUrl` — hiện luôn `null` — không thì chữ viết tắt) cạnh tên: nhận ra
 * người quen nhanh hơn đọc tên. Ảnh bị ẩn khỏi trình đọc màn hình (tên đã là chữ ngay bên cạnh); giá trị không cắt dòng.
 */
export function PreviewInfoSheet({ onClose, resource, visible }: PreviewInfoSheetProps) {
  return (
    <BottomSheet
      // ⚠️ `scrollable`: tên đầy đủ và mô tả không giới hạn độ dài (giá trị cố ý KHÔNG cắt dòng) — thân không cuộn thì
      // tấm chạm trần chiều cao là mấy hàng cuối ("Ngày tải lên", "Mô tả") bị cắt, không cuộn tới được.
      scrollable
      title="Thông tin tệp"
      visible={visible && resource !== undefined}
      onClose={onClose}
    >
      {resource ? (
        <>
          <ListItem label="Tên" value={resource.name} />
          <ListItem label="Loại" value={resourceTypeMeta(resource.type).label} />
          <ListItem label="Dung lượng" value={formatSize(resource.size)} />
          <ListItem
            label="Người tải lên"
            value={
              <View className="flex-row items-center gap-xs">
                {/* Ảnh là trang trí ở đây — tên đã có ngay bên cạnh; không ẩn thì trình đọc màn hình đọc tên HAI lần. */}
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Avatar
                    name={resource.uploadedBy.name}
                    size="xs"
                    source={
                      resource.uploadedBy.avatarUrl
                        ? { uri: resource.uploadedBy.avatarUrl }
                        : undefined
                    }
                  />
                </View>
                {/* Cùng cỡ/nét với giá trị chuỗi của `ListItem` (`text-body-lg font-semibold`) — hàng này không lệch nhịp. */}
                <Text className="shrink text-body-lg font-semibold text-fg-1">
                  {resource.uploadedBy.name}
                </Text>
              </View>
            }
          />
          <ListItem label="Ngày tải lên" value={formatDateTime(resource.createdAt)} />
          {resource.updatedAt !== resource.createdAt ? (
            <ListItem label="Cập nhật" value={formatDateTime(resource.updatedAt)} />
          ) : null}
          {resource.description ? <ListItem label="Mô tả" value={resource.description} /> : null}
        </>
      ) : null}
    </BottomSheet>
  );
}
