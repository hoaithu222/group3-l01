import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Thumbnail } from '@/shared/ui/card';

import { usePortfolioImage } from '../../hooks/usePortfolioImage';

export interface PortfolioImageFieldProps {
  /** `avatar` = ảnh đại diện riêng (tròn); `cover` = ảnh bìa dự án (ngang 1200×630 khi dựng trang). */
  variant: 'avatar' | 'cover';
  label: string;
  /** Câu dưới nhãn nói HẬU QUẢ khi không chọn ảnh ("Không chọn thì dùng ảnh tài khoản"). */
  hint: string;
  /** Nhãn nút gỡ ảnh ("Dùng ảnh tài khoản" / "Bỏ ảnh bìa"). */
  clearLabel: string;
  assetId: string | null;
  /** Tên hiển thị — chữ viết tắt khi ảnh đại diện chưa có/hỏng. */
  name?: string;
  disabled?: boolean;
  onChange: (assetId: string | null) => void;
}

/**
 * Ô chọn ảnh cho portfolio (app.md p6-07 §3, §6): chọn từ thư viện → tải lên (`useUpload`) → ghi `assetId` vào form. Ảnh vừa chọn hiện NGAY từ URI cục bộ; tải hỏng thì có "Thử lại" ngay tại ô.
 * ⚠️ Chưa lưu gì cho tới khi bấm "Lưu" của form cha — `onChange` chỉ ghi vào form, nên bỏ ngang không để lại asset gắn nhầm hồ sơ.
 */
export function PortfolioImageField({
  assetId,
  clearLabel,
  disabled = false,
  hint,
  label,
  name,
  onChange,
  variant,
}: PortfolioImageFieldProps) {
  const image = usePortfolioImage({ assetId, onReady: onChange });
  const hasImage = image.uri !== undefined || assetId !== null;

  const actions = (
    <View className="gap-xs">
      <Button
        disabled={disabled}
        iconLeft="add-image"
        label={hasImage ? 'Đổi ảnh' : 'Chọn ảnh'}
        loading={image.busy}
        size="sm"
        variant="secondary"
        onPress={() => void image.pick()}
      />
      {hasImage ? (
        <Button
          disabled={disabled || image.busy}
          label={clearLabel}
          size="sm"
          variant="tertiary"
          onPress={() => {
            image.clear();
            onChange(null);
          }}
        />
      ) : null}
    </View>
  );

  return (
    <View className="gap-xs">
      <Text className="text-label-lg font-semibold text-fg-1">{label}</Text>
      {variant === 'avatar' ? (
        <View className="flex-row items-center gap-md">
          <Avatar name={name} size="lg" source={image.uri ? { uri: image.uri } : undefined} />
          <View className="flex-1">{actions}</View>
        </View>
      ) : (
        <View className="gap-sm">
          <Thumbnail
            alt={label}
            aspect={1200 / 630}
            cachePolicy="none"
            source={image.uri ? { uri: image.uri } : undefined}
          />
          {actions}
        </View>
      )}
      <Text className="text-caption-sm text-fg-2">{hint}</Text>
      {image.failed ? (
        <Alert
          actions={<Button label="Thử lại" size="xs" variant="secondary" onPress={image.retry} />}
          description="Tải ảnh lên chưa thành công."
          tone="error"
        />
      ) : null}
    </View>
  );
}
