import { View } from 'react-native';

import { Section } from '@/shared/ui/section';

import type { WorkspaceOption } from '../../api/meetings.types';
import type { MeetingFormApi } from './meeting-form.types';
import { MeetingBasicSection } from './MeetingBasicSection';
import { MeetingNotifyField } from './MeetingNotifyField';
import { MeetingOnlineSection } from './MeetingOnlineSection';
import { MeetingPeopleFields } from './MeetingPeopleFields';
import { MeetingReminderField } from './MeetingReminderField';
import { MeetingSettingsSection } from './MeetingSettingsSection';
import { MeetingWhenFields } from './MeetingWhenFields';

export type { MeetingFormApi } from './meeting-form.types';

export interface MeetingFormProps {
  form: MeetingFormApi;
  /** Nhóm chat họp đã có (mở form sửa). */
  hasChatGroup?: boolean;
  /** Họp đang diễn ra: khoá ngày/giờ bắt đầu, múi giờ, nền tảng, hình thức (BE chỉ nhận tiêu đề/agenda/`endAt`/lobby). */
  limited?: boolean;
  /** Chỉ khi TẠO — sửa thì không đổi nhóm/không chọn người ở đây (chi tiết có màn quản lý người tham dự). */
  workspaces?: readonly WorkspaceOption[];
}

/**
 * Form tạo/sửa cuộc họp (app.md p2-04 §3). ĐIỆN THOẠI một cột; MÁY TÍNH BẢNG hai cột (`tablet:flex-row`, class chứ không hook —
 * `responsive.md` §2): trái = Cơ bản + Thời gian + Nơi họp, phải = Người tham dự + Nhắc lịch + Tuỳ chọn khác. Nút Tạo/Lưu và lỗi gửi
 * nằm ở chân màn (`MeetingFormScreen`), luôn thấy khi cuộn.
 *
 * Thứ tự theo câu hỏi người tạo tự hỏi: cái gì → khi nào → ở đâu → với ai (+ có lập nhóm chat không) → nhắc thế nào → phần còn lại (ít
 * khi đổi, mặc định dùng được: thu gọn khi tạo).
 */
export function MeetingForm({ form, hasChatGroup, limited = false, workspaces }: MeetingFormProps) {
  const creating = workspaces !== undefined;
  // Form dài (5–6 khối): icon nhỏ trước mỗi tiêu đề nhóm là mốc để mắt nhảy nhanh giữa các khối khi cuộn (`Section icon`).
  return (
    <View className="gap-xl py-xs tablet:flex-row tablet:items-start">
      <View className="gap-xl tablet:flex-1">
        <Section icon="edit" title="Thông tin cơ bản">
          <MeetingBasicSection form={form} workspaces={workspaces} />
        </Section>
        <Section icon="clock" title="Thời gian">
          <MeetingWhenFields form={form} startLocked={limited} />
        </Section>
        <Section icon="location" title="Nơi họp">
          <MeetingOnlineSection form={form} limited={limited} />
        </Section>
      </View>
      <View className="gap-xl tablet:flex-1">
        {creating ? (
          <Section icon="add-team" title="Người tham dự">
            <MeetingPeopleFields control={form.control} />
          </Section>
        ) : null}
        {limited ? null : (
          <Section icon="notification" title="Nhắc lịch">
            <View className="gap-md">
              <MeetingReminderField control={form.control} />
              <MeetingNotifyField
                form={form}
                hasChatGroup={hasChatGroup}
                mode={creating ? 'create' : 'edit'}
              />
            </View>
          </Section>
        )}
        {creating ? (
          <MeetingSettingsSection form={form} limited={limited} mode="create" />
        ) : (
          <Section icon="setting" title="Cài đặt">
            <MeetingSettingsSection form={form} limited={limited} mode="edit" />
          </Section>
        )}
      </View>
    </View>
  );
}
