import { useState } from 'react';
import { Linking, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';

import type { UserLocationState } from '../hooks/useUserLocation';

export interface NearMeBarProps {
  state: UserLocationState;
  /** Xin quyền + lấy vị trí (`useUserLocation().request`). */
  onRequest: () => Promise<unknown>;
}

/** Câu giải thích cho từng trạng thái KHÔNG có vị trí — nói rõ đang tìm quanh đâu và người dùng làm được gì. */
function noticeFor(state: UserLocationState): string | null {
  if (state.status === 'denied') {
    return 'Bạn chưa cho phép dùng vị trí nên đang hiện địa điểm quanh khuôn viên. Bạn vẫn kéo bản đồ để xem khu vực khác.';
  }
  if (state.status === 'unavailable' && state.reason === 'no-module') {
    return 'Bản cài đặt này chưa hỗ trợ định vị nên đang hiện địa điểm quanh khuôn viên. Hãy cập nhật ứng dụng để dùng "Gần tôi".';
  }
  if (state.status === 'unavailable' && state.reason === 'services-off') {
    return 'Dịch vụ vị trí của máy đang tắt. Bật GPS rồi bấm "Gần tôi" để tìm quanh bạn.';
  }
  if (state.status === 'unavailable' && state.reason === 'error') {
    return 'Chưa lấy được vị trí của bạn. Đang hiện địa điểm quanh khuôn viên — bấm "Gần tôi" để thử lại.';
  }
  return null;
}

/**
 * Nút "Gần tôi" + giải thích (app.md §7): KHÔNG xin quyền lúc mở màn — bấm nút mới hiện hộp thoại giải thích lý do, rồi mới tới hộp thoại hệ
 * thống. Từ chối vẫn dùng đầy đủ (tâm mặc định = khuôn viên), kèm dòng nói RÕ đang tìm quanh đâu. Từ chối vĩnh viễn (`canAskAgain` false) thì
 * hộp thoại hệ thống không hiện nữa — chỉ còn cách vào Cài đặt, nên hiện nút mở thẳng Cài đặt.
 */
export function NearMeBar({ state, onRequest }: NearMeBarProps) {
  const [explaining, setExplaining] = useState(false);
  const notice = noticeFor(state);
  const locating = state.status === 'locating';
  const blocked = state.status === 'denied' && !state.canAskAgain;

  const press = () => {
    // Đã có vị trí (hoặc đã có quyền) thì lấy lại luôn, không giải thích lại; chưa có quyền thì giải thích trước.
    if (state.status === 'granted' || state.status === 'unavailable') void onRequest();
    else setExplaining(true);
  };

  return (
    <View className="gap-xs px-md">
      <View className="flex-row items-center gap-xs">
        <Button
          disabled={locating}
          iconLeft="location"
          label="Gần tôi"
          loading={locating}
          size="sm"
          variant="secondary"
          onPress={press}
        />
      </View>
      {notice ? (
        <Alert
          actions={
            blocked ? (
              <Button
                label="Mở cài đặt"
                size="sm"
                variant="secondary"
                onPress={() => void Linking.openSettings()}
              />
            ) : undefined
          }
          description={notice}
          tone="info"
        />
      ) : null}
      <Dialog
        description="Ứng dụng chỉ dùng vị trí lúc bạn tìm kiếm để gợi ý quán cà phê và tiệm in gần bạn. Vị trí không được lưu lại."
        primaryAction={{
          label: 'Cho phép',
          onPress: () => {
            setExplaining(false);
            void onRequest();
          },
        }}
        secondaryAction={{ label: 'Để sau', onPress: () => setExplaining(false) }}
        title="Dùng vị trí của bạn?"
        visible={explaining}
        onClose={() => setExplaining(false)}
      />
    </View>
  );
}
