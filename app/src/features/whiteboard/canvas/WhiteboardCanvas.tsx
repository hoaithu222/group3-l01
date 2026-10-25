import { View } from 'react-native';
import { GestureDetector, type ComposedGesture } from 'react-native-gesture-handler';

import { useThemeColors } from '@/shared/theme';

import type { WhiteboardPictures } from '../hooks/useWhiteboardPictures';
import type { WhiteboardCamera } from '../hooks/useWhiteboardCamera';
import type { SkiaModule } from './skia-module';

export interface WhiteboardCanvasProps {
  camera: WhiteboardCamera;
  /** Số phần tử — chỉ để đọc cho trình đọc màn hình ("Bảng trắng, 12 phần tử"): canvas Skia không có cây trợ năng bên trong. */
  elementCount: number;
  gesture: ComposedGesture;
  pictures: WhiteboardPictures;
  skia: SkiaModule;
}

/**
 * Canvas Skia toàn màn (app.md §2 `WhiteboardCanvas`). Ba lớp `Picture` (cảnh · lớp phủ · con trỏ người khác) nằm trong MỘT `Group` mang ma trận
 * camera là `DerivedValue` — pan/zoom chạy hoàn toàn trên UI thread, không dựng lại gì ở JS. Nền đặc `bg-1` theo theme (tối/sáng) vẽ bằng `Fill`.
 *
 * ⚠️ `Canvas.onLayout` bị Skia đánh dấu lỗi thời trên Fabric — đo kích thước ở `View` bọc ngoài. `collapsable={false}` bắt buộc cho
 * `GestureDetector` (không thì Android gộp mất `View` và cử chỉ không gắn được).
 * ⚠️ Canvas không có cây trợ năng bên trong (chỉ là một mặt vẽ): vì vậy có nhãn tổng quát; "Danh sách nội dung" đọc được từng phần tử là việc của P1 (app.md §7).
 */
export function WhiteboardCanvas({
  camera,
  elementCount,
  gesture,
  pictures,
  skia,
}: WhiteboardCanvasProps) {
  const { Canvas, Fill, Group, Picture } = skia;
  const colors = useThemeColors();

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityLabel={`Bảng trắng, ${elementCount} phần tử`}
        accessible
        className="flex-1"
        collapsable={false}
        testID="whiteboard-canvas"
        onLayout={(event) => camera.onLayout(event.nativeEvent.layout)}
      >
        <Canvas style={{ flex: 1 }}>
          <Fill color={colors['bg-1']} />
          <Group transform={camera.transform}>
            {pictures.scene ? <Picture picture={pictures.scene} /> : null}
            {pictures.overlay ? <Picture picture={pictures.overlay} /> : null}
            {pictures.cursors ? <Picture picture={pictures.cursors} /> : null}
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}
