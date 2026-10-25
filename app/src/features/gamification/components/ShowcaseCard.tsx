import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';

import type { BadgeDto } from '../api/gamification.types';
import { SHOWCASE_MAX } from '../constants/gamification.constants';
import type { useShowcaseDraft } from '../hooks/useShowcaseDraft';
import { BadgeTile } from './BadgeTile';
import { ShowcaseEditor } from './ShowcaseEditor';

export interface ShowcaseCardProps {
  /** Có huy hiệu đã đạt và đang online ⇒ hiện "Chỉnh trưng bày". */
  canEdit: boolean;
  catalog: ReadonlyMap<string, BadgeDto>;
  editor: ReturnType<typeof useShowcaseDraft>;
  /** Trưng bày hiện tại trên server, theo thứ tự. */
  showcase: BadgeDto[];
  onOpen: (badge: BadgeDto) => void;
}

/**
 * "Đang trưng bày (x/6)": xem (bấm ô mở chi tiết) hoặc chỉnh — chọn từ danh sách "Đã đạt", sắp thứ tự bằng nút Lên/Xuống,
 * rồi Lưu (`PUT /me/badges/showcase`).
 */
export function ShowcaseCard({ canEdit, catalog, editor, onOpen, showcase }: ShowcaseCardProps) {
  const ordered = editor.draft
    ? editor.draft.flatMap((id) => {
        const badge = catalog.get(id);
        return badge ? [badge] : [];
      })
    : showcase;

  return (
    <Section icon="favorite" title={`Đang trưng bày (${ordered.length}/${SHOWCASE_MAX})`}>
      <Card>
        <View className="gap-sm">
          {editor.editing ? (
            <>
              <ShowcaseEditor badges={ordered} onMove={editor.move} onRemove={editor.remove} />
              <View className="flex-row gap-sm">
                <Button label="Huỷ" size="sm" variant="secondary" onPress={editor.cancel} />
                <Button label="Lưu" loading={editor.isSaving} size="sm" onPress={editor.save} />
              </View>
            </>
          ) : (
            <>
              {showcase.length === 0 ? (
                // `compact`: ô rỗng NẰM TRONG thẻ — bản cỡ đầy đủ (160) đẩy lưới huy hiệu bên dưới ra khỏi tầm nhìn.
                <EmptyState
                  description="Bạn chưa chọn huy hiệu nào để trưng bày."
                  icon="favorite"
                  size="compact"
                  tone="accent"
                />
              ) : null}
              {showcase.map((badge) => (
                <BadgeTile key={badge.id} badge={badge} onPress={onOpen} />
              ))}
              {canEdit ? (
                <Button
                  label="Chỉnh trưng bày"
                  size="sm"
                  variant="secondary"
                  onPress={editor.start}
                />
              ) : null}
            </>
          )}
        </View>
      </Card>
    </Section>
  );
}
