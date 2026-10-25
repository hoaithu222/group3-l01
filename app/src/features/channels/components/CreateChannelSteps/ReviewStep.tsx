import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { IconTile } from '@/shared/ui/icon-tile';

import type { ChannelVisibility } from '../../api';
import {
  CHANNEL_TYPE_ICON,
  CHANNEL_TYPE_LABEL,
  CHANNEL_TYPE_TONE,
} from '../../utils/channel-type-art';
import type { ChannelDraft } from './create-channel-draft.types';

const VISIBILITY_LABEL: Record<ChannelVisibility, string> = {
  PRIVATE: 'Riêng tư — chỉ người được mời',
  PUBLIC: 'Công khai — mọi người trong nhóm',
};

export interface ReviewStepProps {
  draft: ChannelDraft;
  /** Lỗi tạo kênh KHÔNG PHẢI `CH_001` (cái đó đã đẩy người dùng về bước 1). */
  errorMessage: string | null;
}

/**
 * Bước 5/5 — xem lại tên, icon, ai xem được, câu "người được thêm xem được lịch sử" (app.md §3).
 * Thẻ đầu vẽ ĐÚNG ô icon kênh sẽ có ở danh sách (loại + tông); mỗi mục bên dưới có ô icon nhỏ làm mốc cho mắt.
 */
export function ReviewStep({ draft, errorMessage }: ReviewStepProps) {
  const isPrivate = draft.visibility === 'PRIVATE';

  return (
    <View className="gap-md">
      <View className="flex-row items-center gap-sm rounded-md border-hairline border-border-1 p-md">
        <IconTile
          name={CHANNEL_TYPE_ICON[draft.type]}
          size="lg"
          tone={CHANNEL_TYPE_TONE[draft.type]}
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1">
            {draft.name || 'Chưa đặt tên'}
          </Text>
          <Text className="text-caption-sm text-fg-2">{CHANNEL_TYPE_LABEL[draft.type]}</Text>
        </View>
      </View>

      <View className="flex-row items-start gap-sm">
        <IconTile
          name={isPrivate ? 'lock' : 'add-team'}
          size="sm"
          tone={isPrivate ? 'warning' : 'info'}
        />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md text-fg-1">Ai xem được</Text>
          <Text className="text-body-md text-fg-2">{VISIBILITY_LABEL[draft.visibility]}</Text>
          {isPrivate && draft.initialMemberIds.length > 0 ? (
            <Text className="text-caption-sm text-fg-2">
              {draft.initialMemberIds.length} người được thêm sẽ xem được lịch sử tin nhắn cũ của
              kênh.
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-start gap-sm">
        <IconTile name="edit" size="sm" tone="accent" />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md text-fg-1">Đăng bài</Text>
          <Text className="text-body-md text-fg-2">
            {draft.postingPolicy === 'ADMINS_ONLY'
              ? 'Chỉ quản trị đăng bài'
              : 'Mọi người trong kênh'}
          </Text>
        </View>
      </View>

      {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}
    </View>
  );
}
