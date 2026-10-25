import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';

import type { ListingContentType, ListingPreviewItem } from '../api/marketplace.types';
import { PREVIEW_FALLBACK, PREVIEW_ITEM_VISUAL } from '../constants/marketplace.constants';

export interface ListingPreviewProps {
  contentType: ListingContentType;
  preview: ListingPreviewItem[] | null;
}

/**
 * Xem trước GIỚI HẠN (app.md §3 "preview giới hạn"): tối đa 3 mục đầu của bộ học; RESOURCE không có preview theo mục (BE trả `null`).
 * Mỗi mục có ô icon + CHỮ loại câu (thẻ ghi nhớ, trắc nghiệm…) — người mua biết bộ học gồm dạng bài nào, không chỉ đọc câu hỏi trơn.
 * Mỗi dòng gộp thành MỘT ô trợ năng ("Trắc nghiệm: <câu hỏi>") thay vì hai chặng vuốt rời.
 */
export function ListingPreview({ contentType, preview }: ListingPreviewProps) {
  if (contentType !== 'STUDY_SET' || !preview || preview.length === 0) return null;

  return (
    <Section icon="view" title="Xem trước">
      <Card>
        {preview.map((item, index) => {
          const visual = PREVIEW_ITEM_VISUAL[item.type] ?? PREVIEW_FALLBACK;
          return (
            <View
              key={`${String(index)}-${item.prompt}`}
              accessibilityLabel={`${visual.label}: ${item.prompt}`}
              accessible
              className="flex-row items-start gap-sm"
            >
              <IconTile name={visual.icon} size="sm" tone={visual.tone} />
              <View className="flex-1 gap-3xs">
                <Text className="text-caption-lg text-fg-2">{visual.label}</Text>
                <Text className="text-body-md text-fg-1" numberOfLines={2}>
                  {item.prompt}
                </Text>
              </View>
            </View>
          );
        })}
        <Text className="text-caption-sm text-fg-2">
          {`Xem trước ${String(preview.length)} mục đầu tiên của bộ học.`}
        </Text>
      </Card>
    </Section>
  );
}
