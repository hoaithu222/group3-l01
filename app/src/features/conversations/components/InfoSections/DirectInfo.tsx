import { useState } from 'react';
import { View } from 'react-native';

import { Reveal } from '@/shared/ui/motion';

import type { ConversationDetail } from '../../api/conversations.types';
import { useMyConversationSettings } from '../../hooks/useMyConversationSettings';
import { ClearHistoryConfirmSheet } from '../ClearHistoryConfirmSheet';
import { ConversationNotifySheet, currentNotifyLabel } from '../ConversationNotifySheet';
import { DirectSafetyRows } from '../DirectSafetyRows';
import { InfoActionRow } from '../InfoActionRow';
import { InfoGroup } from '../InfoGroup';
import { DirectInfoHero } from './DirectInfoHero';
import { SharedContentSection } from './SharedContentSection';

/**
 * app.md §3 `ConversationInfoScreen` DIRECT. Bỏ "Hồ sơ" (chưa có màn hồ sơ
 * người dùng nào trong app để trỏ tới), "Tìm" (p1-09), "Gọi" (p2-01) so với
 * bản vẽ đầy đủ — không dựng nút trỏ vào chỗ trống. "Chặn/Bỏ chặn" + "Báo cáo"
 * (p1-08) ở `DirectSafetyRows`.
 *
 * Bố cục cùng nhịp `GroupInfo`: đầu trang → thẻ "Thông báo" → `Section` nội dung đã chia sẻ → quyền riêng tư → thẻ phá huỷ ở CUỐI.
 */
export function DirectInfo({ conversation }: { conversation: ConversationDetail }) {
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const settings = useMyConversationSettings(conversation.id);

  return (
    <View className="gap-xl py-xs">
      <Reveal kind="zoom">
        <DirectInfoHero conversation={conversation} />
      </Reveal>

      <Reveal index={1}>
        <InfoGroup>
          {/* Icon theo TRẠNG THÁI: chuông gạch khi đang tắt tiếng — mô tả vẫn nói bằng chữ (không chỉ dựa vào hình). */}
          <InfoActionRow
            description={currentNotifyLabel(conversation)}
            icon={conversation.muted ? 'noti-off' : 'notification'}
            iconTone="warning"
            label="Thông báo"
            onPress={() => setMuteSheetOpen(true)}
          />
        </InfoGroup>
      </Reveal>

      <Reveal index={2}>
        <SharedContentSection conversationId={conversation.id} />
      </Reveal>

      <DirectSafetyRows conversation={conversation} />

      {/* Xoá phía tôi phải HỎI trước — cùng tấm `ClearHistoryConfirmSheet` với vuốt/nhấn giữ hàng danh sách; bản cũ gọi
          `settings.clear()` ngay khi chạm nên bấm nhầm là mất cuộc trò chuyện khỏi danh sách. */}
      <InfoGroup>
        <InfoActionRow
          icon="delete"
          label="Xoá cuộc trò chuyện"
          tone="danger"
          onPress={() => setConfirmClearOpen(true)}
        />
      </InfoGroup>

      <ConversationNotifySheet
        conversation={conversation}
        visible={muteSheetOpen}
        onClose={() => setMuteSheetOpen(false)}
      />

      <ClearHistoryConfirmSheet
        loading={settings.isPending}
        visible={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          settings.clear();
          setConfirmClearOpen(false);
        }}
      />
    </View>
  );
}
