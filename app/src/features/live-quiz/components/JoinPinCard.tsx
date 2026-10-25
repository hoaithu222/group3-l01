import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { PinInput } from '@/shared/ui/pin';

import { PIN_LENGTH } from '../utils/live-quiz-links';

interface JoinPinCardProps {
  autoFocus: boolean;
  nickname: string;
  pin: string;
  /** Lỗi `QUIZ_*` đã dịch — hiện NGAY TẠI trường PIN, không toast. */
  error?: string;
  onNicknameChange: (value: string) => void;
  onPinChange: (value: string) => void;
}

/**
 * Thẻ nhập của màn vào phòng: ô PIN 6 số (`PinInput` chung — mỗi số một ô, tự lọc chữ số, tự điền OTP), dòng trạng thái sống
 * ("Đã nhập 3/6 số" → "Đủ 6 số — sẵn sàng", `polite` cho trình đọc màn hình) và tên hiển thị tuỳ chọn. Có lỗi thì dòng trạng
 * thái nhường chỗ cho thông báo đỏ dưới hàng ô (do `PinInput` vẽ) — không hiện hai dòng cùng lúc.
 * ⚠️ Ô PIN là của bộ chung nên cỡ ô 40×48; muốn ô LỚN hơn phải thêm cỡ vào `shared/ui/pin` (ngoài vùng của feature này).
 */
export function JoinPinCard({
  autoFocus,
  error,
  nickname,
  onNicknameChange,
  onPinChange,
  pin,
}: JoinPinCardProps) {
  const ready = pin.length === PIN_LENGTH;

  return (
    <Card className="gap-md">
      <View className="gap-sm">
        <Text className="text-label-lg text-fg-1">Mã PIN phòng thi</Text>
        <PinInput
          autoFocus={autoFocus}
          error={error}
          label="Mã PIN phòng thi"
          length={PIN_LENGTH}
          value={pin}
          onChange={onPinChange}
        />
        {error ? null : (
          <View
            accessibilityLiveRegion="polite"
            className="flex-row items-center justify-center gap-xs"
          >
            <Icon
              color={ready ? 'success' : 'fg-2'}
              name={ready ? 'checkmark-circle' : 'keyboard'}
              size="xs"
              variant={ready ? 'solid' : 'linear'}
            />
            <Text className="text-caption-lg text-fg-2">
              {ready
                ? 'Đủ 6 số — sẵn sàng vào phòng'
                : `Đã nhập ${String(pin.length)}/${String(PIN_LENGTH)} số`}
            </Text>
          </View>
        )}
      </View>
      <Input
        hint="Tuỳ chọn — để trống sẽ dùng tên hồ sơ"
        label="Tên hiển thị"
        maxLength={32}
        placeholder="Ví dụ: Minh Anh"
        value={nickname}
        onChangeText={onNicknameChange}
      />
    </Card>
  );
}
