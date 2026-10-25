import { View } from 'react-native';

import { HomeWidgetsSlot } from '@/shared/home-widgets';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { useFeature } from '@/shell/capabilities';
import { useUnreadSummary } from '@/shell/notifications';

import { HomeGreeting } from '../components/HomeGreeting';
import { HomeModules } from '../components/HomeModules';
import { HomeUnreadTiles } from '../components/HomeUnreadTiles';

/**
 * Trang chủ — nút GIỮA của thanh tab, điểm vào của cả app (`PATHS.HOME`, route `app/(app)/index.tsx`). Một hub cuộn dọc,
 * từ trên xuống:
 *
 *  1. **Lời chào** dạng hero (`HomeGreeting`): ngày (overline), lời chào theo buổi + tên, cảnh trời theo giờ kèm ảnh đại
 *     diện; quầng `GlowOrbs` phía sau — VÒNG LẶP NỔI BẬT DUY NHẤT của màn (các khối bên dưới tĩnh, chỉ có lấp lánh/chấm toả
 *     nhỏ). Không phải thẻ đậm thứ hai dưới `AppBar` (màn chỉ có MỘT tiêu đề: "Trang chủ").
 *  2. **Khu phân hệ CỐ ĐỊNH** (`HomeModules`): ngay dưới lời chào, hiện TẤT CẢ phân hệ người dùng được vào — hàng hero
 *     (phân hệ GHIM, nhấn giữ để ghim/bỏ ghim) + lưới bốn cột; "Tất cả (N)" mở `ModulePickerSheet`.
 *  3. **Tóm tắt chưa đọc** (`HomeUnreadTiles`).
 *  4. **Khe thống kê** (`<HomeWidgetsSlot />`) — BÊN DƯỚI cùng: hoạt động, chuỗi ngày chăm chỉ… do các feature đăng ký.
 *
 * ── Vì sao phân hệ ở TRÊN, thống kê ở DƯỚI ───────────────────────────────────
 * Việc người dùng làm nhiều nhất ở Trang chủ là đi tới một phân hệ — nên lối đi phải nằm trong màn hình đầu tiên và ở
 * vị trí KHÔNG đổi theo dữ liệu (thống kê tải chậm, rỗng hay dài ngắn tuỳ người). Thống kê là phần "xem cho biết": để
 * ở dưới, cuộn mới tới, không đẩy lối đi ra khỏi tầm ngón cái.
 *
 * ── Khoảng cách ─────────────────────────────────────────────────────────────
 * Đệm trên do MỘT nguồn duy nhất lo: `Screen` (`pt-xs` khi có `header`). Trước đây khối nội dung tự thêm `py-xs` nữa —
 * cộng chồng thành 16dp giữa thanh tiêu đề và thẻ đầu tiên, và người dùng thấy thanh tiêu đề "cách xa" nội dung. Khe giữa
 * các khối là `gap-xl` (24, `screen-layout.md`); đệm dưới `pb-md` để khối cuối không dính thanh tab.
 *
 * ── Không import chéo feature ───────────────────────────────────────────────
 * Trang chủ chỉ đọc từ VỎ ỨNG DỤNG (`@/shell/*`) và khe dùng chung (`@/shared/*`): registry phân hệ, số chưa đọc, cờ phân
 * hệ, ghim. Số liệu riêng của từng phân hệ (thống kê học, cuộc họp sắp tới…) KHÔNG lấy ở đây — feature nguồn đăng ký
 * widget vào `@/shared/home-widgets`, đừng để `home` import `study`/`meetings`.
 */
export function HomeScreen() {
  // `undefined` (chưa biết cờ) vẫn cho hiện — cùng nguyên tắc fail-open của thanh tab.
  const communicationEnabled = useFeature('communication') !== false;
  const summary = useUnreadSummary();

  return (
    <Screen
      contentClassName="pb-md"
      header={<AppBar title="Trang chủ" />}
      refreshing={communicationEnabled ? summary.isRefetching : undefined}
      onRefresh={communicationEnabled ? () => void summary.refetch() : undefined}
    >
      {/* `Reveal`: các khối hiện dần lệch nhịp 50ms (tự tắt khi "Giảm chuyển động"). Khu phân hệ tự bọc `Reveal` BÊN TRONG
          (nó có thể trả `null` — bọc ở đây thì còn lại một khối rỗng ăn thêm một khe `gap`). */}
      <View className="gap-xl">
        <Reveal>
          <HomeGreeting />
        </Reveal>
        <HomeModules />
        {communicationEnabled ? (
          <Reveal index={2}>
            <HomeUnreadTiles loading={summary.isLoading} summary={summary.data} />
          </Reveal>
        ) : null}
        {/* Khe widget: mỗi widget tự vẽ Section + Card, tự ẩn (trả `null`) khi không có dữ liệu. Bọc `Reveal` nhịp 3 (sau khu
            phân hệ + chưa đọc) để thống kê không "bật" ra sau các khối trên. ⚠️ `className="gap-xl"` ở CHÍNH `Reveal`: khe trả
            một mảng widget ⇒ chúng thành con của lớp bọc, `gap` của cha không còn chen giữa. ✅ Là khối CUỐI: không widget
            nào thì lớp bọc rỗng chỉ thêm khoảng trống cuối trang, không đẩy khối nào lệch chỗ. */}
        <Reveal className="gap-xl" index={3}>
          <HomeWidgetsSlot />
        </Reveal>
      </View>
    </Screen>
  );
}
