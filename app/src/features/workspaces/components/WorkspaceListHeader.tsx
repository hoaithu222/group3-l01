import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

export interface WorkspaceListHeaderProps {
  /** "Đang tham gia 4 nhóm · 2 nhóm có tin mới" — `null` thì không vẽ dòng (`workspaceSummaryText`). */
  summaryText: string | null;
  onJoin: () => void;
  onScan: () => void;
}

/**
 * Đầu danh sách nhóm: một dòng tóm tắt (điều AppBar "Nhóm" chưa nói) + hai lối vào PHỤ luôn nhìn thấy — "Tham gia bằng mã"
 * và ô "Quét QR" — kiểu nút "+" của Google Classroom / "Join team" của Teams. Lối vào CHÍNH "Tạo nhóm" là nút `add` của
 * AppBar: đứng yên khi cuộn, nên với tới được ở mọi vị trí của danh sách dài.
 *
 * ⚠️ "Quét QR" là nút CHỈ ICON (có nhãn trợ năng): ở máy 320dp + cỡ chữ 1.3, hai nút có chữ chia đôi hàng sẽ cắt "Tham gia
 * bằng mã" thành "Tham gia bằ…"; nút chữ `flex-1` + ô icon 40dp thì nhãn còn ~240dp — đủ chỗ.
 * Màn đích (`members/JoinByCodeScreen`, `ScanInviteScreen`) ở feature khác ⇒ điều hướng bằng ĐƯỜNG DẪN do màn cha truyền.
 */
export function WorkspaceListHeader({ summaryText, onJoin, onScan }: WorkspaceListHeaderProps) {
  return (
    // `tablet:max-w-content` (720dp): màn danh sách trải HẾT bề ngang máy tính bảng (lưới 2–3 cột) — nút `flex-1` thả tự do
    // thì dài 1000dp+; chặn đúng trần của `SearchInput` ngay bên dưới để hai khối thẳng mép phải.
    <View className="gap-sm tablet:max-w-content">
      {summaryText ? <Text className="text-body-md text-fg-2">{summaryText}</Text> : null}
      <View className="flex-row items-center gap-xs">
        <View className="flex-1">
          <Button
            fullWidth
            iconLeft="link"
            label="Tham gia bằng mã"
            size="sm"
            variant="secondary"
            onPress={onJoin}
          />
        </View>
        <Button
          accessibilityLabel="Quét mã QR để tham gia nhóm"
          iconLeft="qr"
          iconOnly
          size="sm"
          variant="secondary"
          onPress={onScan}
        />
      </View>
    </View>
  );
}
