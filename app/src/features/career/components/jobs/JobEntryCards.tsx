import { router } from 'expo-router';

import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { useFeature } from '@/shell/capabilities';

import { useOfferEvents } from '../../hooks/useOfferEvents';
import { useJobSettings, useMyOffers } from '../../queries/offers.queries';
import { needsAttention } from '../../utils/offer-format';
import { JOB_SETTINGS_HREF, OFFERS_HREF, PROFILE_VIEWS_HREF } from '../../utils/recruiter-routes';

const ARROW = <Icon color="fg-2" name="arrow-right-small" size="sm" />;

/**
 * Ba lối vào ở màn Nghề nghiệp (app.md §1): "Tìm việc" (trạng thái Open to work), "Lời mời" (số lời mời chưa đọc) và "Ai đã xem hồ sơ của tôi"
 * (lượt xem theo ngày — chỉ khi cờ `career` bật VÀ bảng tin nhà tuyển dụng bật, cùng cổng `recruiterGuard` của BE). Ẩn HẲN khi bảng tin nhà tuyển dụng đang tắt và
 * bạn chưa từng bật (`recruiterEnabled = false && !openToWork`) — cờ tắt mà vẫn hiện thẻ là dẫn người dùng vào màn 404. Đang bật mà cờ tắt thì vẫn hiện để TẮT được.
 * Số chưa đọc = lời mời chưa mở + lời mời có tin trao đổi chưa đọc, tính trên TRANG ĐẦU (danh sách mới nhất trước); huy hiệu số có nhãn trợ năng riêng.
 */
export function JobEntryCards() {
  useOfferEvents();
  const settings = useJobSettings();
  const data = settings.data;
  const careerEnabled = useFeature('career') === true;
  const offers = useMyOffers(data?.recruiterEnabled === true);

  if (!data || (!data.recruiterEnabled && !data.openToWork)) return null;

  const unread = (offers.data?.pages[0]?.items ?? []).filter(needsAttention).length;

  return (
    <Card title="Tìm việc">
      {/* Ô icon: "Open to work" đổi tông theo trạng thái (bật = thành công, tắt = trung tính) — chữ mô tả vẫn nói rõ đang bật/tắt. */}
      <ListItem
        className="py-xs"
        description={
          data.openToWork
            ? 'Đang bật — doanh nghiệp đã duyệt có thể tìm thấy bạn'
            : 'Đang tắt — bật để nhận lời mời'
        }
        divider
        emphasis="title"
        label="Open to work"
        leading={<IconTile name="user-circle" tone={data.openToWork ? 'success' : 'neutral'} />}
        trailing={ARROW}
        onPress={() => router.push(JOB_SETTINGS_HREF)}
      />
      {data.recruiterEnabled ? (
        <>
          <ListItem
            className="py-xs"
            description="Lời mời việc làm từ doanh nghiệp"
            divider={careerEnabled}
            emphasis="title"
            label="Lời mời"
            leading={<IconTile name="email" tone="accent" />}
            trailing={
              unread > 0 ? (
                <Badge accessibilityLabel={`${String(unread)} lời mời chưa đọc`} count={unread} />
              ) : (
                ARROW
              )
            }
            onPress={() => router.push(OFFERS_HREF)}
          />
          {careerEnabled ? (
            <ListItem
              className="py-xs"
              description="Doanh nghiệp đã xem hồ sơ Tìm việc của bạn, theo ngày"
              emphasis="title"
              label="Ai đã xem hồ sơ của tôi"
              leading={<IconTile name="view" tone="info" />}
              trailing={ARROW}
              onPress={() => router.push(PROFILE_VIEWS_HREF)}
            />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
