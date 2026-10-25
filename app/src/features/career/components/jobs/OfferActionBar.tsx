import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';

import type { OfferDetail } from '../../api/recruiter.types';
import { isAwaitingReply } from '../../utils/offer-format';

export interface OfferActionBarProps {
  offer: OfferDetail;
  /** Mất mạng: chặn Quan tâm/Từ chối (đọc cache thì được, ghi thì không — app.md §3 "Offline"). */
  offline: boolean;
  onDecline: () => void;
  onInterested: () => void;
  onOpenThread: () => void;
}

/**
 * Hành động ở đáy chi tiết lời mời (app.md §3), theo trạng thái HIỆN TẠI (kể cả sau khi socket vá):
 *  · `SENT`/`READ` → Quan tâm + Từ chối khéo; công ty không còn `APPROVED` (tạm ngưng) → CHỈ còn Từ chối (Quan tâm sẽ bị `RECR_002`).
 *  · `INTERESTED` + thread còn mở → "Trao đổi".
 * ⚠️ Màn cha chỉ gắn thanh này khi `hasOfferActions(offer)` — `Screen` coi mọi phần tử là "có footer" nên trả `null` từ đây vẫn chừa một dải trống.
 */
export function OfferActionBar({
  offer,
  offline,
  onDecline,
  onInterested,
  onOpenThread,
}: OfferActionBarProps) {
  if (isAwaitingReply(offer.status)) {
    const suspended = offer.company.status !== 'APPROVED';
    return (
      <BottomActionBar divider>
        <View className="flex-row gap-sm">
          <View className="flex-1">
            <Button
              disabled={offline}
              fullWidth
              label="Từ chối khéo"
              variant={suspended ? 'primary' : 'secondary'}
              onPress={onDecline}
            />
          </View>
          {suspended ? null : (
            <View className="flex-1">
              <Button disabled={offline} fullWidth label="Quan tâm" onPress={onInterested} />
            </View>
          )}
        </View>
      </BottomActionBar>
    );
  }

  return (
    <BottomActionBar divider>
      <Button fullWidth iconLeft="chat-bubble" label="Trao đổi" onPress={onOpenThread} />
    </BottomActionBar>
  );
}
