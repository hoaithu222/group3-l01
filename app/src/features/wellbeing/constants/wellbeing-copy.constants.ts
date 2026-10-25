import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { WellbeingLevel, WellbeingSuggestion } from '../api/wellbeing.types';
import { WELLBEING_MIN_DAYS, WELLBEING_RETENTION_DAYS } from './wellbeing.constants';

/**
 * LỜI của tính năng — gom một chỗ để người duyệt nội dung (README p7-03 §10 "điểm mở": nên nhờ bộ phận hỗ trợ sinh viên duyệt câu chữ TRƯỚC khi bật cờ) đọc và sửa
 * mà không phải lục qua các component. Nguyên tắc (app.md §7): khuyến khích, không phán xét, không doạ; mức luôn có CHỮ chứ không chỉ màu; không dùng đỏ báo động;
 * không nói "kiệt sức/nguy hiểm/bệnh"; không nêu điểm số. ⚠️ Đây là gợi ý tham khảo để người dùng tự chăm sóc mình, KHÔNG phải chẩn đoán y tế — câu đó có mặt ở màn giải thích.
 */
export interface LevelCopy {
  headline: string;
  hint: string;
  icon: IconName;
  /** Chữ của mức (Thấp/Trung bình/Cao) — LUÔN hiện, màu chỉ hỗ trợ. */
  label: string;
  tone: IconTileTone;
}

export const LEVEL_COPY: Record<WellbeingLevel, LevelCopy> = {
  HIGH: {
    headline: 'Bạn đã làm việc rất nhiều gần đây',
    hint: 'Hãy dành thời gian nghỉ ngơi cho mình nhé. Bạn xứng đáng được nghỉ.',
    icon: 'alert-warning',
    label: 'Cao',
    tone: 'warning',
  },
  LOW: {
    headline: 'Nhịp học tập của bạn đang khá cân bằng',
    hint: 'Cứ giữ nhịp này và nhớ nghỉ ngắn giữa các buổi nhé.',
    icon: 'checkmark-circle',
    label: 'Thấp',
    tone: 'success',
  },
  MEDIUM: {
    headline: 'Gần đây bạn làm việc khá nhiều',
    hint: 'Một chút nghỉ ngơi sẽ giúp bạn giữ sức lâu hơn.',
    icon: 'alert-information',
    label: 'Trung bình',
    tone: 'warning',
  },
};

export interface SuggestionCopy {
  body: string;
  icon: IconName;
  title: string;
}

export const SUGGESTION_COPY: Record<WellbeingSuggestion, SuggestionCopy> = {
  BREAK: {
    body: 'Đứng dậy vươn vai, uống nước, nhìn ra xa một chút. Nghỉ ngắn giữa các buổi giúp đầu óc tỉnh táo hơn.',
    icon: 'timer',
    title: 'Nghỉ giải lao 10 phút',
  },
  SLEEP: {
    body: 'Thử dừng việc sớm hơn vào buổi tối để cơ thể được nghỉ ngơi trọn vẹn.',
    icon: 'clock',
    title: 'Ngủ sớm hơn một chút',
  },
  SPREAD_TASKS: {
    body: 'Xem lại những việc đang dồn lại và dời bớt việc chưa gấp sang ngày khác.',
    icon: 'calendar',
    title: 'Giãn bớt tiến độ',
  },
};

/** Thứ tự các gợi ý "cách khác" sau gợi ý chính. */
export const SUGGESTION_ORDER: readonly WellbeingSuggestion[] = ['BREAK', 'SPREAD_TASKS', 'SLEEP'];

/**
 * Lời trong thẻ cảnh báo (CHỈ hiện trong app — thông báo đẩy do BE gửi là trung tính, không mang câu này). Không nêu mức, không nêu số: thẻ nổi có thể lướt qua
 * trước mặt người khác, và mức "Cao" đọc to giữa lớp học là điều người dùng chưa chọn chia sẻ.
 */
