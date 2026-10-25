import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ZoomableShareView } from '../../../components/stage/ZoomableShareView';

/**
 * Khung phóng màn hình chia sẻ (app.md §3.2 `ZoomableShareView`).
 *
 * ⚠️ CHƯA KIỂM CHỨNG cử chỉ: pinch, kéo khi đã phóng, chạm đúp 1×↔2× là của gesture-handler + reanimated trên luồng UI — Jest chỉ có bản giả
 * (`react-native-gesture-handler/jestSetup`) nên không mô phỏng được. Ở đây chỉ chắc rằng khung dựng được và cho con hiển thị; phần cử chỉ
 * phải thử trên Android + iPad (báo cáo p2-05).
 */
describe('ZoomableShareView', () => {
  it('dựng được và hiện nội dung con', async () => {
    await render(
      <ZoomableShareView>
        <Text>Màn hình chia sẻ</Text>
      </ZoomableShareView>,
    );

    expect(screen.getByText('Màn hình chia sẻ')).toBeOnTheScreen();
  });

  it('nhận `onTap` mà không ném lỗi khi dựng', async () => {
    await render(
      <ZoomableShareView onTap={jest.fn()}>
        <Text>Màn hình chia sẻ</Text>
      </ZoomableShareView>,
    );

    expect(screen.getByText('Màn hình chia sẻ')).toBeOnTheScreen();
  });
});
