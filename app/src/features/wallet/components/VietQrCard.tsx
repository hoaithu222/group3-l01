import { useMemo } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useResponsiveValue, useThemeColors } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';
import { Icon } from '@/shared/ui/icon';

import type { PaymentInfoView } from '../api';
import { formatMoney } from '../domain/money';
import { buildVietQrPayload, transferNote, VietQrError } from '../domain/vietqr';
import { bankDisplayName, bankLogoIcon } from '../utils/banks';
import { CopyRow } from './CopyRow';

export interface VietQrCardProps {
  /** Số tiền người chuyển ĐỊNH chuyển (đồng). `null`/0 ⇒ QR tĩnh, người chuyển tự nhập số tiền. */
  amount: number | null;
  info: PaymentInfoView;
}

/**
 * Mã VietQR + thông tin tài khoản + nút sao chép. QR sinh NGAY TẠI APP
 * (`domain/vietqr.ts`) từ `PaymentInfoView` — số tài khoản không rời máy tới dịch vụ
 * bên thứ ba (README §2).
 *
 * ⛔ Số tài khoản ĐẦY ĐỦ chỉ có ở màn này; màn Trả nợ bật `usePreventScreenCapture`
 * (Android) để không lộ qua ảnh chụp/ghi màn hình. iOS không chặn được.
 * ⚠️ Nền QR luôn TRẮNG, mã ĐEN (`neutral-0`/`ink-10` giống nhau ở hai chế độ): QR
 * đảo màu ở chế độ tối thì nhiều app ngân hàng không quét được.
 */
export function VietQrCard({ amount, info }: VietQrCardProps) {
  const colors = useThemeColors();
  const size = useResponsiveValue({ base: 200, tablet: 240 });
  const note = transferNote(info.reference);
  const logo = bankLogoIcon(info.bankBin);
  const bankName = bankDisplayName(info.bankBin, info.bankName);
  const validAmount = amount !== null && amount > 0 ? amount : undefined;

  const payload = useMemo(() => {
    try {
      return buildVietQrPayload({
        accountNumber: info.accountNumber,
        amount: validAmount,
        bankBin: info.bankBin,
        note,
      });
    } catch (error) {
      // Dữ liệu tài khoản lạ (BE cho phép số TK 6–19 số, ta chặn thêm ký tự) — vẫn cho chuyển tay.
      if (error instanceof VietQrError) return null;
      throw error;
    }
  }, [info.accountNumber, info.bankBin, note, validAmount]);

  return (
    <View className="gap-md rounded-md border-hairline border-border-1 bg-bg-1 p-md">
      <View className="flex-row items-center gap-sm">
        <Icon name={logo ?? 'bank'} size={32} />
        <View className="flex-1">
          <Text className="text-label-lg font-semibold text-fg-1">{bankName}</Text>
          <Text className="text-caption-lg text-fg-2">Quét bằng app ngân hàng bất kỳ</Text>
        </View>
      </View>

      {payload ? (
        <View
          accessibilityLabel={`Mã QR chuyển khoản tới ${info.accountName}, ${bankName}${validAmount ? `, ${formatMoney(validAmount)}` : ''}`}
          accessibilityRole="image"
          accessible
          className="items-center self-center rounded-sm bg-neutral-0 p-sm"
        >
          <QRCode
            backgroundColor={colors['neutral-0']}
            color={colors['ink-10']}
            ecl="M"
            size={size}
            value={payload}
          />
        </View>
      ) : (
        <Alert
          description="Không tạo được mã QR cho tài khoản này. Bạn vẫn chuyển khoản thủ công bằng thông tin bên dưới."
          tone="warning"
        />
      )}

      <View className="gap-sm">
        <CopyRow label="Số tài khoản" value={info.accountNumber} />
        <Text className="text-body-md text-fg-1">Chủ tài khoản: {info.accountName}</Text>
        {validAmount ? (
          <CopyRow
            copiedMessage="Đã sao chép số tiền."
            display={formatMoney(validAmount)}
            label="Số tiền"
            value={String(validAmount)}
          />
        ) : null}
        <CopyRow label="Nội dung chuyển khoản" value={note} />
      </View>

      <Text className="text-caption-lg text-fg-2">
        Giữ NGUYÊN nội dung chuyển khoản để người nhận đối chiếu. Chuyển xong, bấm “Tôi đã chuyển”
        bên dưới.
      </Text>
    </View>
  );
}
