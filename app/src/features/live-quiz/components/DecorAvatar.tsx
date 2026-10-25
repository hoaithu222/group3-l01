import { View } from 'react-native';

import { Avatar, type AvatarProps } from '@/shared/ui/avatar';

/**
 * Avatar chữ viết tắt chỉ để TRANG TRÍ cạnh một cái tên đã nằm ở chữ/nhãn của dòng — ẩn khỏi trình đọc màn hình. `Avatar` mặc định
 * tự là một phần tử trợ năng ("Minh Anh", vai hình ảnh): để nguyên thì mỗi người chơi bị đọc HAI lần (avatar rồi tới tên), còn dòng
 * bảng xếp hạng (một ô trợ năng gộp) thì có thêm một ô lồng bên trong.
 */
export function DecorAvatar({ name, size }: Pick<AvatarProps, 'name' | 'size'>) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Avatar name={name} size={size} />
    </View>
  );
}
