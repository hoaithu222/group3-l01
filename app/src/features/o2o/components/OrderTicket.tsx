import { useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useResponsiveValue, useThemeColors } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

import { formatPin, qrPayload } from '../utils/o2o-format';

export interface OrderTicketProps {
  code: string;
  /** PIN đọc từ kho khoá; `null` = máy này không còn giữ (đổi máy, mất dữ liệu, Keystore hỏng). */
  pin: string | null;
  /** Đã đọc xong kho khoá — chưa xong thì KHÔNG kết luận "mất PIN" (xem `usePinVault`). */
  pinReady: boolean;
  canRegenerate: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
}

/**
 * Vé nhận hàng (app.md §2 `OrderTicket`): PIN 6 số cỡ LỚN cách quãng ("482 913"), nút ẩn/hiện, mã QR (`mãĐơn|PIN`) và mã đơn. Đưa PIN hoặc QR cho tiệm
 * lúc nhận tài liệu. Máy không còn giữ PIN (server chỉ lưu HMAC, KHÔNG có cách đọc lại) thì hiện "Tạo PIN mới" — mã cũ vô hiệu ngay.
 *
 * ⚠️ QR luôn nền TRẮNG mã ĐEN (`neutral-0`/`ink-10` giống hệt ở hai chế độ) — QR đảo màu ở chế độ tối thì nhiều máy quét không đọc được (cùng `InviteQrCode`).
 * ⚠️ PIN ẩn thì QR cũng ẩn: QR chứa chính PIN, để hở thì nút "ẩn" vô nghĩa. Màn này KHÔNG chặn chụp màn hình (người dùng cần chụp PIN — app.md §6).
 */
export function OrderTicket({
  code,
  pin,
  pinReady,
  canRegenerate,
  regenerating,
  onRegenerate,
}: OrderTicketProps) {
  const [shown, setShown] = useState(true);
  const colors = useThemeColors();
  const qrSize = useResponsiveValue({ base: 176, tablet: 220 });

  if (!pinReady) return null;

  if (!pin) {
    return (
      <Card>
        <View className="gap-sm">
          <Alert
            description="Máy này không còn giữ mã PIN của đơn (có thể bạn vừa đổi máy). Hãy tạo mã PIN mới để nhận tài liệu — mã cũ sẽ không dùng được nữa."
            tone="warning"
          />
          <Button
            disabled={!canRegenerate}
            fullWidth
            iconLeft="reload"
            label="Tạo PIN mới"
            loading={regenerating}
            onPress={onRegenerate}
          />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View className="items-center gap-sm">
        <Text className="text-label-md font-semibold text-fg-2">Mã PIN nhận hàng</Text>
        <Text
          accessibilityLabel={shown ? `Mã PIN ${pin.split('').join(' ')}` : 'Mã PIN đang ẩn'}
          accessibilityRole="text"
          className="text-display font-bold text-fg-1"
        >
          {shown ? formatPin(pin) : '••• •••'}
        </Text>
        {shown ? (
          <View
            accessibilityLabel="Mã QR nhận hàng"
            accessibilityRole="image"
            accessible
            className="items-center rounded-sm bg-neutral-0 p-sm"
          >
            <QRCode
              backgroundColor={colors['neutral-0']}
              color={colors['ink-10']}
              ecl="M"
              size={qrSize}
              value={qrPayload(code, pin)}
            />
          </View>
        ) : null}
        <Text className="text-body-md text-fg-2">Mã đơn: {code}</Text>
        <Button
          iconLeft={shown ? 'hide' : 'view'}
          label={shown ? 'Ẩn mã' : 'Hiện mã'}
          size="sm"
          variant="tertiary"
          onPress={() => setShown((value) => !value)}
        />
        <Text className="text-center text-caption-lg text-fg-2">
          Đưa mã PIN hoặc mã QR cho tiệm khi nhận tài liệu và thanh toán tại quầy.
        </Text>
      </View>
    </Card>
  );
}
