import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AvatarGroup } from '@/shared/ui/avatar-group';

import { useMessageReadReceipts } from '../hooks/useReadReceipts';
import { WhoReadSheet } from './WhoReadSheet';

const MAX_SHOWN = 3;

export interface SeenAvatarsProps {
  conversationId: string;
  seq: number;
  liveVersion: number;
}

/** app.md §3 — GROUP: tối đa 3 avatar + "+N", chạm → `WhoReadSheet`. */
export function SeenAvatars({ conversationId, seq, liveVersion }: SeenAvatarsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const query = useMessageReadReceipts(conversationId, seq, liveVersion);
  const readers = query.data?.readers ?? [];

  if (readers.length === 0) return null;

  return (
    <>
      {/* `AvatarGroup` (avatar chồng nhau + ô "+k") thay cho hàng avatar rời + chữ "+N": gọn hơn, cùng dáng "facepile" với mọi nơi
          khác của app. `hitSlop` dọc: dải chỉ cao ~28dp (avatar 24 + đệm) — nới vùng chạm lên ≥ 44dp mà không đẩy ô soạn tin. */}
      <Pressable
        accessibilityLabel={`Đã xem bởi ${String(readers.length)} người`}
        accessibilityRole="button"
        className="flex-row items-center justify-end gap-2xs px-md py-3xs active:opacity-70"
        hitSlop={{ bottom: 8, top: 8 }}
        onPress={() => setSheetOpen(true)}
      >
        <Text className="text-caption-sm text-fg-2">Đã xem</Text>
        <AvatarGroup
          max={MAX_SHOWN}
          size="xs"
          users={readers.map((reader) => ({
            avatarUrl: reader.avatarUrl,
            id: reader.userId,
            name: reader.name,
          }))}
        />
      </Pressable>
      <WhoReadSheet readers={readers} visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
