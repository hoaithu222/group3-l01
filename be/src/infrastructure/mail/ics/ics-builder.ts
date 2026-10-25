/**
 * Dựng VCALENDAR (RFC 5545) THUẦN — không phụ thuộc module nghiệp vụ (p2-04 be.md §1). Dùng cho email mời họp
 * (`METHOD:REQUEST`), huỷ/bị xoá khỏi danh sách (`METHOD:CANCEL`) và tải `.ics` từ app (`METHOD:PUBLISH`).
 * Cùng `UID` + `SEQUENCE` tăng dần làm lịch Outlook/Google/Apple cập nhật ĐÚNG MỘT mục thay vì nhân đôi.
 */
export type IcsMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export interface IcsEventInput {
  method: IcsMethod;
  /** `<meetingId>@superapp.vcijsc.com` — ổn định qua mọi lần cập nhật. */
  uid: string;
  /** = `Meeting.version` (luôn tăng). */
  sequence: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** Thời điểm bắt đầu/kết thúc (UTC). */
  startAt: Date;
  endAt: Date;
  /** Múi giờ IANA của cuộc họp — ghi ở `X-WR-TIMEZONE` để lịch hiển thị đúng vùng. */
  timezone: string;
  organizer?: { email: string; name?: string };
  attendeeEmails?: string[];
  /** Mặc định: `CANCELLED` khi method CANCEL, còn lại `CONFIRMED`. */
  status?: "CONFIRMED" | "CANCELLED";
  /** `DTSTAMP` — mặc định bây giờ (test truyền cố định để snapshot ổn định). */
  now?: Date;
}

const CRLF = "\r\n";

/** Escape giá trị TEXT (RFC 5545 §3.3.11): `\`, `;`, `,` và xuống dòng. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** `YYYYMMDDTHHmmssZ` (UTC). */
export function formatIcsDateTime(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Gấp dòng ≤ 75 octet UTF-8 (không cắt giữa ký tự nhiều byte), dòng tiếp bắt đầu bằng 1 khoảng trắng. */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // dòng tiếp có 1 khoảng trắng đầu dòng
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function quoteParam(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

export function buildIcs(e: IcsEventInput): string {
  const status = e.status ?? (e.method === "CANCEL" ? "CANCELLED" : "CONFIRMED");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Super App//Lich hop//VI",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method}`,
    `X-WR-TIMEZONE:${e.timezone}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${formatIcsDateTime(e.now ?? new Date())}`,
    `DTSTART:${formatIcsDateTime(e.startAt)}`,
    `DTEND:${formatIcsDateTime(e.endAt)}`,
    `SUMMARY:${escapeIcsText(e.summary)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
  if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.organizer) lines.push(`ORGANIZER${e.organizer.name ? `;CN=${quoteParam(e.organizer.name)}` : ""}:mailto:${e.organizer.email}`);
  for (const email of e.attendeeEmails ?? []) lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${email}`);
  lines.push(`STATUS:${status}`, "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
