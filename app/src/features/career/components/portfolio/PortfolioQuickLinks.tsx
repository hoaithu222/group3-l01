import { router } from 'expo-router';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { Portfolio } from '../../api/portfolio.types';
import { PORTFOLIO_APPEARANCE_HREF, PORTFOLIO_PROFILE_HREF } from '../../utils/portfolio-routes';
import { themeSummary } from '../../utils/portfolio-text';

const ARROW = <Icon color="fg-2" name="arrow-right-small" size="sm" />;

export interface PortfolioQuickLinksProps {
  portfolio: Portfolio | null;
  /** Không truyền ⇒ ẩn hàng "Xem trước" (máy tính bảng rộng đã có khung xem trước cạnh danh sách). */
  onPreview?: () => void;
}

/**
 * Ba lối vào của màn Tổng quan (app.md p6-07 §1): Thông tin · Giao diện · Xem trước (hàng cuối chỉ có khi truyền `onPreview`). Giao diện và Xem trước cần HỒ SƠ đã tồn tại (BE 404 khi chưa có) nên khoá kèm câu nói rõ cách
 * mở khoá — hồ sơ được tạo khi thêm dự án đầu tiên hoặc lưu Thông tin lần đầu.
 *
 * Mỗi hàng mở đầu bằng ô icon xoay tông (brand · accent · info — cùng khuôn hàng điều hướng màn Tôi); hàng đang khoá dùng tông trung tính
 * để đọc ra "chưa dùng được" cả bằng hình, không chỉ bằng chữ mờ. `emphasis="title"`: tiêu đề là chữ chính, mô tả là chữ phụ.
 */
export function PortfolioQuickLinks({ onPreview, portfolio }: PortfolioQuickLinksProps) {
  const locked = 'Thêm dự án hoặc lưu thông tin hồ sơ trước.';

  return (
    <Card className="px-md py-2xs" padded={false}>
      <ListItem
        className="py-xs"
        description="Tên, tiêu đề, giới thiệu, ảnh, liên kết, đường dẫn"
        divider
        emphasis="title"
        label="Thông tin hồ sơ"
        leading={<IconTile name="user-edit" tone="brand" />}
        trailing={ARROW}
        value={portfolio?.displayName ?? 'Chưa nhập'}
        onPress={() => router.push(PORTFOLIO_PROFILE_HREF)}
      />
      <ListItem
        className="py-xs"
        description={portfolio ? 'Mẫu, màu nhấn, các mục trên trang' : locked}
        disabled={!portfolio}
        divider={onPreview !== undefined}
        emphasis="title"
        label="Giao diện"
        leading={<IconTile name="image" tone={portfolio ? 'accent' : 'neutral'} />}
        trailing={ARROW}
        value={portfolio ? themeSummary(portfolio.theme) : undefined}
        onPress={() => router.push(PORTFOLIO_APPEARANCE_HREF)}
      />
      {onPreview ? (
        <ListItem
          className="py-xs"
          description={portfolio ? 'Xem bản nháp như người khác sẽ thấy' : locked}
          disabled={!portfolio}
          emphasis="title"
          label="Xem trước"
          leading={<IconTile name="view" tone={portfolio ? 'info' : 'neutral'} />}
          trailing={ARROW}
          onPress={onPreview}
        />
      ) : null}
    </Card>
  );
}
