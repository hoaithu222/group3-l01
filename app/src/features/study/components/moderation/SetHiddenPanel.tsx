import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

export interface SetHiddenPanelProps {
  onRestore: () => void;
}

/**
 * Thay khối "Học thẻ/Trắc nghiệm/Thi thử" cho OWNER/ADMIN nhóm khi mở một bộ ĐÃ ẨN (`myPermissions.unhide`): be `resolveWith` chỉ cho họ `meta` + `unhide`
 * (không `content`) nên `GET /items` là 404 — hiện nút học ở đây là bấm vào để nhận lỗi. Lối vào duy nhất còn lại là "Khôi phục bộ học"; cùng hành
 * động có ở menu "⋯" của thanh tiêu đề, nhưng người vừa nhận thông báo bộ bị ẩn cần thấy nó ngay trên màn, không phải đi tìm trong menu.
 */
export function SetHiddenPanel({ onRestore }: SetHiddenPanelProps) {
  return (
    <View className="gap-md">
      <Text className="text-body-md text-fg-2">
        Bộ học này đang bị ẩn khỏi thành viên nhóm nên bạn chỉ xem được thông tin, không xem được
        nội dung. Khôi phục để mọi người học lại.
      </Text>
      <Button fullWidth iconLeft="view" label="Khôi phục bộ học" onPress={onRestore} />
    </View>
  );
}
