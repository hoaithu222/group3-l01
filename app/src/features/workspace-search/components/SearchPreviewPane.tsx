import { ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { MessageHit } from '../api';
import { scopeLabel } from '../utils/result-format';
import { HighlightedSnippet } from './HighlightedSnippet';

export interface SearchPreviewPaneProps {
  hit: MessageHit | null;
  onOpen: (hit: MessageHit) => void;
}

/**
 * Khung XEM TRƯỚC tin ở nửa phải màn máy tính bảng (app.md p5-04 §7 "kết quả trái, xem trước tin phải"). ⚠️ Bản TỐI THIỂU:
 * hiện đúng những gì kết quả tìm đã có sẵn (nơi chứa, tác giả, giờ, đoạn trích có nhấn, tệp đính kèm) và nút "Mở tin nhắn".
 * CHƯA có "5 tin quanh kết quả" — cần gọi `GET /scopes/:type/:id/messages?around=` và dựng lại nội dung tin (mention, tệp,
 * tin đã thu hồi) như màn chat; làm nửa vời ở đây dễ hiện sai tin so với màn chat thật.
 */
export function SearchPreviewPane({ hit, onOpen }: SearchPreviewPaneProps) {
  if (!hit) {
    return (
      <EmptyState
        description="Chọn một tin nhắn ở bên trái để xem trước."
        fullscreen
        icon="chat-bubble"
        size="compact"
        tone="info"
      />
    );
  }

  const author = hit.author.name?.trim() || 'Thành viên';

  return (
    <ScrollView
      contentContainerClassName="gap-md p-md"
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <Card title={scopeLabel(hit.scope)}>
        <View className="gap-sm">
          <View className="flex-row items-center gap-sm">
            <Avatar
              name={author}
              size="md"
              source={hit.author.avatarUrl ? { uri: hit.author.avatarUrl } : undefined}
            />
            <View className="flex-1 gap-3xs">
              <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
                {author}
              </Text>
              <Text className="text-caption-sm text-fg-2">{formatDateTime(hit.createdAt)}</Text>
            </View>
            {hit.inThread ? <Badge label="Trong luồng" size="sm" variant="info" /> : null}
          </View>

          <HighlightedSnippet
            className="text-body-lg text-fg-1"
            highlights={hit.highlights}
            numberOfLines={12}
            snippet={hit.snippet}
          />

          {hit.hasAttachments ? (
            <View className="flex-row items-center gap-3xs">
              <Icon color="fg-2" name="file-2" size={14} />
              <Text className="text-caption-sm text-fg-2">Có tệp đính kèm</Text>
            </View>
          ) : null}
        </View>
      </Card>

      <Button fullWidth label="Mở tin nhắn" onPress={() => onOpen(hit)} />
    </ScrollView>
  );
}
