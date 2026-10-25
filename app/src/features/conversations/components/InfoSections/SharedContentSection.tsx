import { router } from 'expo-router';

import { Section } from '@/shared/ui/section';

import type { MediaKind } from '../../api/conversations.types';
import { InfoActionRow } from '../InfoActionRow';
import { InfoGroup } from '../InfoGroup';

function openMedia(conversationId: string, kind: MediaKind): void {
  router.push({ pathname: '/messages/[conversationId]/media', params: { conversationId, kind } });
}

/**
 * Nhóm "Nội dung đã chia sẻ" (Ảnh/Video · Tệp · Liên kết) — CÙNG ba lối vào `MediaLibraryScreen` ở thông tin 1-1 lẫn nhóm, nên gom
 * một chỗ để hai màn không lệch icon/tông/thứ tự. Tông ô icon trùng với tông hình rỗng của từng tab trong thư viện.
 */
export function SharedContentSection({ conversationId }: { conversationId: string }) {
  return (
    <Section icon="image" title="Nội dung đã chia sẻ">
      <InfoGroup>
        <InfoActionRow
          icon="image"
          iconTone="success"
          label="Ảnh, Video"
          onPress={() => openMedia(conversationId, 'MEDIA')}
        />
        <InfoActionRow
          icon="file-2"
          iconTone="info"
          label="Tệp"
          onPress={() => openMedia(conversationId, 'FILE')}
        />
        <InfoActionRow
          icon="link"
          iconTone="accent"
          label="Liên kết"
          onPress={() => openMedia(conversationId, 'LINK')}
        />
      </InfoGroup>
    </Section>
  );
}
