import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';

import type { FileAction } from '../../utils/run-file-action';

export interface PreviewActionBarProps {
  busy: FileAction | null;
  /** Ngoại tuyến ⇒ khoá cả hai (đều cần mạng). */
  disabled: boolean;
  onRun: (action: FileAction) => void;
}

/**
 * Thanh dưới của Preview: Tải về (nút chính) · Chia sẻ (phụ) — app.md p3-01 §3. Đang chạy một thao tác thì nút đó
 * `loading`, còn lại khoá — bấm lần hai không tải hai lần.
 *
 * ✅ "Mở bằng ứng dụng khác" KHÔNG còn là nút thứ ba ở đây: nó dời lên menu "⋯" của thanh tiêu đề (cùng "Thông tin tệp").
 * Trước đây ba nút cỡ `sm` cùng hàng (một primary + hai secondary) — hành động phụ tranh chỗ với hành động chính, nhãn
 * phải rút ngắn thành "Mở ngoài" cho vừa máy 320dp. Còn hai nút thì mỗi nút rộng gấp rưỡi và dùng cỡ chuẩn.
 */
export function PreviewActionBar({ busy, disabled, onRun }: PreviewActionBarProps) {
  return (
    <BottomActionBar>
      <View className="flex-row gap-sm">
        <View className="flex-1">
          <Button
            disabled={disabled || (busy !== null && busy !== 'download')}
            fullWidth
            label="Tải về"
            loading={busy === 'download'}
            onPress={() => onRun('download')}
          />
        </View>
        <View className="flex-1">
          <Button
            disabled={disabled || (busy !== null && busy !== 'share')}
            fullWidth
            label="Chia sẻ"
            loading={busy === 'share'}
            variant="secondary"
            onPress={() => onRun('share')}
          />
        </View>
      </View>
    </BottomActionBar>
  );
}
