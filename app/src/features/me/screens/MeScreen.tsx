import * as Application from 'expo-application';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { appConfig } from '@/core/config/env.config';
import { ProfileRowsSlot } from '@/shared/profile';
import { ListItemDefaultsProvider } from '@/shared/ui/list';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { useFeature } from '@/shell/capabilities';
import { PATHS } from '@/shell/config';

import { MeLogoutButton } from '../components/MeLogoutButton';
import { MeNavGroup } from '../components/MeNavGroup';
import { MeNavRow } from '../components/MeNavRow';
import { MeProfileCard } from '../components/MeProfileCard';

/**
 * Tôi — hồ sơ cá nhân, lối vào cài đặt, và đăng xuất.
 *
 * Phase 0 gộp hai màn cũ của base (`ProfileScreen` + lối vào `SettingsScreen`)
 * thành một tab duy nhất theo cấu trúc bốn tab của Super App
 * (`docs/plan/config-app.md` §5) — cài đặt giao diện/nhà phát triển chuyển
 * thành màn con `me/settings.tsx`, đẩy tới qua `router.push`.
 */
export function MeScreen() {
  const studyEnabled = useFeature('study') === true;
  const gamificationEnabled = useFeature('gamification') === true;
  const meetingEnabled = useFeature('meeting') === true;

  return (
    <Screen header={<AppBar title="Tôi" />}>
      {/**
       * ── ⛔ MỘT cột ở mọi bề rộng — như `HomeScreen`/`ProfileScreen` gốc ──────
       * `Screen` mặc định `constrained` (trần 720dp — `max-w-content` — từ
       * `tablet:`), nên chia hai cột chỉ ra hai cột còn hẹp hơn màn điện thoại
       * cộng một vách đá ngay ngưỡng 600dp, chứ không có tác dụng bố cục nào
       * thật. Xem chú thích đầy đủ ở bản gốc trong lịch sử git.
       */}
      {/* Khe 24 giữa các KHU VỰC (hồ sơ · hoạt động · tài khoản); trong mỗi khu vực `Section` tự lo khe 12 xuống thẻ. */}
      {/* `Reveal`: ba khối đầu (hồ sơ · hoạt động · tài khoản) hiện dần lệch nhịp 50ms khi mở tab — tự tắt khi bật "Giảm
          chuyển động". Nút đăng xuất/dòng phiên bản KHÔNG bọc: chúng là chân trang, hiện ngay. */}
      <View className="gap-xl py-xs">
        <Reveal>
          <MeProfileCard />
        </Reveal>

        {/* `emphasis="title"`: tiêu đề hàng là chữ chính (fg-1), mô tả mới là chữ phụ — kể cả hàng do feature khác
            đăng ký qua khe (`ProfileRowsSlot`), nên đặt ở đây chứ không truyền từng `ListItem`. */}
        <ListItemDefaultsProvider emphasis="title">
          <View className="gap-xl">
            <Reveal index={1}>
              <Section title="Hoạt động của tôi">
                <MeNavGroup>
                  {/* p1-09: tin đã lưu của tôi — route `me/saved` nằm trong ngăn xếp của tab Tôi (không phải tab riêng). */}
                  {/* Tông xoay vòng brand · info · success · warning · accent cho sinh động (xem `IconTile`); `danger` để dành cho việc phá huỷ. */}
                  <MeNavRow
                    description="Tin nhắn bạn đã lưu từ kênh và hội thoại"
                    icon="favorite"
                    label="Đã lưu"
                    tone="warning"
                    onPress={() => router.push(PATHS.ME_SAVED)}
                  />
                  {/* p2-04: lịch họp (không có tab riêng ở màn Tôi) — chỉ hiện khi cờ `meeting` bật. */}
                  {meetingEnabled ? (
                    <MeNavRow
                      description="Xem lịch, tạo và quản lý cuộc họp của bạn"
                      icon="calendar"
                      label="Lịch họp"
                      tone="info"
                      onPress={() => router.push(PATHS.MEETINGS)}
                    />
                  ) : null}
                  {/* p4-01: điểm vào cá nhân của phân hệ Học (không có tab riêng) — chỉ hiện khi cờ `study` bật. */}
                  {studyEnabled ? (
                    <MeNavRow
                      description="Bộ thẻ ghi nhớ, câu hỏi trắc nghiệm của bạn và cộng đồng"
                      icon="book"
                      label="Học tập của tôi"
                      tone="success"
                      onPress={() => router.push(PATHS.STUDY)}
                    />
                  ) : null}
                  {/* p4-03: cấp, XP, chuỗi ngày, huy hiệu — chỉ khi cờ `gamification` bật (không import chéo feature). */}
                  {gamificationEnabled ? (
                    <MeNavRow
                      description="Cấp độ, điểm kinh nghiệm, chuỗi ngày và huy hiệu"
                      icon="star"
                      label="Thành tích"
                      sparkle
                      tone="accent"
                      onPress={() => router.push('/me/achievements')}
                    />
                  ) : null}
                  {/* p4-05: hàng lối vào của feature khác ("Cần chấm", có số đếm) đăng ký qua khe chung — `me` không import chéo feature. */}
                  <ProfileRowsSlot />
                </MeNavGroup>
              </Section>
            </Reveal>

            <Reveal index={2}>
              <Section title="Tài khoản">
                <MeNavGroup>
                  {/* Sửa hồ sơ: tên hiển thị + SĐT tự khai (ảnh đại diện đổi bằng cách chạm vào ảnh ở thẻ hồ sơ phía trên). */}
                  <MeNavRow
                    description="Tên hiển thị và số điện thoại"
                    icon="user-edit"
                    label="Sửa hồ sơ"
                    tone="info"
                    onPress={() => router.push(PATHS.ME_EDIT_PROFILE)}
                  />
                  <MeNavRow
                    description="Thông báo, bảo mật, quyền riêng tư và giao diện"
                    icon="setting"
                    label="Cài đặt"
                    onPress={() => router.push(PATHS.ME_SETTINGS)}
                  />
                </MeNavGroup>
              </Section>
            </Reveal>
          </View>
        </ListItemDefaultsProvider>

        {/* Không bật xác thực thì không có phiên nào để thoát — hiện nút chỉ làm
            người dùng bấm rồi thấy không có gì xảy ra. Nút nằm CUỐI, tách khỏi các lối vào thường dùng bằng khe 24 của
            cột, và là khối đỏ rộng hết bề ngang để đọc ra là "hành động thoát" (xem `MeLogoutButton`). */}
        {appConfig.authEnabled ? (
          <MeLogoutButton />
        ) : (
          <Text className="text-center text-caption-sm text-fg-2">
            Kiểm đăng nhập đang tắt — không có phiên nào để đăng xuất.
          </Text>
        )}

        {/* Đọc cho bộ phận hỗ trợ khi báo lỗi — quy ước màn tài khoản (tham chiếu vci-sun-mobile `ProfileScreen`). */}
        {Application.nativeApplicationVersion ? (
          <Text className="text-center text-caption-sm text-fg-2">
            Phiên bản {Application.nativeApplicationVersion}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
