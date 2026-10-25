import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { AttachmentTray } from '@/shared/ui/attachment';
import { Button } from '@/shared/ui/button';

import type { useReceiptUpload } from '../hooks/useReceiptUpload';

export interface ReceiptPickerProps {
  disabled?: boolean;
  /** Kết quả `useReceiptUpload` — màn cha giữ để đọc `assetId`/`pending` khi lưu. */
  receipt: ReturnType<typeof useReceiptUpload>;
  /** Nhãn khu vực — "Ảnh hoá đơn" hoặc "Ảnh chứng từ". */
  title: string;
}

/**
 * Chụp/chọn ảnh + khay tiến độ (dùng lại `AttachmentTray` của bộ chung). Tuỳ chọn.
 * Ảnh chỉ được gắn vào khoản khi READY — trong lúc còn tải, màn cha khoá nút Lưu để
 * không lưu KHÔNG kèm ảnh trong khi người dùng tưởng đã kèm.
 */
export function ReceiptPicker({ disabled, receipt, title }: ReceiptPickerProps) {
  const hasImage = receipt.items.length > 0;

  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">{title} (không bắt buộc)</Text>

      <AttachmentTray
        items={receipt.items}
        onCancel={receipt.remove}
        onRemove={receipt.remove}
        onRetry={receipt.retry}
      />

      {receipt.failed ? (
        <Alert
          description="Ảnh chưa tải lên được. Bấm thử lại trên ảnh, hoặc gỡ ảnh để lưu không kèm ảnh."
          tone="warning"
        />
      ) : null}

      {!hasImage ? (
        <View className="flex-row gap-sm">
          <View className="flex-1">
            <Button
              disabled={disabled}
              fullWidth
              iconLeft="add-image"
              label="Chọn ảnh"
              size="sm"
              variant="secondary"
              onPress={() => void receipt.pickFromLibrary()}
            />
          </View>
          <View className="flex-1">
            <Button
              disabled={disabled}
              fullWidth
              iconLeft="image"
              label="Chụp ảnh"
              size="sm"
              variant="secondary"
              onPress={() => void receipt.takePhoto()}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
