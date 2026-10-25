import { router } from 'expo-router';
import { View } from 'react-native';

import { PATHS } from '@/shell/config';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { InviteScanner } from '../components/InviteScanner';
import { useCameraModule } from '../hooks/useCameraModule';

/**
 * Quét mã QR của link mời (`InviteCreatedSheet` hiện mã) → mở đúng màn xem trước/tham gia.
 *
 * ⚠️ `expo-camera` là module NATIVE thêm SAU bản dev client đang cài: nạp động trong `useCameraModule` và, khi
 * thiếu, hiện "chưa hỗ trợ quét mã" thay vì đỏ màn. Muốn quét thật phải build lại dev client
 * (`npm run start:android` có guard tự build khi dấu vân tay native đổi).
 *
 * ⛔ Nút "Nhập mã thủ công" LUÔN có, ở mọi trạng thái (đang nạp, thiếu module, chưa cấp quyền, đang quét): quét
 * là đường tiện, không phải đường duy nhất — máy ảo/máy không camera/quyền bị chặn vẫn phải tham gia được nhóm.
 */
export function ScanInviteScreen() {
  const camera = useCameraModule();

  return (
    <Screen header={<AppBar title="Quét mã QR" onBack={router.back} />}>
      <View className="gap-md py-md">
        {camera.status === 'ready' ? (
          <InviteScanner camera={camera.module} />
        ) : camera.status === 'unavailable' ? (
          <EmptyState
            description="Bản cài đặt này chưa hỗ trợ quét mã. Hãy nhập mã thủ công"
            icon="qr"
            tone="neutral"
          />
        ) : (
          <Skeleton className="aspect-square w-full rounded-md" />
        )}

        {/* `dismissTo`: màn nhập tay thường đã nằm ngay dưới trong ngăn xếp (mở từ đó) — lùi về CHÍNH nó thay vì
            chồng thêm một bản thứ hai (Back sẽ phải đi qua hai màn nhập giống hệt nhau). */}
        <Button
          fullWidth
          iconLeft="keyboard"
          label="Nhập mã thủ công"
          variant="secondary"
          onPress={() => router.dismissTo(PATHS.WORKSPACES_JOIN)}
        />
      </View>
    </Screen>
  );
}
