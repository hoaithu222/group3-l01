import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, LinkButton } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import { DESCRIPTION_COLLAPSE_LINES } from '../../constants/task-detail.constants';
import { isLongText } from '../../utils/markdown';
import { MarkdownView } from '../MarkdownView';

export interface DescriptionSectionProps {
  canEdit: boolean;
  description: string | null;
  /** Bản giữ chỗ (chưa tải chi tiết thật) — chưa biết mô tả nên vẽ khung chờ, không nói "trống". */
  loading: boolean;
  onEdit: () => void;
}

/**
 * Mô tả thẻ (app.md §2 `DescriptionSection`): Markdown, gập ở 12 dòng với "Xem thêm", nút "Sửa" mở màn sửa
 * toàn màn. Trống: "Thêm mô tả" (người sửa được) hoặc câu nhạt (người chỉ xem).
 */
export function DescriptionSection({
  canEdit,
  description,
  loading,
  onEdit,
}: DescriptionSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const hasText = Boolean(description && description.trim() !== '');
  const long = hasText && isLongText(description ?? '', DESCRIPTION_COLLAPSE_LINES);

  return (
    // Cùng khuôn tiêu đề `Section tone="default"` + icon với các khối khác của chi tiết thẻ (xem `ChecklistSection`).
    <Section
      action={canEdit && hasText ? <LinkButton label="Sửa" onPress={onEdit} /> : undefined}
      icon="document"
      title="Mô tả"
      tone="default"
    >
      {loading ? (
        <Skeleton className="h-16 rounded-xs" />
      ) : hasText ? (
        <>
          {/* `max-h-72` = 12 dòng × 24dp — cắt bằng chiều cao vì khối Markdown là cây View, không phải một Text. */}
          <View className={long && !expanded ? 'max-h-72 overflow-hidden' : undefined}>
            <MarkdownView source={description ?? ''} />
          </View>
          {long ? (
            <LinkButton
              label={expanded ? 'Thu gọn' : 'Xem thêm'}
              onPress={() => setExpanded((value) => !value)}
            />
          ) : null}
        </>
      ) : canEdit ? (
        <Button iconLeft="add" label="Thêm mô tả" variant="secondary" onPress={onEdit} />
      ) : (
        <Text className="text-body-md text-fg-2">Chưa có mô tả.</Text>
      )}
    </Section>
  );
}
