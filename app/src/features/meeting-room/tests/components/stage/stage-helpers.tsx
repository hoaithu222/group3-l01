import { Text } from 'react-native';

import type { RenderVideo } from '../../../components/stage/stage.types';

/**
 * Đồ dùng chung cho test nhóm `stage/`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`).
 *
 * `renderVideo` giả vẽ chữ `VIDEO:<ref>` để test biết ô nào nhận được video và với tham số nào — component `stage/` không import registry
 * media (không cần SDK LiveKit native trong Jest), nên hàm này được truyền qua props như ở production.
 */
export function makeRenderVideo() {
  return jest.fn<ReturnType<RenderVideo>, Parameters<RenderVideo>>((ref) => <Text>{`VIDEO:${String(ref)}`}</Text>);
}
