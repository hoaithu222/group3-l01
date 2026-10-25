import { router } from 'expo-router';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';

import { PortfolioAppearanceEditor } from '../../components/portfolio/PortfolioAppearanceEditor';
import { PortfolioLoadGate } from '../../components/portfolio/PortfolioLoadGate';
import { PORTFOLIO_PROFILE_HREF } from '../../utils/portfolio-routes';

/**
 * Giao diện portfolio (app.md p6-07 §3): mẫu + màu + mục + SEO. Cần hồ sơ ĐÃ CÓ (BE ghi giao diện qua `PUT /me/portfolio` với `expectedVersion` thật) — chưa có thì dẫn sang màn
 * Thông tin để tạo, chứ không tự dựng một hồ sơ mặc định mà người dùng chưa từng nhìn thấy.
 */
export function PortfolioAppearanceScreen() {
  return (
    <PortfolioLoadGate title="Giao diện">
      {({ portfolio }, reload) =>
        portfolio ? (
          <PortfolioAppearanceEditor
            portfolio={portfolio}
            reload={async () => (await reload())?.portfolio}
          />
        ) : (
          <Screen header={<AppBar title="Giao diện" onBack={router.back} />} scrollable={false}>
            <ScreenState
              action={{
                label: 'Nhập thông tin hồ sơ',
                onPress: () => router.replace(PORTFOLIO_PROFILE_HREF),
              }}
              description="Hãy nhập thông tin hồ sơ hoặc thêm dự án đầu tiên, rồi quay lại chọn giao diện."
              icon="edit"
              state="empty"
              title="Chưa có hồ sơ"
            />
          </Screen>
        )
      }
    </PortfolioLoadGate>
  );
}
