import { Button } from '@/shared/ui/button';

export interface NewMessagesPillProps {
  /** Định vị viên thuốc (`absolute bottom-2 self-center`) — đi vào lớp NHẬN CHẠM của `Button` (`pressableClassName`). */
  className?: string;
  count: number;
  onPress: () => void;
}

/**
 * "Có N tin mới ↓" — hiện khi KHÔNG ở cuối và có tin mới; bấm → cuộn cuối (app.md §3).
 *
 * `Button` `neutral` cỡ `xs` (viên thuốc mực đặc + mũi tên), không tự dựng `Pressable` + `Text`: nút chung đã lo sẵn vùng chạm
 * 44dp (`hitSlop`), trần phóng cỡ chữ, trạng thái nhấn/khoá và vai trợ năng.
 */
export function NewMessagesPill({ className, count, onPress }: NewMessagesPillProps) {
  if (count <= 0) return null;
  const label = count > 99 ? 'Có tin mới' : `Có ${count} tin mới`;

  return (
    <Button
      accessibilityLabel={`${label}, cuộn xuống tin mới nhất`}
      iconRight="arrow-down"
      label={label}
      pressableClassName={className}
      size="xs"
      variant="neutral"
      onPress={onPress}
    />
  );
}
