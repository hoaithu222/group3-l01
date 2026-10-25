import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';

import type { Portfolio, PortfolioBuild } from '../../api/portfolio.types';
import { isBuildInFlight } from '../../utils/portfolio-cache';

export interface PortfolioPublishBarProps {
  portfolio: Portfolio | null;
  latestBuild: PortfolioBuild | null;
  offline: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}

/**
 * Thanh hành động dính đáy của màn Tổng quan (app.md p6-07 §3): **Công khai** / **Cập nhật trang** / **Ngừng công khai**. Trạng thái quyết định nút:
 *  · chưa có hồ sơ hoặc BỊ GỠ ⇒ không có thanh (thẻ trạng thái đã giải thích; công khai khi bị gỡ chỉ nhận `PORT_008`);
 *  · đang dựng trang ⇒ MỘT nút khoá "Đang tạo trang…" (không cho bấm chồng — BE cũng chặn `PORT_009`);
 *  · đã công khai ⇒ "Cập nhật trang" (nổi bật khi có thay đổi chưa lên trang) + "Ngừng công khai";
 *  · nháp/đã ngừng ⇒ "Công khai". Offline ⇒ khoá mọi nút ghi.
 */
export function PortfolioPublishBar({
  latestBuild,
  offline,
  onPublish,
  onUnpublish,
  portfolio,
}: PortfolioPublishBarProps) {
  if (!portfolio || portfolio.takenDown) return null;

  if (isBuildInFlight(latestBuild)) {
    return (
      <BottomActionBar>
        <Button disabled fullWidth label="Đang tạo trang…" loading />
      </BottomActionBar>
    );
  }

  if (portfolio.status === 'PUBLISHED') {
    return (
      <BottomActionBar>
        <Button
          disabled={offline}
          fullWidth
          label="Cập nhật trang"
          variant={portfolio.hasUnpublishedChanges ? 'primary' : 'secondary'}
          onPress={onPublish}
        />
        <Button
          disabled={offline}
          fullWidth
          label="Ngừng công khai"
          variant="tertiary"
          onPress={onUnpublish}
        />
      </BottomActionBar>
    );
  }

  return (
    <BottomActionBar>
      <Button disabled={offline} fullWidth label="Công khai" onPress={onPublish} />
    </BottomActionBar>
  );
}
