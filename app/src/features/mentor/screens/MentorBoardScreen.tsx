import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import { BoardFeedTab } from '../components/board/BoardFeedTab';
import { ManagedWorkspacesSheet } from '../components/board/ManagedWorkspacesSheet';
import { MyApplicationsTab } from '../components/board/MyApplicationsTab';
import { MyEngagementsTab } from '../components/board/MyEngagementsTab';
import { useManagedWorkspaces, useMyEngagements } from '../queries/mentor.queries';

type BoardTab = 'applications' | 'engaged' | 'posts';

/**
 * Bảng tin Mentor Connect (app.md §1/§3): tab "Bài đang mở · Đơn của tôi · Đang cố vấn" (tab cuối ẩn khi rỗng). Người đăng nhập
 * nào cũng xem được; nút "Quản lý bài của nhóm" chỉ hiện khi mình là OWNER/ADMIN ở ít nhất một nhóm. Cờ `mentor` tắt → `FeatureRouteGuard` ở `mentor/_layout.tsx`.
 */
export function MentorBoardScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const managed = useManagedWorkspaces();
  const engagements = useMyEngagements();
  const [tab, setTab] = useState<BoardTab>(
    params.tab === 'applications' || params.tab === 'engaged' ? params.tab : 'posts',
  );
  const [picking, setPicking] = useState(false);
  const hasEngagements = (engagements.data?.length ?? 0) > 0;
  const managedList = managed.data ?? [];

  const items = [
    { key: 'posts', label: 'Bài đang mở' },
    { key: 'applications', label: 'Đơn của tôi' },
    ...(hasEngagements ? [{ key: 'engaged', label: 'Đang cố vấn' }] : []),
  ];
  const active: BoardTab = tab === 'engaged' && !hasEngagements ? 'posts' : tab;

  const header = (
    <AppBar
      actions={
        managedList.length > 0 ? (
          <Button
            iconLeft="setting"
            label="Quản lý"
            size="sm"
            variant="secondary"
            onPress={() => setPicking(true)}
          />
        ) : undefined
      }
      title="Tìm cố vấn"
      onBack={router.back}
    />
  );

  return (
    <Screen header={header} padded={false} scrollable={false}>
      <View className="px-md pb-xs">
        <Tabs
          items={items}
          value={active}
          variant="underline"
          onChange={(key) => {
            if (key !== active) hapticSelection();
            setTab(key as BoardTab);
          }}
        />
      </View>
      <View className="flex-1">
        {active === 'posts' ? <BoardFeedTab /> : null}
        {active === 'applications' ? <MyApplicationsTab /> : null}
        {active === 'engaged' ? <MyEngagementsTab /> : null}
      </View>
      <ManagedWorkspacesSheet
        visible={picking}
        workspaces={managedList}
        onClose={() => setPicking(false)}
      />
    </Screen>
  );
}
