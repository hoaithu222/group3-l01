/**
 * Allowlist host cho nền tảng họp ngoài (p2-04 README §2 "Nền tảng ngoài", chống link lừa đảo): host phải trùng tên miền gốc
 * hoặc là tên miền con (`us02web.zoom.us` khớp `zoom.us`). `OTHER` chấp nhận mọi host nhưng vẫn bắt buộc HTTPS.
 */
export const MEETING_PLATFORM_HOSTS = {
  ZOOM: ["zoom.us"],
  TEAMS: ["teams.microsoft.com", "teams.live.com"],
  GOOGLE_MEET: ["meet.google.com"],
} as const satisfies Record<string, readonly string[]>;

export type ExternalMeetingPlatform = "ZOOM" | "TEAMS" | "GOOGLE_MEET" | "OTHER";

/** `true` khi `url` hợp lệ cho `platform` (HTTPS, không kèm thông tin đăng nhập, host thuộc allowlist nếu có). */
export function isValidMeetingExternalUrl(platform: ExternalMeetingPlatform, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") return false;
  if (platform === "OTHER") return true;
  const host = parsed.hostname.toLowerCase();
  return MEETING_PLATFORM_HOSTS[platform].some((root) => host === root || host.endsWith(`.${root}`));
}