export const ALERT_COPY: Record<WellbeingSuggestion | 'DEFAULT', string> = {
  BREAK: 'Bạn đã làm việc liên tục khá lâu. Nghỉ ngắn một chút nhé.',
  DEFAULT: 'Gần đây bạn làm việc khá nhiều. Nhớ dành thời gian nghỉ ngơi nhé.',
  SLEEP: 'Gần đây bạn hay hoạt động vào khuya. Thử ngủ sớm hơn một chút nhé.',
  SPREAD_TASKS: 'Gần đây bạn khá bận rộn. Thử giãn bớt những việc chưa gấp nhé.',
};

export interface PrivacyPoint {
  body: string;
  icon: IconName;
  key: string;
  title: string;
}

/**
 * Điều PHẢI nói rõ trước khi người dùng bật (dữ liệu sức khoẻ, opt-in): thu thập gì · ai KHÔNG thấy · giữ bao lâu · tắt/xoá thế nào. Dùng ở màn giải thích
 * (`WellbeingOnboardingScreen`) và nhắc lại ở Cài đặt. Mọi điều ở đây khớp hành vi THẬT của BE (`be/src/modules/burnout`, README p7-03 §2/§6):
 *  · chỉ ghi khung 15 phút có hoạt động + số lần thao tác, không nội dung;
 *  · chỉ chính người dùng xem; admin chỉ thấy số ẩn danh khi đủ ≥ 20 người; dữ liệu không dùng cho điểm/xếp hạng/huy hiệu;
 *  · giữ tối đa `WELLBEING_RETENTION_DAYS` ngày; tắt = ngừng thu thập + xoá ngay; thông báo đẩy trung tính.
 */
export const PRIVACY_POINTS: readonly PrivacyPoint[] = [
  {
    body: 'Chỉ khung giờ bạn hoạt động trong ứng dụng (theo từng khung 15 phút) và số lần thao tác như gửi tin, cập nhật công việc, ôn tập. Ứng dụng KHÔNG đọc nội dung tin nhắn, tài liệu hay bài làm của bạn.',
    icon: 'clock',
    key: 'collect',
    title: 'Ứng dụng ghi lại gì',
  },
  {
    body: 'Bạn bè, trưởng nhóm, giảng viên và quản trị viên đều KHÔNG thấy số liệu hay mức đánh giá của bạn. Quản trị viên chỉ thấy số tổng hợp ẩn danh, và chỉ khi có đủ nhiều người dùng.',
    icon: 'lock',
    key: 'private',
    title: 'Chỉ bạn xem được',
  },
  {
    body: 'Dữ liệu này không tính vào điểm, xếp hạng, huy hiệu hay đánh giá đóng góp của bạn.',
    icon: 'shield-user',
    key: 'no-score',
    title: 'Không dùng vào việc khác',
  },
  {
    body: `Số liệu theo ngày được giữ trên máy chủ tối đa ${String(WELLBEING_RETENTION_DAYS)} ngày rồi tự xoá. Cần ít nhất ${String(WELLBEING_MIN_DAYS)} ngày có hoạt động thì mới có nhận định.`,
    icon: 'calendar',
    key: 'retention',
    title: 'Lưu trong bao lâu',
  },
  {
    body: 'Ứng dụng có thể nhắc bạn nghỉ ngơi, tối đa một lần mỗi ngày. Thông báo trên màn hình khoá không nêu mức đánh giá. Bạn tắt riêng phần nhắc trong Cài đặt.',
    icon: 'noti',
    key: 'alerts',
    title: 'Nhắc nhẹ, kín đáo',
  },
  {
    body: 'Tắt theo dõi là ngừng thu thập và xoá toàn bộ số liệu đã có ngay lập tức. Bạn cũng có thể chỉ xoá dữ liệu mà vẫn giữ theo dõi.',
    icon: 'delete',
    key: 'control',
    title: 'Tắt và xoá bất cứ lúc nào',
  },
];

/** Lời miễn trừ — ngắn, nói thẳng. */
export const NOT_MEDICAL_NOTE =
  'Đây là gợi ý tham khảo để bạn tự chăm sóc bản thân, không phải chẩn đoán y tế. Nếu bạn thấy quá tải kéo dài, hãy trò chuyện với người thân hoặc bộ phận hỗ trợ sinh viên.';
