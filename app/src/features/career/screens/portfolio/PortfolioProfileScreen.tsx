import { PortfolioLoadGate } from '../../components/portfolio/PortfolioLoadGate';
import { PortfolioProfileEditor } from '../../components/portfolio/PortfolioProfileEditor';

/**
 * Sửa thông tin hồ sơ (app.md p6-07 §3): tải hồ sơ (`PortfolioLoadGate`) rồi giao cho `PortfolioProfileEditor` (form + slug + nút Lưu). Chưa có hồ sơ (`portfolio: null`) vẫn mở form —
 * lần lưu đầu tạo hồ sơ.
 */
export function PortfolioProfileScreen() {
  return (
    <PortfolioLoadGate title="Thông tin hồ sơ">
      {(overview, reload) => (
        <PortfolioProfileEditor
          portfolio={overview.portfolio}
          reload={async () => (await reload())?.portfolio}
        />
      )}
    </PortfolioLoadGate>
  );
}
