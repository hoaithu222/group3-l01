import { BottomSheet, SheetActions, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import { AMENITY_CODES } from '../api/o2o.types';
import { AMENITY_LABEL } from '../constants/o2o.constants';

export interface AmenityFilterSheetProps {
  visible: boolean;
  value: string[];
  onChange: (amenities: string[]) => void;
  onClose: () => void;
}

/**
 * Lọc theo tiện ích (nhiều lựa chọn — BE lọc "có ĐỦ mọi tiện ích đã chọn", `amenities: { $all }`). Mỗi lần chạm áp dụng NGAY: danh sách
 * phía sau đổi theo, người dùng thấy kết quả trước khi đóng tờ. Hàng chọn được: `selected` (trình đọc màn hình) + dấu ✓ nhìn thấy được.
 * `padded={false}` + `SheetList`: thân `padded` mặc định chèn khe giữa các hàng làm kẻ ngăn hở một dải trắng (`ui-component`).
 */
export function AmenityFilterSheet({ visible, value, onChange, onClose }: AmenityFilterSheetProps) {
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((item) => item !== code) : [...value, code]);

  return (
    <BottomSheet
      footer={
        // ✅ `SheetActions` chia đôi [Xoá lọc | Xong] theo đúng thứ tự của bộ chung (PHỤ trái, CHÍNH phải) — thay cho hàng tự ghép.
        <SheetActions
          primary={{ label: 'Xong', onPress: onClose }}
          secondary={{
            disabled: value.length === 0,
            label: 'Xoá lọc',
            onPress: () => onChange([]),
          }}
        />
      }
      padded={false}
      scrollable
      title="Lọc theo tiện ích"
      visible={visible}
      onClose={onClose}
    >
      <SheetList accessibilityRole="list" className="pb-md">
        {AMENITY_CODES.map((code, index) => {
          const on = value.includes(code);
          return (
            <ListItem
              key={code}
              divider={index < AMENITY_CODES.length - 1}
              emphasis="title"
              label={AMENITY_LABEL[code] ?? code}
              selected={on}
              trailing={
                on ? (
                  <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />
                ) : undefined
              }
              onPress={() => toggle(code)}
            />
          );
        })}
      </SheetList>
    </BottomSheet>
  );
}
