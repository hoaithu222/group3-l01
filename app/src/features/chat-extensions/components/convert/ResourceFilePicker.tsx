import { Text, View } from 'react-native';

import { Checkbox } from '@/shared/ui/checkbox';
import { IconTile } from '@/shared/ui/icon-tile';

export interface ResourceFilePickerProps {
  files: { assetId: string; name: string }[];
  /** `assetId` đang chọn lưu (theo thứ tự của `files`). */
  picked: string[];
  onChange: (next: string[]) => void;
}

/**
 * Chọn tệp của tin để lưu vào tài liệu (mặc định chọn hết — BE nhận 1–N tệp trong MỘT lượt). Tin chỉ có MỘT tệp thì không có gì để chọn: hiện tên tệp như một dòng thông tin (một ô kiểm luôn-bật
 * chỉ là nhiễu và cho phép "bỏ chọn" rồi kẹt ở nút khoá). Bỏ hết ⇒ nơi gọi khoá nút lưu (BE `assetIds.min(1)`).
 */
export function ResourceFilePicker({ files, picked, onChange }: ResourceFilePickerProps) {
  const [only] = files;
  if (files.length === 1 && only) {
    return (
      <View accessibilityLabel={`Tệp: ${only.name}`} accessible className="flex-row items-center gap-sm">
        <IconTile name="document-2" size="sm" />
        <Text className="flex-1 text-body-md text-fg-1" numberOfLines={2}>
          {only.name}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-xs">
      <Text accessibilityRole="header" className="text-label-md font-semibold text-fg-1">
        Tệp cần lưu
      </Text>
      {files.map((file) => (
        <Checkbox
          key={file.assetId}
          checked={picked.includes(file.assetId)}
          label={file.name}
          onChange={(on) =>
            onChange(files.map((f) => f.assetId).filter((id) => (id === file.assetId ? on : picked.includes(id))))
          }
        />
      ))}
    </View>
  );
}
