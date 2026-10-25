import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Tabs } from '@/shared/ui/tab';
import { showToast } from '@/shared/utils/toast.utils';

import type { ReceiptStatus } from '../api/announcements.types';
import { ReceiptsList } from '../components/ReceiptsList';
import { ReceiptsSummary } from '../components/ReceiptsSummary';
import { useAnnouncementSocket } from '../hooks/useAnnouncementSocket';
import { useAnnouncement } from '../queries/announcements.queries';
import { useAnnouncementReceipts } from '../queries/receipts.queries';
import { describeAnnouncementError } from '../utils/error-info';

function isReceiptStatus(key: string): key is ReceiptStatus {
  return key === 'confirmed' || key === 'pending';
}

/**
 * Danh sách đã/chưa xác nhận của MỘT thông báo (p5-04 app.md §3) — chỉ người yêu cầu và quản trị kênh (BE 403 cho người
 * khác ⇒ toast trung tính rồi quay lại). Hai tab cursor, số đếm "12/40 đã xác nhận" lấy từ `meta` (giống nhau ở cả hai
 * tab nên giữ khi đổi tab). Realtime: `announcement:confirmed` vá số đếm rồi làm mới danh sách (`useAnnouncementSocket`).
 */
export function AnnouncementReceiptsScreen() {
  const { chId, messageId } = useLocalSearchParams<{
    chId: string;
    messageId: string;
    wsId: string;
  }>();
  const [status, setStatus] = useState<ReceiptStatus>('confirmed');
  const receipts = useAnnouncementReceipts(messageId, status);
  const view = useAnnouncement(chId, messageId);
  useAnnouncementSocket(chId);

  const meta = receipts.data?.pages[0]?.meta;
  const counts = meta ? { audience: meta.audienceCount, confirmed: meta.confirmedCount } : null;
  const tabs = [
    { badge: counts?.confirmed, key: 'confirmed', label: 'Đã xác nhận' },
    {
      badge: counts ? counts.audience - counts.confirmed : undefined,
      key: 'pending',
      label: 'Chưa xác nhận',
    },
  ];

  const noAccess = receipts.isError && describeAnnouncementError(receipts.error).noAccess;
  useEffect(() => {
    if (!noAccess) return;
    showToast('info', 'Bạn không còn quyền xem danh sách này.');
    router.back();
  }, [noAccess]);

  return (
    <Screen
      header={<AppBar title="Xác nhận đã đọc" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1">
        <ReceiptsSummary counts={counts} deadlineAt={view?.deadlineAt} />
        <View className="px-md py-xs">
          <Tabs
            items={tabs}
            value={status}
            onChange={(key) => isReceiptStatus(key) && setStatus(key)}
          />
        </View>
        <ReceiptsList receipts={receipts} status={status} />
      </View>
    </Screen>
  );
}
