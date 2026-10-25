import * as Clipboard from 'expo-clipboard';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { showToast } from '@/shared/utils/toast.utils';

export interface CopyRowProps {
  label: string;
  /** Giá trị ĐƯỢC SAO CHÉP (và hiện ra nếu không có `display`). */
  value: string;
  /**
   * Chữ HIỆN RA khi khác giá trị sao chép — số tiền hiện "37.500 VND" cho dễ đọc nhưng sao chép "37500" để dán vào
   * ô số tiền của app ngân hàng (chuỗi có dấu chấm/chữ VND thì bị từ chối).
   */
  display?: string;
  /** Câu toast khi sao chép xong — mặc định "Đã sao chép <label>". */
  copiedMessage?: string;
}

/**
 * Hàng "nhãn — giá trị — [Sao chép]" của thẻ VietQR. Nút sao chép có nhãn đọc rõ ("Sao
 * chép số tài khoản") vì cạnh nhau có tới ba nút cùng chữ "Sao chép" — nếu không, người
 * dùng trình đọc màn hình không biết nút nào của dòng nào.
 */
export function CopyRow({ copiedMessage, display, label, value }: CopyRowProps) {
  const copy = async () => {
    // Nơi gọi là `void copy()`: clipboard có thể từ chối → phải tự bắt, tránh Promise reject vô chủ (LogBox ở bản dev).
    try {
      await Clipboard.setStringAsync(value);
      showToast('success', copiedMessage ?? `Đã sao chép ${label.toLowerCase()}.`);
    } catch {
      showToast('error', 'Không sao chép được. Hãy thử lại.');
    }
  };

  return (
    <View className="flex-row items-center gap-sm">
      <View className="flex-1 gap-3xs">
        <Text className="text-caption-lg text-fg-2">{label}</Text>
        <Text className="text-label-lg font-semibold text-fg-1" selectable>
          {display ?? value}
        </Text>
      </View>
      <Button
        accessibilityLabel={`Sao chép ${label.toLowerCase()}`}
        iconLeft="copy"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => void copy()}
      />
    </View>
  );
}
