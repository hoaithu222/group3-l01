import { router } from 'expo-router';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { useFeature } from '@/shell/capabilities';

import { PORTFOLIO_HREF } from '../../utils/portfolio-routes';

/**
 * Lối vào Portfolio ở màn Nghề nghiệp (app.md p6-07 §1 "thẻ 'Portfolio' khi `useFeature('career')`"). ⚠️ Cố ý TĨNH, không tải hồ sơ để hiện trạng thái: màn Nghề nghiệp mở ra là
 * đã có hai truy vấn của nó, thêm một lượt gọi chỉ để vẽ nhãn "Đã công khai" là đánh đổi không đáng — trạng thái thật nằm ngay màn bên trong. Cờ chưa biết/tắt ⇒ ẩn (không dẫn vào 404).
 * Cờ khẩn cấp `portfolio.enabled` do vận hành tắt thì màn đích hiện "Tính năng chưa bật" (BE trả `CFG_005`).
 */
export function PortfolioEntryCard() {
  const enabled = useFeature('career') === true;
  if (!enabled) return null;

  return (
    <Card title="Portfolio">
      {/* `magic-wand-01`: "một chạm" — trang TỰ dựng từ số liệu hệ thống, người dùng không phải tự khai. */}
      <ListItem
        className="py-xs"
        description="Trang hồ sơ công khai dựng từ dự án và số liệu hệ thống đã ghi nhận"
        emphasis="title"
        label="Portfolio một chạm"
        leading={<IconTile name="magic-wand-01" tone="brand" />}
        trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
        onPress={() => router.push(PORTFOLIO_HREF)}
      />
    </Card>
  );
}
