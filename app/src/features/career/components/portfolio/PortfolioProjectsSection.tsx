import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';

import type { PortfolioProject } from '../../api/portfolio.types';
import { CAREER_TONE } from '../../constants/career-visuals.constants';
import { PortfolioProjectRow } from './PortfolioProjectRow';

export interface PortfolioProjectsSectionProps {
  projects: PortfolioProject[];
  /** `limits.projectsMax` — hết chỗ thì khoá nút thêm và nói rõ vì sao. */
  max: number;
  busy: boolean;
  offline: boolean;
  onAdd: () => void;
  onOpen: (projectId: string) => void;
  onToggleVisible: (project: PortfolioProject, visible: boolean) => void;
  onMove: (projectId: string, direction: -1 | 1) => void;
}

/**
 * Khối "Dự án" của màn Tổng quan (app.md p6-07 §3): danh sách theo thứ tự trang công khai + "Thêm dự án". Rỗng ⇒ lời mời tạo hồ sơ từ dự án đã góp sức (không phải
 * lỗi: hồ sơ chỉ được TẠO khi có dự án đầu tiên hoặc khi lưu Thông tin).
 */
export function PortfolioProjectsSection({
  busy,
  max,
  offline,
  onAdd,
  onMove,
  onOpen,
  onToggleVisible,
  projects,
}: PortfolioProjectsSectionProps) {
  const full = projects.length >= max;

  if (projects.length === 0) {
    return (
      <Section icon="document-2" title="Dự án">
        <EmptyState
          actions={[{ label: 'Thêm dự án đầu tiên', onPress: onAdd }]}
          description="Chọn dự án bạn đã góp sức để tạo hồ sơ. Số liệu lấy từ hệ thống, bạn không phải tự khai."
          icon="add-image"
          size="compact"
          title="Chưa có dự án nào"
          tone={CAREER_TONE}
        />
      </Section>
    );
  }

  return (
    <Section icon="document-2" title={`Dự án (${projects.length}/${max})`}>
      <View className="gap-sm">
        {projects.map((project, index) => (
          <PortfolioProjectRow
            key={project.id}
            busy={busy || offline}
            count={projects.length}
            index={index}
            project={project}
            onMove={(direction) => onMove(project.id, direction)}
            onOpen={() => onOpen(project.id)}
            onToggleVisible={(visible) => onToggleVisible(project, visible)}
          />
        ))}
        <Button
          disabled={full || offline}
          iconLeft="add"
          label={full ? `Đã đạt tối đa ${max} dự án` : 'Thêm dự án'}
          variant="secondary"
          onPress={onAdd}
        />
      </View>
    </Section>
  );
}
