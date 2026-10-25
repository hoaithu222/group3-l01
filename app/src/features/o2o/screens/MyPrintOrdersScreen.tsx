import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import type { OrderGroup } from '../api/o2o.types';
import { OrdersList } from '../components/OrdersList';
import { GROUP_TABS } from '../constants/o2o.constants';

/**
 * "Đơn in của tôi" (app.md §3): ba nhóm Đang xử lý · Hoàn tất · Đã huỷ (huỷ + bị từ chối + hết hạn — `group=CLOSED` của BE). Mỗi nhóm một danh sách
 * cursor riêng nên đổi tab không tải lại nhóm kia. `padded={false}`: danh sách tự có lề `px-md` và cuộn riêng (`FlashList`, không lồng trong vùng cuộn của màn).
 */
export function MyPrintOrdersScreen() {
  const [group, setGroup] = useState<OrderGroup>('ACTIVE');

  return (
    <Screen
      header={<AppBar title="Đơn in của tôi" onBack={router.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-xs pt-xs">
        <View className="px-md">
          <Tabs
            items={GROUP_TABS}
            value={group}
            variant="underline"
            onChange={(key) => {
              if (key !== group) hapticSelection();
              setGroup(key as OrderGroup);
            }}
          />
        </View>
        <View className="flex-1">
          <OrdersList group={group} />
        </View>
      </View>
    </Screen>
  );
}
