import { View } from 'react-native';

import { Toggle } from '@/shared/ui/toggle';

import type { ChannelDraft } from './create-channel-draft.types';

export interface PolicyStepProps {
  draft: ChannelDraft;
  onChange: (patch: Partial<ChannelDraft>) => void;
}

/** Bước 4/5 — ai được đăng bài trong kênh (app.md §2, §3). */
export function PolicyStep({ draft, onChange }: PolicyStepProps) {
  return (
    <View className="gap-sm">
      <Toggle
        description="Thành viên khác chỉ đọc và thả cảm xúc, không gửi được tin nhắn mới."
        label="Chỉ quản trị đăng bài"
        value={draft.postingPolicy === 'ADMINS_ONLY'}
        onChange={(value) => onChange({ postingPolicy: value ? 'ADMINS_ONLY' : 'MEMBERS' })}
      />
    </View>
  );
}
