import { useLocalSearchParams } from 'expo-router';

import { PortfolioLoadGate } from '../../components/portfolio/PortfolioLoadGate';
import { PortfolioProjectResolver } from '../../components/portfolio/PortfolioProjectResolver';

/** Sửa một dự án trong hồ sơ (app.md p6-07 §3 "Sửa dự án"): số liệu hệ thống + form nội dung + xoá. Route `projects/[projectId]`. */
export function PortfolioProjectScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  return (
    <PortfolioLoadGate title="Sửa dự án">
      {(overview, reload) => (
        <PortfolioProjectResolver
          projectId={projectId ?? ''}
          projects={overview.projects}
          reload={reload}
        />
      )}
    </PortfolioLoadGate>
  );
}
