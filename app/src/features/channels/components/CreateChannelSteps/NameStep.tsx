import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import { channelDescriptionSchema, channelNameSchema, type readChannelLimits } from '../../schemas/channel.schemas';
import type { ChannelDraft } from './create-channel-draft.types';

export interface NameStepProps {
  /** `CH_001` kèm `details.archivedChannelId` — có giá trị thì hiện gợi ý khôi phục (app.md §3). */
  archivedChannelId?: string;
  draft: ChannelDraft;
  limits: ReturnType<typeof readChannelLimits>;
  onChange: (patch: Partial<ChannelDraft>) => void;
  onRestoreArchived: () => void;
  restoring: boolean;
}

/** Bước 1/5 — tên + mô tả, gợi ý khôi phục khi trùng tên kênh đã lưu trữ. */
export function NameStep({
  archivedChannelId,
  draft,
  limits,
  onChange,
  onRestoreArchived,
  restoring,
}: NameStepProps) {
  const nameResult = channelNameSchema(limits).safeParse(draft.name);
  const descResult = channelDescriptionSchema(limits).safeParse(draft.description);

  return (
    <View className="gap-md">
      <Input
        autoCapitalize="sentences"
        label="Tên kênh"
        maxLength={limits.nameMax}
        message={!nameResult.success && draft.name.length > 0 ? nameResult.error.issues[0]?.message : undefined}
        placeholder="Ví dụ: chung, thông-báo"
        required
        returnKeyType="next"
        value={draft.name}
        onChangeText={(name) => onChange({ name })}
      />

      <Input
        label="Mô tả"
        maxLength={limits.descriptionMax}
        message={!descResult.success ? descResult.error.issues[0]?.message : undefined}
        multiline
        placeholder="Kênh này dùng để làm gì? (không bắt buộc)"
        value={draft.description}
        onChangeText={(description) => onChange({ description })}
      />

      {archivedChannelId ? (
        <Alert
          actions={
            <Button
              label="Khôi phục kênh cũ"
              loading={restoring}
              size="xs"
              variant="secondary"
              onPress={onRestoreArchived}
            />
          }
          description="Tên này trùng một kênh đã lưu trữ. Bạn có thể khôi phục kênh cũ thay vì tạo kênh mới."
          title="Tên kênh đã tồn tại"
          tone="warning"
        />
      ) : null}
    </View>
  );
}
