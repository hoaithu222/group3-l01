import { Text, View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';

import type { PaymentProfileView } from '../api';
import { bankDisplayName, bankLogoIcon } from '../utils/banks';

export interface PaymentProfileRowProps {
  busy?: boolean;
  profile: PaymentProfileView;
  onDelete: (profile: PaymentProfileView) => void;
  onMakeDefault: (profile: PaymentProfileView) => void;
}

/**
 * Một tài khoản nhận tiền: logo · tên ngân hàng · `••••1234` · tên chủ TK · nhãn "Mặc định".
 * Chỉ có 4 số cuối — số đầy đủ không bao giờ về lại app sau khi lưu (BE chỉ trả cho người ĐANG NỢ chủ TK).
 * `•` không đọc lên được nên nhãn trợ năng đọc bằng lời: "đuôi 1234".
 *
 * ✅ Hai thao tác phụ ("Đặt làm mặc định", "Xoá tài khoản") gom vào MỘT menu "⋯" ở cuối hàng (`ActionMenu`): trước đây
 * mỗi tài khoản có thêm một dòng nút riêng (link + icon xoá đứng sát nhau) — hàng cao gấp rưỡi, và nút xoá nằm ngay cạnh
 * nút đặt mặc định. Trong menu, "Xoá" ở cuối, chữ đỏ, và vẫn qua hộp thoại xác nhận của màn cha.
 */
export function PaymentProfileRow({
  busy = false,
  onDelete,
  onMakeDefault,
  profile,
}: PaymentProfileRowProps) {
  const bankName = bankDisplayName(profile.bankBin, profile.bankName);

  return (
    <View className="flex-row items-center gap-xs py-xs">
      <View
        accessibilityLabel={`${bankName}, tài khoản đuôi ${profile.accountLast4}, chủ tài khoản ${profile.accountName}${profile.isDefault ? ', mặc định' : ''}`}
        accessible
        className="flex-1 flex-row items-center gap-sm"
      >
        <Icon name={bankLogoIcon(profile.bankBin) ?? 'bank'} size={32} />
        <View className="flex-1 gap-3xs">
          <View className="flex-row items-center gap-xs">
            <Text className="shrink text-label-lg font-semibold text-fg-1" numberOfLines={1}>
              {bankName}
            </Text>
            {profile.isDefault ? <Badge label="Mặc định" size="sm" variant="success" /> : null}
          </View>
          <Text className="text-body-md text-fg-2" numberOfLines={2}>
            ••••{profile.accountLast4} · {profile.accountName}
          </Text>
        </View>
      </View>

      <ActionMenu
        accessibilityLabel={`Thao tác cho tài khoản đuôi ${profile.accountLast4}`}
        items={[
          {
            disabled: busy,
            hidden: profile.isDefault,
            icon: 'checkmark-circle',
            key: 'default',
            label: 'Đặt làm mặc định',
            onPress: () => onMakeDefault(profile),
          },
          {
            description: 'Bạn bè sẽ không còn thấy tài khoản này khi trả tiền cho bạn',
            disabled: busy,
            icon: 'delete',
            key: 'delete',
            label: 'Xoá tài khoản',
            onPress: () => onDelete(profile),
            tone: 'danger',
          },
        ]}
        title={`${bankName} ••••${profile.accountLast4}`}
      />
    </View>
  );
}
