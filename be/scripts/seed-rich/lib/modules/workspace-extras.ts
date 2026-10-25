/**
 * Bộ seed TIỆN ÍCH NHÓM làm việc: thông báo toàn nhóm (có xác nhận đã đọc), tin hẹn giờ / nhắc tin / tin đã lưu của `thu`, và tích hợp GitHub hư cấu
 * (chỉ phần an toàn, không token). Chạy SAU khi các nhóm, kênh và tin nhắn đã được seed (nhắc/lưu tin chọn từ tin thật trong kênh của thu).
 * Không outbox, không push/email/socket; thông báo hộp thư ghi thẳng với `pushStatus: SKIPPED`.
 */
import type { ModuleSeed } from "../module-ctx";
import { runAnnouncements, type AnnouncementTally } from "./extras-announcements";
import { runChatExtras } from "./extras-chat";
import { runIntegrations, type IntegrationTally } from "./extras-integrations";

export const seedWorkspaceExtras: ModuleSeed = async (c) => {
  const ann: AnnouncementTally = { channels: 0, announcements: 0, receipts: 0, notifications: 0, skipped: [] };
  await runAnnouncements(c, ann);
  const chat = await runChatExtras(c);
  const gh: IntegrationTally = { integrations: 0, events: 0, messages: 0, channels: 0, skipped: [] };
  await runIntegrations(c, gh);

  const skipped = [...ann.skipped, ...gh.skipped];
  return [
    `Tiện ích nhóm: +${ann.announcements} thông báo xác nhận (+${ann.receipts} biên nhận, +${ann.channels} kênh Thông báo, +${ann.notifications} thông báo hộp thư)`,
    `+${chat.scheduled} tin hẹn giờ, +${chat.reminders} nhắc tin (${chat.firedReminders} đã phát), +${chat.saved} tin đã lưu`,
    `+${gh.integrations} tích hợp GitHub (+${gh.events} sự kiện, +${gh.messages} tin hệ thống, +${gh.channels} kênh GitHub)`,
    ...(skipped.length > 0 ? [`bỏ qua: ${skipped.join("; ")}`] : []),
  ].join(", ");
};
