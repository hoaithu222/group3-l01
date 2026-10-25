import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Card } from '@/shared/ui/card';
import { Toggle } from '@/shared/ui/toggle';

import { useCareerVisibility } from '../hooks/useCareerVisibility';

/**
 * "Quyền riêng tư nghề nghiệp" (app.md p6-06 §3 `CareerVisibilityCard`): hai công tắc đổi TỨC THÌ (lạc quan + trả lại khi lỗi), mỗi công tắc có
 * mô tả HẬU QUẢ — tiêu đề task có thể lộ thông tin nhóm riêng tư nên mặc định TẮT. Offline ⇒ khoá (đổi mà không tới server sẽ lệch thiết bị).
 * p6-07/p6-08 thêm công tắc của mình (`appearInOthersPortfolios`, Open to work) vào thẻ này.
 */
export function CareerVisibilityCard() {
  const { isLoading, isPending, update, visibility } = useCareerVisibility();
  const offline = useConnectionState() === 'offline';
  const disabled = isLoading || isPending || offline;

  return (
    <Card title="Quyền riêng tư nghề nghiệp">
      <View className="gap-md">
        <Toggle
          description="Thành viên cùng nhóm với bạn xem được huy hiệu kỹ năng. Tắt thì chỉ bạn thấy."
          disabled={disabled}
          label="Cho thành viên nhóm xem huy hiệu"
          value={visibility.showSkills}
          onChange={(value) => update({ showSkills: value })}
        />
        <Toggle
          description="Người ngoài nhóm thấy tiêu đề task trong minh chứng. Tiêu đề có thể lộ thông tin riêng của nhóm; tên nhóm luôn ẩn với người ngoài."
          disabled={disabled}
          label="Hiện tiêu đề task trong minh chứng"
          value={visibility.proofTitles}
          onChange={(value) => update({ proofTitles: value })}
        />
        {/* p6-07: hai công tắc của Portfolio. Cả hai mặc định TẮT — bật là chủ động cho phép nêu tên/số liệu ra ngoài nhóm. */}
        <Toggle
          description="Khi đồng đội công khai portfolio và chọn hiện tên đồng đội, tên bạn được nêu trên trang của họ. Tắt thì bạn hiển thị là “Đồng đội”."
          disabled={disabled}
          label="Cho đồng đội hiện tên tôi trong portfolio của họ"
          value={visibility.appearInOthersPortfolios}
          onChange={(value) => update({ appearInOthersPortfolios: value })}
        />
        <Toggle
          description="Portfolio của bạn kèm điểm đóng góp và phần trăm khối lượng trong nhóm (công thức đã công bố với cả nhóm). Tắt thì các số này không lên trang."
          disabled={disabled}
          label="Hiện điểm đóng góp trong portfolio của tôi"
          value={visibility.showContribution}
          onChange={(value) => update({ showContribution: value })}
        />
      </View>
    </Card>
  );
}
