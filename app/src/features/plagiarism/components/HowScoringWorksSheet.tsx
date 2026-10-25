import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';

interface HowScoringWorksSheetProps {
  onClose: () => void;
  visible: boolean;
}

/** Một ý giải thích: ô icon (trang trí) + tiêu đề ngắn + đoạn giải thích. */
function Point({
  children,
  icon,
  title,
  tone,
}: {
  children: ReactNode;
  icon: IconName;
  title: string;
  tone: IconTileTone;
}) {
  return (
    <View className="flex-row items-start gap-sm">
      <IconTile name={icon} size="sm" tone={tone} />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1">{title}</Text>
        <Text className="text-body-md text-fg-2">{children}</Text>
      </View>
    </View>
  );
}

/**
 * Giải thích containment, loại trừ, giới hạn mã nguồn (app.md `HowScoringWorksSheet`).
 *
 * Ba ý tách thành ba khối có ô icon để quét mắt nhanh. ⚠️ Chữ nhấn mạnh dùng `font-semibold` lồng trong câu, ⛔ không
 * gõ IN HOA ("TRÙNG", "ĐỐI CHIẾU") như bản cũ: chữ hoa có dấu chồng tầng bị Android cắt ở mọi vai chữ trừ `text-overline`.
 */
export function HowScoringWorksSheet({ onClose, visible }: HowScoringWorksSheetProps) {
  return (
    <BottomSheet scrollable title="Cách tính điểm" visible={visible} onClose={onClose}>
      {/* `pb-md`: tấm KHÔNG có `footer` — thiếu đệm đáy thì đoạn cuối dính sát mép dưới tấm khi cuộn tới cuối. */}
      <View className="gap-md pb-md">
        <Point icon="analytics-02" title="Điểm của mỗi tệp" tone="brand">
          Là tỉ lệ phần trăm nội dung tệp đó <Text className="font-semibold text-fg-1">trùng</Text>{' '}
          với các tài liệu khác trong nhóm, sau khi đã bỏ phần trùng với tệp mẫu bạn loại trừ và các
          câu chữ phổ biến (đề cương mẫu, câu mở đầu quen thuộc…).
        </Point>
        <Point icon="search" title="Cách so khớp" tone="info">
          Hệ thống chia văn bản/mã nguồn thành các đoạn nhỏ gối nhau rồi so khớp dấu vân tay — bắt
          được cả khi đã đổi vài từ, đổi tên biến hay thêm chú thích.
        </Point>
        <Point icon="document-2" title="Với mã nguồn" tone="accent">
          Hệ thống hiện chỉ so theo <Text className="font-semibold text-fg-1">token</Text> (từ khoá,
          định danh, chuỗi/số) chứ chưa hiểu cấu trúc — đổi `for` thành `while`, tách/gộp hàm có thể
          không bắt được. Hãy dùng điểm này để{' '}
          <Text className="font-semibold text-fg-1">đối chiếu</Text>, không phải kết luận cuối cùng.
        </Point>
      </View>
    </BottomSheet>
  );
}
