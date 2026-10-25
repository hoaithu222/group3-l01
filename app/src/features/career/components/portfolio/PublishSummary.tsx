import { Text } from 'react-native';

import type { Portfolio } from '../../api/portfolio.types';
import { useMyCareer, useMySkills } from '../../queries/career.queries';
import { publishSummary } from '../../utils/portfolio-publish-check';

export interface PublishSummaryProps {
  portfolio: Portfolio;
  /** Số dự án đang HIỆN. */
  visibleProjects: number;
}

/**
 * Câu tóm tắt "Sẽ công khai: số liệu 3 dự án, 4 huy hiệu, giới thiệu, 2 liên kết." (app.md p6-07 §3). Tách thành component riêng vì cần hai truy vấn của `career` (huy hiệu + quyền `showSkills`) — đặt trong
 * tấm nên CHỈ chạy khi tấm mở (`Modal` ẩn thì không dựng con), không kéo thêm hai lượt gọi và có thể là hai toast lỗi vào mỗi lần mở màn Tổng quan.
 * Huy hiệu chỉ lên trang khi người dùng cho phép hiện (`showSkills`); chưa biết (đang tải) thì tính theo mặc định của BE (bật).
 */
export function PublishSummary({ portfolio, visibleProjects }: PublishSummaryProps) {
  const skills = useMySkills();
  const career = useMyCareer();
  const showSkills = career.data?.visibility.showSkills ?? true;
  const badges = showSkills ? (skills.data ?? []).filter((badge) => !badge.revoked).length : 0;

  return (
    <Text className="text-body-md text-fg-1">
      {publishSummary({
        badges,
        hasBio: (portfolio.bio ?? '').trim().length > 0,
        links: portfolio.links.length,
        visibleProjects,
      })}
    </Text>
  );
}
