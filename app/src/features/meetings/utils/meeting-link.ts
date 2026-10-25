import Constants from 'expo-constants';
import { Share } from 'react-native';

import { showToast } from '@/shared/utils/toast.utils';

/**
 * Mã họp dạng `abc-defg-hij` (BE `MeetingCodeGenerator`: 10 chữ thường từ bảng 23 ký tự BỎ `i`, `l`, `o`). Khớp `resolveParamsSchema`
 * của BE. ⚠️ KHÁC ObjectId hội thoại (24 ký tự hex, không có dấu `-`) nên `/m/<x>` phân loại được theo HÌNH DẠNG — xem D-29.
 */
export const MEETING_CODE_REGEX = /^[a-hjkmnp-z]{3}-[a-hjkmnp-z]{4}-[a-hjkmnp-z]{3}$/;

/** Chuẩn hoá cái người dùng dán/gõ (khoảng trắng, HOA) về dạng mã; không giống mã ⇒ `null`. */
export function normalizeMeetingCode(input: string): string | null {
  const code = input.trim().toLowerCase();
  return MEETING_CODE_REGEX.test(code) ? code : null;
}

/** Khớp mặc định của `APP_LINK_DOMAIN` ở `app.config.ts` — dùng khi không đọc được cấu hình runtime. */
const DEFAULT_LINK_DOMAIN = 'superapp.vcijsc.com';

/** Miền universal link đang cấu hình (`ios.associatedDomains` do `app.config.ts` sinh từ `APP_LINK_DOMAIN`). */
export function linkDomain(): string {
  const domains = Constants.expoConfig?.ios?.associatedDomains;
  const applink = domains?.find((domain) => domain.startsWith('applinks:'));
  return applink ? applink.slice('applinks:'.length) : DEFAULT_LINK_DOMAIN;
}

/** `https://<miền>/m/<mã>` — link chia sẻ (mở app qua universal link, có `app/m/[id].tsx` phân loại). */
export function meetingShareUrl(code: string): string {
  return `https://${linkDomain()}/m/${code}`;
}

/**
 * Mã họp + chia sẻ qua bảng chia sẻ hệ thống (tiêu đề + mã + link `/m/<mã>`). ⚠️ `app/m/[id].tsx` HIỆN CHỈ chuyển tiếp sang hội thoại (chưa phân
 * loại mã họp bằng `MEETING_CODE_REGEX`/`useResolveMeetingCode`) nên bấm link này trong app chưa mở cuộc họp — route đó thuộc Chat, chưa sửa.
 * Không mở được bảng chia sẻ ⇒ toast.
 */
export async function shareMeeting(meeting: { code: string; title: string }): Promise<void> {
  try {
    await Share.share({
      message: `${meeting.title}\nMã họp: ${meeting.code}\n${meetingShareUrl(meeting.code)}`,
    });
  } catch {
    showToast('error', 'Không mở được bảng chia sẻ.');
  }
}

/** Có gì để chia sẻ không: người chỉ xem metadata, cuộc họp đã kết thúc/huỷ không có gì để mời ai vào. */
export function canShareMeeting(meeting: {
  isMetadataOnly: boolean;
  status: string;
}): boolean {
  return !meeting.isMetadataOnly && meeting.status !== 'CANCELLED' && meeting.status !== 'ENDED';
}
