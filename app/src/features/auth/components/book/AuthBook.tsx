import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useThemeColors } from '@/shared/theme';

import { bookShift, PAGE_COUNT, type BookGeometry } from './book-geometry';
import { BookCoverArt } from './BookCoverArt';
import { BookCoverFace } from './BookCoverFace';
import { BookInsidePage } from './BookInsidePage';
import { BookPage } from './BookPage';

const PAGE_INDEXES = Array.from({ length: PAGE_COUNT }, (_, index) => index);

/** Alpha của bóng đổ ghép sau mã hex của token (`#RRGGBBAA`): 0x29 ≈ 16% — đủ nhấc sách khỏi nền, không thành vệt bẩn. */
const SHADOW_ALPHA = '29';

export interface AuthBookProps {
  /** Máy nằm ngang: sách nhỏ, trang trong thay ô phân hệ bằng chấm màu. */
  compact: boolean;
  geometry: BookGeometry;
  progress: SharedValue<number>;
  shake: SharedValue<number>;
}

/**
 * Quyển sách 3D: bìa sau + trang trong đứng yên ở nửa phải; mặt trong bìa, sáu tờ ruột và mặt ngoài bìa xoay quanh gáy
 * theo MỘT `progress` (toán + lý do thứ tự vẽ: `book-geometry.ts`). Tổng 9 view hoạt ảnh (8 lớp xoay + lớp bọc dời/lắc) —
 * trong ngân sách ~10 lớp cho máy Android yếu.
 *
 * ⛔ Thứ tự con dưới đây LÀ thứ tự chồng lớp (anh em vẽ sau nằm trên) — đổi chỗ là tờ nằm đè sai phía khi sách mở.
 * ⛔ Lớp bọc mang `useAnimatedStyle` ⇒ không `className`, `cssInterop={false}` (styling-nativewind.md "Cạm bẫy").
 *
 * Bóng đổ: `boxShadow` (New Arch) màu từ token `overlay` — tối ở CẢ hai chế độ, nên bóng không hoá vệt sáng như `fg-1`.
 * Chỉ bìa sau (đứng yên) và mặt trong bìa (khi nằm phẳng bên trái) mang bóng: lúc gập, mặt ngoài trùng khít bìa sau và
 * bóng của bìa sau đã ôm quanh cả quyển. ⚠️ Android < 9 (API 28) không vẽ `boxShadow` — sách vẫn đủ, chỉ phẳng hơn.
 */
export function AuthBook({ compact, geometry, progress, shake }: AuthBookProps) {
  const { boardH, boardW, inset, pageH, pageW } = geometry;
  const colors = useThemeColors();
  const shadow = [
    {
      blurRadius: inset * 3,
      color: `${colors.overlay}${SHADOW_ALPHA}`,
      offsetX: 0,
      offsetY: inset,
    },
  ];

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: bookShift(progress.get(), boardW) + shake.get() }],
  }));

  return (
    // ⚠️ `collapsable={false}`: mở hẳn + hết lắc thì transform = đồng nhất (`translateX: 0`) và khung không nền ⇒ Fabric
    // được phép "làm phẳng" nó, gỡ view gốc rồi dựng lại ở lần gập/lắc sau — tám lớp xoay bị gắn lại giữa chừng.
    <Animated.View
      collapsable={false}
      cssInterop={false}
      style={[{ height: boardH, width: boardW * 2 }, style]}
    >
      <View
        className="absolute rounded-r-2xs bg-action-base"
        style={{ boxShadow: shadow, height: boardH, left: boardW, top: 0, width: boardW }}
      />
      <View
        className="absolute overflow-hidden rounded-r-3xs border-hairline border-border-1 bg-bg-1"
        style={{ height: pageH, left: boardW, top: inset, width: pageW }}
      >
        <BookInsidePage compact={compact} />
      </View>
      <BookCoverFace geometry={geometry} progress={progress} shadow={shadow} side="inside" />
      {PAGE_INDEXES.map((index) => (
        <BookPage
          key={index}
          compact={compact}
          geometry={geometry}
          index={index}
          progress={progress}
        />
      ))}
      <BookCoverFace geometry={geometry} progress={progress} side="front">
        <BookCoverArt compact={compact} logo={geometry.logo} />
      </BookCoverFace>
    </Animated.View>
  );
}
