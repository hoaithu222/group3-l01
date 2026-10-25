import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { Toggle } from '@/shared/ui/toggle';

import type { PortfolioProject } from '../../api/portfolio.types';
import { projectSummaryLine } from '../../utils/portfolio-text';
import { ProjectCover } from './ProjectCover';

export interface PortfolioProjectRowProps {
  project: PortfolioProject;
  /** Vị trí (0-based) và tổng số — khoá nút lên ở đầu, nút xuống ở cuối. */
  index: number;
  count: number;
  /** Đang lưu một thay đổi (ẩn/hiện, đổi thứ tự) — khoá điều khiển để lượt sau không va `expectedVersion` của lượt trước. */
  busy: boolean;
  onOpen: () => void;
  onToggleVisible: (visible: boolean) => void;
  onMove: (direction: -1 | 1) => void;
}

/**
 * Một dự án trong danh sách (app.md p6-07 §3): tiêu đề, "40 task · 62 điểm", ẩn/hiện, lên/xuống. Sắp xếp bằng NÚT chứ không kéo thả (§7): người dùng TalkBack/không kéo
 * được vẫn đổi thứ tự; nhãn nói rõ dự án nào ("Chuyển <tên> lên"). Phần chữ bấm được để sửa dự án; hàng điều khiển nằm RIÊNG bên dưới để hai vùng chạm không đè nhau.
 */
export function PortfolioProjectRow({
  busy,
  count,
  index,
  onMove,
  onOpen,
  onToggleVisible,
  project,
}: PortfolioProjectRowProps) {
  const summary = projectSummaryLine(project.snapshot);

  return (
    <Card>
      <View className="gap-xs">
        <Pressable
          accessibilityHint="Mở để sửa dự án"
          accessibilityLabel={`${project.title}, ${summary}${project.visible ? '' : ', đang ẩn'}`}
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-sm active:opacity-70"
          onPress={onOpen}
        >
          {/* Ảnh bìa thật khi dự án có (`ProjectCover` chỉ gắn lúc có asset — không sinh truy vấn thừa); chưa có thì ô icon cùng cỡ 64dp
              để cột chữ của mọi dự án thẳng hàng. */}
          {project.coverAssetId ? (
            <ProjectCover assetId={project.coverAssetId} />
          ) : (
            <IconTile name="document-2" size="xl" tone={project.visible ? 'brand' : 'neutral'} />
          )}
          <View className="flex-1 gap-3xs">
            <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
              {project.title}
            </Text>
            <View className="flex-row flex-wrap items-center gap-xs">
              <Text className="text-body-md text-fg-2">{summary}</Text>
              {project.visible ? null : <Badge label="Đang ẩn" size="sm" variant="neutral" />}
            </View>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-xs">
          <View className="flex-1">
            <Toggle
              accessibilityLabel={`Hiện ${project.title} trên trang`}
              disabled={busy}
              label="Hiện trên trang"
              size="sm"
              value={project.visible}
              onChange={onToggleVisible}
            />
          </View>
          <Button
            accessibilityLabel={`Chuyển ${project.title} lên`}
            disabled={busy || index === 0}
            iconLeft="arrow-up-small"
            iconOnly
            size="sm"
            variant="tertiary"
            onPress={() => onMove(-1)}
          />
          <Button
            accessibilityLabel={`Chuyển ${project.title} xuống`}
            disabled={busy || index === count - 1}
            iconLeft="arrow-down-small"
            iconOnly
            size="sm"
            variant="tertiary"
            onPress={() => onMove(1)}
          />
        </View>
      </View>
    </Card>
  );
}
