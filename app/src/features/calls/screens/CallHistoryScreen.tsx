import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Tabs } from '@/shared/ui/tab';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';

import type { CallHistoryFilter, CallHistoryItem } from '../api/calls.types';
import { CallErrorDialogs } from '../components/CallErrorDialogs';
import { CallHistoryScreenBody } from '../components/CallHistoryScreenBody';
import { useStartCall } from '../hooks/useStartCall';
import { useCallHistory } from '../queries/calls.queries';

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'missed', label: 'Nhỡ' },
];

/**
 * Lịch sử cuộc gọi (app.md p2-01 §3): "Tất cả / Nhỡ", phân trang cursor, kéo để làm mới; bấm → mở hội thoại, nút bên phải
 * gọi lại cùng loại (thoại/video). Kênh (CHANNEL) chưa mở được từ đây vì dòng lịch sử không mang `workspaceId` — chỉ gọi lại.
 */
export function CallHistoryScreen() {
  const [filter, setFilter] = useState<CallHistoryFilter>('all');
  const history = useCallHistory(filter);
  const { dismissFailure, failure, start } = useStartCall();
  const items = useMemo(() => history.data?.pages.flatMap((page) => page.items) ?? [], [history.data]);

  function open(item: CallHistoryItem): void {
    if (item.scopeType === 'CONVERSATION') {
      router.push({ params: { conversationId: item.scopeId }, pathname: '/messages/[conversationId]' });
    }
  }

  function callBack(item: CallHistoryItem): void {
    if (item.scopeType === 'MEETING') return; // họp vào bằng phòng họp (p2-05), không gọi lại từ lịch sử
    hapticTap(); // xác nhận cú chạm BẮT ĐẦU gọi — trước `start` (có thể trễ vì tạo cuộc gọi qua mạng)
    void start({ scopeId: item.scopeId, scopeType: item.scopeType }, item.mediaKind);
  }

  return (
    <Screen header={<AppBar title="Cuộc gọi" onBack={router.back} />} padded={false} scrollable={false}>
      <View className="flex-1">
        <View className="px-md py-xs">
          <Tabs
            items={TABS}
            value={filter}
            onChange={(key) => {
              const next: CallHistoryFilter = key === 'missed' ? 'missed' : 'all';
              // Rung "đổi lựa chọn" chỉ khi bộ lọc ĐỔI thật — chạm lại tab đang mở không rung.
              if (next !== filter) hapticSelection();
              setFilter(next);
            }}
          />
        </View>
        <CallHistoryScreenBody filter={filter} history={history} items={items} onCallBack={callBack} onOpen={open} />
      </View>
      <CallErrorDialogs failure={failure} onClose={dismissFailure} />
    </Screen>
  );
}
