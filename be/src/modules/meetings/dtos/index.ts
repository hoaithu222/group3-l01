import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { isValidIanaTimeZone } from "../../../core/utils/timezone";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";

const L = LIMITS.meeting;
const ianaTz = z.string().refine(isValidIanaTimeZone, "Múi giờ không hợp lệ");
const reminder = z.number().int().refine((m) => L.reminderOptionsMinutes.includes(m), "Mốc nhắc không hỗ trợ");
const version = z.number().int().min(1);

const meetingFields = {
  title: z.string().trim().min(1, "Tiêu đề bắt buộc").refine((s) => graphemeLength(s) <= L.titleMax, `Tiêu đề tối đa ${L.titleMax} ký tự`),
  agenda: z.string().optional().refine((s) => !s || graphemeLength(s) <= L.agendaMax, `Nội dung tối đa ${L.agendaMax} ký tự`),
  format: z.enum(["ONLINE", "OFFLINE", "HYBRID"]),
  location: z.string().trim().max(L.locationMax).optional(),
  platform: z.enum(["INTERNAL", "ZOOM", "TEAMS", "GOOGLE_MEET", "OTHER"]),
  externalUrl: z.string().url().max(2048).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  timezone: ianaTz,
  visibility: z.enum(["ATTENDEES", "WORKSPACE"]),
  lobbyMode: z.enum(["OFF", "NON_ATTENDEES", "ALL"]),
  reminderMinutes: z.array(reminder).max(L.remindersMax),
  notifyVia: z.enum(["APP", "CHAT", "BOTH"]),
  recapRequired: z.boolean(),
  recordingAllowed: z.boolean(),
};

/** Lỗi nghiệp vụ trong `superRefine` mang `message = mã lỗi` (be.md §3) — service/handler map sang mã `MEET_*`. */
export const createMeetingSchema = z
  .object({
    title: meetingFields.title,
    agenda: meetingFields.agenda,
    format: meetingFields.format.default("ONLINE"),
    location: meetingFields.location,
    platform: meetingFields.platform.default("INTERNAL"),
    externalUrl: meetingFields.externalUrl,
    startAt: meetingFields.startAt,
    endAt: meetingFields.endAt,
    timezone: meetingFields.timezone,
    attendeeIds: z.array(objectIdSchema).max(L.attendeesMax).default([]),
    coHostIds: z.array(objectIdSchema).max(L.coHostsMax).default([]),
    visibility: meetingFields.visibility.default("ATTENDEES"),
    lobbyMode: meetingFields.lobbyMode.default("NON_ATTENDEES"),
    reminderMinutes: meetingFields.reminderMinutes.default([15]),
    notifyVia: meetingFields.notifyVia.default("APP"),
    recapRequired: meetingFields.recapRequired.default(false),
    recordingAllowed: meetingFields.recordingAllowed.default(true),
    createChatGroup: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.endAt <= v.startAt) ctx.addIssue({ code: "custom", path: ["endAt"], message: "MEET_003" });
    if (+v.endAt - +v.startAt > L.scheduleMaxDurationMinutes * 60_000) ctx.addIssue({ code: "custom", path: ["endAt"], message: "MEET_003" });
    if (v.platform !== "INTERNAL" && !v.externalUrl) ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "MEET_015" });
    if (v.format === "OFFLINE" && v.platform !== "INTERNAL") ctx.addIssue({ code: "custom", path: ["platform"], message: "MEET_015" });
  });
export type CreateMeetingDto = z.infer<typeof createMeetingSchema>;

/** Mọi trường tuỳ chọn + `expectedVersion`. Khoá lỗi thời gian (endAt > startAt) kiểm ở service vì cần giá trị hiện tại. */
export const updateMeetingSchema = z
  .object({
    title: meetingFields.title.optional(),
    agenda: meetingFields.agenda,
    format: meetingFields.format.optional(),
    location: meetingFields.location,
    platform: meetingFields.platform.optional(),
    externalUrl: meetingFields.externalUrl,
    startAt: meetingFields.startAt.optional(),
    endAt: meetingFields.endAt.optional(),
    timezone: meetingFields.timezone.optional(),
    visibility: meetingFields.visibility.optional(),
    lobbyMode: meetingFields.lobbyMode.optional(),
    reminderMinutes: meetingFields.reminderMinutes.optional(),
    notifyVia: meetingFields.notifyVia.optional(),
    recapRequired: meetingFields.recapRequired.optional(),
    recordingAllowed: meetingFields.recordingAllowed.optional(),
    expectedVersion: version,
  })
  .strict();
export type UpdateMeetingDto = z.infer<typeof updateMeetingSchema>;

export const cancelMeetingSchema = z.object({ expectedVersion: version, reason: z.string().trim().max(500).optional() });
export type CancelMeetingDto = z.infer<typeof cancelMeetingSchema>;

export const deleteMeetingQuerySchema = z.object({ expectedVersion: z.coerce.number().int().min(1), reason: z.string().trim().max(500).optional() });
export type DeleteMeetingQueryDto = z.infer<typeof deleteMeetingQuerySchema>;

export const meetingIdParamSchema = z.object({ meetingId: objectIdSchema });
export const workspaceIdParamSchema = z.object({ workspaceId: objectIdSchema });
export const attendeeParamSchema = z.object({ meetingId: objectIdSchema, userId: objectIdSchema });

export const addAttendeesSchema = z.object({
  userIds: z.array(objectIdSchema).min(1).max(L.attendeesMax),
  role: z.enum(["ATTENDEE", "CO_HOST"]).default("ATTENDEE"),
});
export type AddAttendeesDto = z.infer<typeof addAttendeesSchema>;

export const setAttendeeRoleSchema = z.object({ role: z.enum(["CO_HOST", "ATTENDEE"]) });
export type SetAttendeeRoleDto = z.infer<typeof setAttendeeRoleSchema>;

export const transferHostSchema = z.object({ toUserId: objectIdSchema, expectedVersion: version });
export type TransferHostDto = z.infer<typeof transferHostSchema>;

export const rsvpSchema = z.object({ rsvp: z.enum(["ACCEPTED", "DECLINED", "TENTATIVE"]) });
export type RsvpDto = z.infer<typeof rsvpSchema>;

const statusList = z
  .union([z.enum(["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]), z.array(z.enum(["SCHEDULED", "LIVE", "ENDED", "CANCELLED"]))])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional();

/** `?status=SCHEDULED&status=LIVE`; cửa sổ ≤ `rangeMaxDays`. */
export const meetingRangeQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    status: statusList,
    scope: z.enum(["MINE", "ALL_VISIBLE"]).default("MINE"),
    workspaceId: objectIdSchema.optional(),
  })
  .refine((q) => q.to > q.from && +q.to - +q.from <= L.rangeMaxDays * 86_400_000, { message: "Khoảng thời gian không hợp lệ", path: ["to"] });
export type MeetingRangeQueryDto = z.infer<typeof meetingRangeQuerySchema>;

export const resolveParamsSchema = z.object({ code: z.string().regex(/^[a-hjkmnp-z]{3}-[a-hjkmnp-z]{4}-[a-hjkmnp-z]{3}$/, "Mã họp không hợp lệ") });

export const attendeesQuerySchema = cursorQuerySchema;
export type AttendeesQueryDto = z.infer<typeof attendeesQuerySchema>;
export * from "./admin-meetings.dto";
export * from "./meeting-room.dto";
export * from "./meeting-recap.dto";
export * from "./meeting-recording.dto";
