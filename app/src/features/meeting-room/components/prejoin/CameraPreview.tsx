import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { CallVideoStyle } from '@/core/media/call-media.types';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';

export interface CameraPreviewProps {
  /** Camera đang BẬT theo lựa chọn ở pre-join. Tắt ⇒ khung chỉ hiện avatar + chữ "Camera đang tắt", không mở camera. */
  camOn: boolean;
  /** Tên hiển thị hiện tại — chữ viết tắt của avatar khi chưa có hình + nhãn tên ở góc khung. */
  displayName: string;
  facing: 'back' | 'front';
  onFlipCamera: () => void;
  /** Mảnh mờ đục do `MeetingMediaPort.startPreview` trả về; `null` khi chưa mở được (đang mở, hoặc bị từ chối quyền). */
  previewRef: unknown;
  /** Cha truyền hàm vẽ video (không import registry media trong component để test không cần SDK native). */
  renderVideo: (ref: unknown, style?: CallVideoStyle) => ReactNode;
}

/**
 * Khung xem trước camera kiểu "phòng chờ" của Google Meet (app.md p2-05 §3.2): khung bo `rounded-md` nền mực, CHỈ có video khi camera bật
 * VÀ đã mở được — mặc định tắt, đúng luật "không tự bật mic/camera ở bất kỳ bước nào". Camera trước được LẬT GƯƠNG (như soi gương — người
 * dùng quen thế); camera sau thì không. Mọi trạng thái đều bằng CHỮ ("Camera đang tắt", "Đang mở camera…", "Đang dùng camera trước").
 *
 * ✅ Nhãn tên (góc dưới trái) + nút "Đổi camera" (góc trên phải, chỉ hiện khi camera bật — nó vô nghĩa khi không có hình) nằm TRÊN khung
 * thay cho hàng riêng bên dưới: trả lại ~48dp chiều cao để công tắc thiết bị + ô tên lọt màn đầu ở máy 320dp.
 * ⛔ Nút bật/tắt camera KHÔNG nằm ở đây mà ở `DeviceToggleRow` (một nơi duy nhất cho mic + camera, có trạng thái đọc được bằng `switch`).
 *
 * ⚠️ Video nằm trong lớp `absolute inset-0`: `VideoTrack` của SDK đi kèm `flex: 1`, mà cha canh giữa (`items-center`) sẽ co bề rộng
 * của nó về 0 — hình biến mất, không lỗi nào báo. ⚠️ CHƯA XÁC MINH trên thiết bị thật.
 */
export function CameraPreview({
  camOn,
  displayName,
  facing,
  onFlipCamera,
  previewRef,
  renderVideo,
}: CameraPreviewProps) {
  const showVideo = camOn && previewRef !== null && previewRef !== undefined;
  const side = facing === 'front' ? 'trước' : 'sau';
  const name = displayName.trim();

  return (
    <View className="gap-xs">
      {/* 16:9 (không vuông): camera MẶC ĐỊNH TẮT nên khung này phần lớn chỉ là avatar trên nền đen — hình vuông 343dp chiếm ~½ chiều cao màn và
          đẩy công tắc mic/camera + ô tên xuống dưới nếp gập. Xoay ngang: khung nằm ở CỘT TRÁI (xem `PreJoinView`) nên vẫn vừa màn. */}
      <View className="aspect-video w-full items-center justify-center overflow-hidden rounded-md bg-ink-10">
        {showVideo ? (
          <View className="absolute inset-0">
            {renderVideo(previewRef, { mirror: facing === 'front', objectFit: 'cover' })}
          </View>
        ) : (
          <View className="items-center gap-xs px-md">
            <Avatar name={name || undefined} size="lg" />
            <Text className="text-center text-label-md text-fg-on-nav-muted">
              {camOn ? 'Đang mở camera…' : 'Camera đang tắt'}
            </Text>
          </View>
        )}
        {name ? (
          // Nhãn tên trên nền `overlay` (đọc được trên mọi khung hình) — chính là tên người khác thấy trên ô của mình trong phòng.
          // `right-6xl` chừa góc phải; `items-start` để viên nhãn ôm chữ, tên dài thì cắt một dòng.
          <View className="absolute bottom-xs left-xs right-6xl items-start">
            <View className="rounded-full bg-overlay px-xs py-3xs">
              <Text className="text-label-sm text-fg-on-nav" numberOfLines={1}>
                {name}
              </Text>
            </View>
          </View>
        ) : null}
        {camOn ? (
          // Nền `overlay` sau nút viền trắng: trên khung hình SÁNG (tường trắng) nút trắng trần sẽ chìm mất.
          <View className="absolute right-xs top-xs rounded-full bg-overlay">
            <Button
              accessibilityLabel="Đổi camera trước hoặc sau"
              iconLeft="reload"
              iconOnly
              size="sm"
              variant="white-secondary"
              onPress={onFlipCamera}
            />
          </View>
        ) : null}
      </View>

      <Text className="text-caption-lg text-fg-2">
        {camOn ? `Đang dùng camera ${side}.` : 'Bật camera để xem trước hình của bạn.'}
      </Text>
    </View>
  );
}
