import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { showToast } from '@/shared/utils/toast.utils';

import type { RoadmapPracticeSetSummaryDto, RoadmapResourceDto } from '../../api/roadmap.types';
import { RESOURCE_KIND_META } from '../../constants/roadmap.constants';
import { BlockList } from '../blocks/BlockList';
import { PracticeSetsSection } from './PracticeSetsSection';

export interface ResourcesTabProps {
  header?: ReactNode;
  /** Bộ luyện tập gắn với buổi (be.md §4 `LessonDto.practiceSets[]`) — hiện khối "Luyện tập" ở đầu tab (bước 12, P1). */
  practiceSets: readonly RoadmapPracticeSetSummaryDto[];
  resources: readonly RoadmapResourceDto[];
}

/** Link mở được trong trình duyệt — link tương đối của giáo trình (`./code/x.html`) không có gì để mở trong app. */
const OPENABLE_URL = /^https?:\/\//i;

function openUrl(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => showToast('error', 'Không mở được liên kết này.'));
}

function Chevron() {
  return <Icon color="fg-2" name="arrow-right-small" size="sm" />;
}

/**
 * Tệp (`kind: 'FILE'`, thường PDF) — xin URL ký lúc chạm, KHÔNG tải trước cho mọi hàng. Chạm lần đầu (chưa có URL) thì
 * xin rồi MỞ LUÔN — bản trước chỉ xin URL, người học phải chạm lần hai và tưởng lần đầu bị lỗi.
 */
function FileResourceRow({
  divider,
  resource,
}: {
  divider: boolean;
  resource: RoadmapResourceDto;
}) {
  const { data, isFetching, refetch } = useAssetUrl(resource.assetId ?? undefined);
  const meta = RESOURCE_KIND_META.FILE;
  const open = () => {
    if (data) return openUrl(data.url);
    if (isFetching) return;
    void refetch().then((result) => {
      if (result.data) openUrl(result.data.url);
      else showToast('error', 'Không tải được tệp này.');
    });
  };
  return (
    <ListItem
      description={resource.note ?? undefined}
      divider={divider}
      emphasis="title"
      label={resource.title}
      leading={<IconTile name={meta.icon} size="sm" tone={meta.tone} />}
      trailing={<Chevron />}
      onPress={open}
    />
  );
}

function ResourceRow({
  divider,
  onOpenNote,
  resource,
}: {
  divider: boolean;
  onOpenNote: (resource: RoadmapResourceDto) => void;
  resource: RoadmapResourceDto;
}) {
  if (resource.kind === 'FILE' && !resource.url && resource.assetId) {
    return <FileResourceRow divider={divider} resource={resource} />;
  }
  const meta = RESOURCE_KIND_META[resource.kind];
  const url = resource.url && OPENABLE_URL.test(resource.url) ? resource.url : null;
  const isNote = resource.kind === 'NOTE';
  return (
    <ListItem
      description={
        resource.note ?? (!isNote && !url ? 'Tài liệu này chưa có liên kết mở được' : undefined)
      }
      disabled={!isNote && !url}
      divider={divider}
      emphasis="title"
      label={resource.title}
      leading={<IconTile name={meta.icon} size="sm" tone={meta.tone} />}
      trailing={isNote || url ? <Chevron /> : undefined}
      onPress={isNote ? () => onOpenNote(resource) : url ? () => openUrl(url) : undefined}
    />
  );
}

/** Nhóm hiển thị theo `resource.group` (README §3 quyết định "Nhóm hiển thị… tự do") — thiếu nhóm ⇒ "Khác". */
function groupResources(
  resources: readonly RoadmapResourceDto[],
): [string, RoadmapResourceDto[]][] {
  const byGroup = new Map<string, RoadmapResourceDto[]>();
  for (const resource of resources) {
    const key = resource.group ?? 'Khác';
    byGroup.set(key, [...(byGroup.get(key) ?? []), resource]);
  }
  return Array.from(byGroup.entries());
}

/**
 * Tab Tài liệu (app.md §3): link phân nhóm + cheatsheet (`NOTE`, mở sheet render khối) + tệp PDF. Mỗi hàng có ô icon
 * theo LOẠI (video/công cụ/tệp/ghi chú) để quét nhanh, tiêu đề chữ chính + lý do nên đọc làm dòng phụ.
 *
 * ⚠️ Thẻ nhóm tự có lề ngang `px-md`: `ListItem` không tự có lề (nó vốn nằm trong `Card` đã đệm) — bản trước đặt
 * hàng thẳng vào khối nền trắng nên icon và chữ dính sát mép thẻ (ui-components.md §5).
 */
export function ResourcesTab({ header, practiceSets, resources }: ResourcesTabProps) {
  const [openNote, setOpenNote] = useState<RoadmapResourceDto | null>(null);

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-md px-md pb-xl pt-xs"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {header}
        {practiceSets.length === 0 && resources.length === 0 ? (
          <EmptyState
            description="Buổi này chưa có tài liệu đính kèm."
            icon="document"
            title="Chưa có tài liệu"
            tone="success"
          />
        ) : null}
        <PracticeSetsSection practiceSets={practiceSets} />
        {groupResources(resources).map(([group, items]) => (
          <Section key={group} title={group}>
            <View className="rounded-md bg-bg-1 px-md py-2xs">
              {items.map((resource, index) => (
                <ResourceRow
                  key={resource.id}
                  divider={index < items.length - 1}
                  resource={resource}
                  onOpenNote={setOpenNote}
                />
              ))}
            </View>
          </Section>
        ))}
      </ScrollView>

      <BottomSheet
        scrollable
        title={openNote?.title}
        visible={openNote !== null}
        onClose={() => setOpenNote(null)}
      >
        {openNote ? (
          openNote.blocks && openNote.blocks.length > 0 ? (
            <BlockList blocks={openNote.blocks} />
          ) : (
            // ✅ `EmptyState` gọn thay dòng chữ trơ trọi ở góc trái tấm — cùng dáng "chưa có gì" với mọi tấm khác.
            <EmptyState description="Chưa có nội dung." icon="document" size="compact" />
          )
        ) : null}
      </BottomSheet>
    </>
  );
}
