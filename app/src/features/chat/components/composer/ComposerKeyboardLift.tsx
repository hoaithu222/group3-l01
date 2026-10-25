import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { useSheetKeyboardHandled } from '@/shared/ui/bottom-sheet';

interface ComposerKeyboardLiftProps {
  children: ReactNode;
  /** Chiều cao thanh tab dưới lúc bàn phím mở (bù để ô soạn không lơ lửng cách bàn phím một thanh tab). 0 ngoài `<Tabs>`. */
  tabBarHeight: number;
}

/**
 * Nâng ô soạn theo bàn phím — MỘT lần, ở đúng một nơi.
 *
 *  · Ngoài tấm: `KeyboardStickyView` (nâng đúng bằng chiều cao bàn phím, trừ `tabBarHeight`) như cũ.
 *  · TRONG `BottomSheet` (chat phòng họp, chat phòng thoại): tấm ĐÃ nâng cả khối lên đúng chiều cao bàn phím
 *    (`SheetSurface` → `KeyboardAvoidingView behavior="padding"`), nên nâng thêm ở đây là nâng HAI lần — ô soạn trôi lên
 *    giữa danh sách tin và chừa dải trống dưới bàn phím. Trong tấm chỉ cần một `View` thường.
 */
export function ComposerKeyboardLift({ children, tabBarHeight }: ComposerKeyboardLiftProps) {
  const sheetHandlesKeyboard = useSheetKeyboardHandled();
  if (sheetHandlesKeyboard) return <View>{children}</View>;
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: tabBarHeight }}>{children}</KeyboardStickyView>
  );
}
