import { router } from 'expo-router';

import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';
import { PATHS } from '@/shell/config';

/**
 * Màn "Tính năng này hiện chưa được bật" (p0-07 `app.md` §3) — thay nội dung phân hệ mà cờ ở backend đang TẮT.
 *
 * ⛔ KHÔNG hiện tên cờ kỹ thuật (`communication`) cho người dùng. Tiêu đề là tiêu đề trang (`accessibilityRole="header"`
 * do `EmptyState`), nút cao ≥ 44 pt (`Button` chung).
 *
 * "Về trang chính" đưa tới **Trang chủ** (`PATHS.HOME`), KHÔNG phải `/workspaces` như `app.md` ghi: khi cờ `communication`
 * tắt thì chính tab Nhóm cũng bị tắt — nút sẽ dẫn vòng lại màn này. Trang chủ không gắn cờ nên luôn vào được.
 */
export function FeatureOffScreen() {
  return (
    <Screen scrollable={false}>
      {/* Hình minh hoạ chuẩn của `EmptyState` (quầng + icon hai tông): tia sét gạch (`flash-off`) = "đang tắt", tông trung
          tính — không phải lỗi của người dùng, cũng không nguy hiểm. Bản trước là chuông `fg-3` nhạt, sai nghĩa. */}
      <EmptyState
        actions={[{ label: 'Về trang chính', onPress: () => router.replace(PATHS.HOME) }]}
        description="Quản trị viên chưa bật tính năng này. Bạn sẽ dùng được khi nó được bật."
        fullscreen
        icon="flash-off"
        title="Tính năng này hiện chưa được bật"
        tone="neutral"
      />
    </Screen>
  );
}
