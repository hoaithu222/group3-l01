import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { PATHS } from '@/shell/config';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen, useScreenFooterKeyboardOffset } from '@/shared/ui/screen';

import { useJoinByCode } from '../hooks/useJoinByCode';

/**
 * "Tham gia nhóm" — dán link mời hoặc nhập mã mời, hoặc sang màn quét QR.
 *
 * Vì sao có màn này: link mời (`https://…/invite/<token>`) chỉ mở app qua App Links đã xác thực (prod),
 * còn dev là `http://localhost:8081/…` — không mở được app; máy ảo Android thì không bấm được link. Đây là
 * đường VÀO song song với deep link (navigation.md: "luôn có đường nhập tay"), đi thẳng tới đúng hai
 * route mà deep link dùng.
 *
 * ⛔ Không gọi API ở màn này: xem trước/tham gia do màn đích lo (`InviteLandingScreen`).
 */
export function JoinByCodeScreen() {
  const join = useJoinByCode();

  // ⚠️ Nút Tiếp tục dính đáy PHẢI đi theo bàn phím: bọc `KeyboardStickyView` NGOÀI `BottomActionBar`
  // (ui-components.md §5) — thiếu là bàn phím che nút và người dùng dán xong không thấy chỗ bấm.
  // Bù chiều cao thanh tab dưới — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();
  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar>
        <Button fullWidth label="Tiếp tục" onPress={join.submit} />
      </BottomActionBar>
    </KeyboardStickyView>
  );

  return (
    <Screen
      footer={footer}
      header={<AppBar title="Tham gia nhóm" onBack={router.back} />}
      keyboardAware
    >
      <View className="gap-md py-md">
        <Text className="text-body-md text-fg-2">
          Dán liên kết mời hoặc nhập mã mời mà quản trị viên gửi cho bạn.
        </Text>

        {/* ⚠️ Mã mời PHÂN BIỆT hoa/thường: `Input` đã đặt `autoCapitalize="none"` + `autoCorrect={false}` mặc
            định (bàn phím viết hoa chữ đầu hay "sửa" mã là đổi token), thêm `spellCheck={false}` để Android
            không gạch chân đỏ chuỗi ngẫu nhiên. Không `maxLength`: cắt lặng lẽ một link dài là mất đúng phần
            token nằm cuối. */}
        <Input
          clearable
          clearLabel="Xoá liên kết hoặc mã mời"
          label="Liên kết hoặc mã mời"
          message={join.error ?? undefined}
          placeholder="Dán liên kết hoặc nhập mã mời"
          returnKeyType="go"
          spellCheck={false}
          value={join.value}
          onChangeText={join.change}
          onSubmitEditing={join.submit}
        />

        <View className="gap-sm">
          <Button
            fullWidth
            iconLeft="link"
            label="Dán từ bộ nhớ tạm"
            variant="secondary"
            onPress={() => void join.paste()}
          />
          <Button
            fullWidth
            iconLeft="qr"
            label="Quét mã QR"
            variant="secondary"
            onPress={() => router.push(PATHS.WORKSPACES_SCAN)}
          />
        </View>
      </View>
    </Screen>
  );
}
