import { type ReactNode } from 'react';
import { View } from 'react-native';

export interface WorkspaceGridProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
}

/**
 * Lưới thẻ nhóm co giãn theo BẬC màn (`docs/rules/responsive.md`): 1 cột ở điện thoại · 2 cột từ `tablet:` (600dp — gồm
 * điện thoại XOAY NGANG) · 3 cột từ `tablet-lg:` (840dp). Danh sách thật (`WorkspaceListSection`) và khung xương
 * (`WorkspaceListSkeleton`) dùng CHUNG lưới này ⇒ khung xương rơi đúng ô của thẻ thật, danh sách không nhảy lúc dữ liệu về.
 *
 * ⚠️ Khe cột bằng ĐỆM ô (`px-xs` mỗi bên = 16 giữa hai cột, hàng kéo `-mx-xs` cho mép ngoài vẫn thẳng lề 16 của màn) chứ
 * ⛔ không `gap`: ô `w-1/2` + `gap` > 100% ⇒ Yoga đẩy ô thứ hai xuống dòng, lưới hai cột thành một cột.
 * ⚠️ Bề rộng theo TỈ LỆ (`w-1/2`, `w-1/3`), ⛔ không số dp: cùng một lớp đúng ở máy 600dp lẫn cửa sổ chia đôi đang kéo.
 * Ô trong một hàng cao ĐỀU nhau (dòng `flex-wrap` kéo dãn con theo trục phụ) — thẻ tự `grow` để lấp ô (`WorkspaceCard`).
 *
 * Vẽ bằng `.map()` (trần 50 nhóm/người, `LIMITS.workspace.perUserMax`) — chưa cần ảo hoá; trần tăng thì chuyển `FlashList`
 * với `numColumns` từ `useResponsiveValue`.
 */
export function WorkspaceGrid<T>({ items, keyOf, renderItem }: WorkspaceGridProps<T>) {
  return (
    <View className="-mx-xs flex-row flex-wrap">
      {items.map((item, index) => (
        <View key={keyOf(item)} className="w-full px-xs pb-sm tablet:w-1/2 tablet-lg:w-1/3">
          {renderItem(item, index)}
        </View>
      ))}
    </View>
  );
}
