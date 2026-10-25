import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';

import type { PortfolioOverview, PortfolioProject } from '../../api/portfolio.types';
import { leaveGoneProject } from '../../utils/portfolio-navigation';
import { PortfolioProjectEditor } from './PortfolioProjectEditor';

export interface PortfolioProjectResolverProps {
  projectId: string;
  projects: PortfolioProject[];
  reload: () => Promise<PortfolioOverview | undefined>;
}

/**
 * Tìm dự án theo `projectId` trong cache hồ sơ và giao cho `PortfolioProjectEditor`. Dự án KHÔNG có (đã xoá ở thiết bị khác, link cũ) ⇒ toast "Dự án không còn" rồi rời màn (`leaveGoneProject`, app.md
 * §3) — làm trong EFFECT (điều hướng là hiệu ứng phụ, không ghi trong lúc vẽ); trong lúc đó vẫn vẽ trạng thái "Dự án không còn" + nút quay lại để không có khung trắng và người dùng có lối thoát nếu lùi thất bại.
 *
 * ⚠️ GIỮ bản dự án cuối cùng đã thấy (`lastKnown`, cập nhật ngay trong lúc vẽ — mẫu "điều chỉnh state khi prop đổi", không effect): xoá xong, hook đã gỡ dự án khỏi cache TRƯỚC khi
 * `router.back()` kịp chạy; không giữ bản cuối thì trong ~300 ms chuyển cảnh người dùng thấy nháy "Dự án không còn" (và một toast sai) ngay sau khi vừa bấm xoá.
 */
export function PortfolioProjectResolver({
  projectId,
  projects,
  reload,
}: PortfolioProjectResolverProps) {
  const found = projects.find((item) => item.id === projectId);
  const [lastKnown, setLastKnown] = useState(found);
  if (found && found !== lastKnown) setLastKnown(found);
  const project = found ?? lastKnown;
  const missing = project === undefined;

  useEffect(() => {
    if (missing) leaveGoneProject();
  }, [missing]);

  if (!project) {
    return (
      <Screen header={<AppBar title="Sửa dự án" onBack={router.back} />} scrollable={false}>
        <ScreenState
          action={{ label: 'Quay lại', onPress: router.back }}
          description="Dự án này đã được xoá khỏi hồ sơ."
          state="forbidden"
          title="Dự án không còn"
        />
      </Screen>
    );
  }

  return (
    <PortfolioProjectEditor
      project={project}
      reload={async () => (await reload())?.projects.find((item) => item.id === projectId)}
    />
  );
}
