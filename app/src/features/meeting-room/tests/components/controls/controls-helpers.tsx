import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

/**
 * Đồ dùng chung cho test nhóm `controls/`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`).
 *
 * ⚠️ `BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider; `initialMetrics` bắt buộc vì trong Jest không có tầng native nào đo
 * được (thiếu nó provider chờ `onLayout` mãi mãi). Số đo của iPhone X: 44 trên, 34 dưới.
 */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export const renderWithInsets = (ui: ReactElement) => render(ui, { wrapper: Wrapper });
