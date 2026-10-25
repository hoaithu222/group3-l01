import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import { TurnOffDialog } from '../components/TurnOffDialog';

/**
 * "Tính năng này hiện chưa khả dụng" — thay MỌI màn của nhánh `me/wellbeing` khi cờ `burnout` đang TẮT (app.md p7-03 §1: điểm vào ẩn khi cờ tắt; deep link vẫn có thể tới đây).
 * ⛔ Nhưng KHÔNG chặn quyền của người dùng: BE luôn nhận `PUT optIn:false` (và `DELETE …/data`) kể cả khi admin tắt phân hệ. Người từng bật theo dõi rồi bị tắt phân hệ vẫn có dữ liệu nằm ở máy chủ —
 * họ phải tắt và xoá được mà không phải chờ ai bật lại tính năng. App không biết họ đã từng bật hay chưa (mọi lệnh đọc đều 404 khi cờ tắt) nên nút hiện cho mọi người, câu chữ nói "nếu trước đây…".
 * Chỉ MỘT hành động (tắt và xoá): "chỉ xoá mà giữ theo dõi" cần biết theo dõi có đang bật, mà lúc này không hỏi được.
 */
export function WellbeingUnavailableScreen() {
  const [confirming, setConfirming] = useState(false);
  const offline = useConnectionState() === 'offline';

  return (
    <Screen header={<AppBar title="Sức khoẻ học tập" onBack={router.back} />}>
      <View className="gap-xl py-xs">
        <EmptyState
          description="Quản trị viên chưa bật tính năng này. Khi được bật, bạn sẽ tự quyết định có dùng hay không."
          icon="favorite"
          title="Tính năng này hiện chưa khả dụng"
          tone="neutral"
        />
        <Card title="Dữ liệu của bạn">
          <View className="gap-md">
            <Text className="text-body-md text-fg-2">
              Nếu trước đây bạn từng bật theo dõi, bạn vẫn có thể tắt và xoá toàn bộ dữ liệu đã thu
              thập bất cứ lúc nào, kể cả khi tính năng đang tạm dừng.
            </Text>
            <Button
              disabled={offline}
              fullWidth
              iconLeft="delete"
              label="Tắt theo dõi và xoá dữ liệu"
              variant="danger-secondary"
              onPress={() => setConfirming(true)}
            />
            {offline ? (
              <Text className="text-center text-body-md text-fg-2">
                Đang ngoại tuyến — cần có mạng để thực hiện.
              </Text>
            ) : null}
          </View>
        </Card>
      </View>
      <TurnOffDialog
        visible={confirming}
        onClose={() => setConfirming(false)}
        onDone={() => {
          setConfirming(false);
          router.back();
        }}
      />
    </Screen>
  );
}
