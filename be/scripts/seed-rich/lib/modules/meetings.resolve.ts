/**
 * Phần THUẦN (không chạm DB) của seed họp: biến kế hoạch trong `meetings.content.ts` thành các cuộc họp/người tham dự/biên bản đầy đủ trường,
 * khớp quy ước của `MeetingService` (số đếm phi chuẩn hoá, mốc thời gian, trạng thái). Mọi ngẫu nhiên đều tất định theo khoá.
 */
import type { Directory } from "../core";
import { DAY_MS, MIN_MS } from "../core";
import type { WorkspaceCtx } from "../workspace";
import { atVn, between, dayLabel, stableId, weekdayVn, mixedRng } from "./mpq-util";
import { MEETINGS, SERIES, type Att, type MeetingPlan, type RecapPlan, type RsvpCode, type SeriesPlan, type Where } from "./meetings.content";

export type MeetingState = "SCHEDULED" | "ENDED" | "CANCELLED";
export type Rsvp = "PENDING" | "ACCEPTED" | "DECLINED" | "TENTATIVE";
export type Role = "HOST" | "CO_HOST" | "ATTENDEE";

export interface ResolvedAttendee {
  key: string;
  userId: string;
  role: Role;
  rsvp: Rsvp;
  rsvpAt: Date | null;
  invitedAt: Date;
  firstJoinedAt: Date | null;
  attendedSeconds: number;
  updatedAt: Date;
}

export interface ResolvedRecap {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date;
  publishedAt: Date | null;
  publishedBy: string | null;
  version: number;
  updatedAt: Date;
}

export interface ResolvedMeeting {
  key: string;
  id: string;
  ws: WorkspaceCtx;
  title: string;
  agenda: string;
  where: Where | undefined;
  startAt: Date;
  endAt: Date;
  state: MeetingState;
  hostId: string;
  open: boolean;
  remind: number[];
  recapRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: "HOST_ENDED" | "EMPTY" | null;
  cancel: { at: Date; by: string; reason: string } | null;
  series: { id: string; index: number; exception: boolean } | null;
  attendees: ResolvedAttendee[];
  recap: ResolvedRecap | null;
}

export interface ResolvedSeries {
  id: string;
  ws: WorkspaceCtx;
  plan: SeriesPlan;
  hostId: string;
  attendeeIds: string[];
  coHostIds: string[];
  materializedUntil: Date;
  createdAt: Date;
}

export interface ResolveInput {
  dir: Directory;
  now: Date;
  workspaces: ReadonlyMap<string, WorkspaceCtx>;
  /** `workspaceId` → `userId` → thời điểm vào nhóm. */
  joined: ReadonlyMap<string, ReadonlyMap<string, Date>>;
}

/** Thời điểm người này vào nhóm; chủ nhóm có mặt từ lúc nhóm được tạo. */
function memberSince(i: ResolveInput, ws: WorkspaceCtx, key: string): Date | undefined {
  if (ws.roles.get(key) === "OWNER") return ws.createdAt;
  try {
    return i.joined.get(ws.id)?.get(i.dir.id(key));
  } catch {
    return undefined;
  }
}

const RSVP: Record<RsvpCode, Rsvp> = { A: "ACCEPTED", D: "DECLINED", T: "TENTATIVE", P: "PENDING" };
const WEEKDAY: Record<SeriesPlan["weekday"], number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Tên rút gọn dùng trong biên bản. */
function shortName(key: string, full: string): string {
  const special: Record<string, string> = { gvhung: "thầy Hùng", mentorha: "cô Hà", mentortuan: "anh Tuấn", mentorson: "anh Sơn" };
  if (special[key]) return special[key];
  return full.replace(/^TS\.\s*/, "").split(/\s+/).slice(-2).join(" ");
}

export function renderText(dir: Directory, text: string, startAt: Date): string {
  return text.replace(/\{(\+\d+|[a-z]+)\}/g, (_m, token: string) => {
    if (token.startsWith("+")) return dayLabel(startAt, Number(token.slice(1)));
    try {
      return shortName(token, dir.name(token));
    } catch {
      return token;
    }
  });
}

interface Base {
  key: string;
  ws: WorkspaceCtx;
  host: string;
  co: string[];
  title: string;
  agenda: string;
  start: Date;
  mins: number;
  where: Where | undefined;
  remind: number[];
  open: boolean;
  recapRequired: boolean;
  att: Att[];
  state: MeetingState;
  ended: MeetingPlan["ended"];
  cancel: MeetingPlan["cancel"];
  recap: RecapPlan | undefined;
  series: { id: string; index: number; exception: boolean } | null;
  /** Mốc tạo cuộc họp dùng chung (chuỗi: mọi buổi được vật chất hoá cùng lúc). */
  fixedCreatedAt?: Date;
  upcomingIndex?: number;
}

function planBase(p: MeetingPlan, i: ResolveInput): Base | null {
  const ws = i.workspaces.get(p.ws);
  if (!ws) return null;
  let start = atVn(i.now, p.day, p.at[0], p.at[1]);
  const dur = p.mins * MIN_MS;
  const over = (p.ended?.over ?? 0) * MIN_MS;
  const state: MeetingState = p.cancel ? "CANCELLED" : p.day < 0 ? "ENDED" : "SCHEDULED";
  // Đồng hồ máy lệch (chạy sát nửa đêm): buổi đã diễn ra phải kết thúc trước `now`, buổi sắp tới phải còn xa.
  if (state === "ENDED") while (start.getTime() + dur + over > i.now.getTime() - 30 * MIN_MS) start = new Date(start.getTime() - DAY_MS);
  else while (start.getTime() < i.now.getTime() + 3 * 3_600_000) start = new Date(start.getTime() + DAY_MS);
  return {
    key: p.key, ws, host: p.host, co: p.co ?? [], title: p.title, agenda: p.agenda, start, mins: p.mins, where: p.where, remind: p.remind ?? [15],
    open: p.open ?? false, recapRequired: p.recapRequired ?? false, att: p.att, state, ended: p.ended, cancel: p.cancel, recap: p.recap, series: null,
  };
}

function seriesBases(s: SeriesPlan, i: ResolveInput, seriesId: string, createdAt: Date): Base[] {
  const ws = i.workspaces.get(s.ws) as WorkspaceCtx;
  const lower = ws.createdAt.getTime() + DAY_MS;
  let d = -14;
  while (weekdayVn(atVn(i.now, d, 12)) !== WEEKDAY[s.weekday] || atVn(i.now, d, s.at[0], s.at[1]).getTime() < lower) d += 1;
  const out: Base[] = [];
  let firstUpcoming = -1;
  for (let n = 0; n < s.count; n += 1) {
    let start = atVn(i.now, d + 7 * n, s.at[0], s.at[1]);
    let title = s.title;
    const exception = s.exception?.index === n;
    if (s.exception && exception) {
      start = atVn(i.now, d + 7 * n + s.exception.shiftDays, s.exception.at[0], s.exception.at[1]);
      title = s.exception.title;
    }
    const ended = start.getTime() + s.mins * MIN_MS + 15 * MIN_MS <= i.now.getTime();
    if (!ended && firstUpcoming < 0) firstUpcoming = n;
    const recap = s.recaps[n];
    out.push({
      key: `${s.key}#${n}`, ws, host: s.host, co: s.co ?? [], title, agenda: s.agenda, start, mins: s.mins, where: s.where, remind: s.remind ?? [15],
      open: false, recapRequired: s.recapRequired ?? false, att: [], state: ended ? "ENDED" : "SCHEDULED", ended: undefined, cancel: undefined,
      recap: recap && ended ? { author: recap.author, text: recap.text } : undefined, series: { id: seriesId, index: n, exception }, fixedCreatedAt: createdAt,
      upcomingIndex: ended ? -1 : n - Math.max(firstUpcoming, 0),
    });
  }
  return out;
}

/** RSVP + điểm danh của một buổi trong chuỗi: buổi đã qua suy ra từ RSVP mặc định, buổi sắp tới: chỉ buổi kế tiếp giữ RSVP, các buổi sau phần lớn chưa trả lời. */
function seriesAttendance(s: SeriesPlan, b: Base): Att[] {
  return s.att.map(([who, rsvp]): Att => {
    const rng = mixedRng(`series-att:${b.key}:${who}`);
    if (b.state === "SCHEDULED") {
      const keep = (b.upcomingIndex ?? 0) === 0 || rng() < 0.25;
      return [who, keep ? rsvp : "P"];
    }
    const attend = rsvp === "D" ? 0 : rsvp === "A" ? 0.92 : rsvp === "T" ? 0.6 : 0.45;
    if (rng() >= attend) return [who, rsvp];
    const join = Math.floor(rng() * 7);
    return [who, rsvp === "P" ? "A" : rsvp, join, Math.max(15, b.mins - join - Math.floor(rng() * 9))];
  });
}

function makeRecap(i: ResolveInput, b: Base, attendeeIds: Map<string, string>, hostId: string, endedAt: Date, rng: () => number): ResolvedRecap | null {
  const r = b.recap;
  if (!r || b.state !== "ENDED") return null;
  const author = attendeeIds.get(r.author) ?? hostId;
  const hostLike = new Set([hostId, ...b.co.map((k) => attendeeIds.get(k)).filter((x): x is string => !!x)]);
  const by = r.by ? attendeeIds.get(r.by) : undefined;
  const publisher = by && hostLike.has(by) ? by : hostId;
  const content = renderText(i.dir, r.text, b.start);
  const createdAt = new Date(Math.min(endedAt.getTime() + between(rng, 6, 40) * MIN_MS, i.now.getTime() - 2 * MIN_MS));
  const edits = r.edits ?? 0;
  const publish = r.publish !== false;
  const publishedAt = publish ? new Date(Math.min(Math.max(createdAt.getTime() + 8 * MIN_MS, endedAt.getTime() + (r.delayMin ?? between(rng, 30, 180)) * MIN_MS), i.now.getTime() - MIN_MS)) : null;
  const last = new Date(Math.min(createdAt.getTime() + (edits > 0 ? 6 * MIN_MS * edits : 0), (publishedAt ?? i.now).getTime() - (publish ? 60_000 : 0)));
  return {
    id: stableId(`recap:${b.key}`),
    authorId: author,
    content,
    createdAt,
    publishedAt,
    publishedBy: publish ? publisher : null,
    version: 1 + edits + (publish ? 1 : 0),
    updatedAt: publishedAt ?? last,
  };
}

function resolveOne(b: Base, i: ResolveInput): ResolvedMeeting | null {
  const rng = mixedRng(`meeting:${b.key}`);
  const joinedAt = (key: string): Date | undefined => memberSince(i, b.ws, key);
  const startAt = b.start;
  const endAt = new Date(startAt.getTime() + b.mins * MIN_MS);
  const cancelAt = b.cancel ? new Date(i.now.getTime() - b.cancel.hoursAgo * 3_600_000) : null;
  const upper = new Date(
    Math.min(startAt.getTime() - (b.state === "SCHEDULED" ? 2 * 3_600_000 : 45 * MIN_MS), i.now.getTime() - 20 * MIN_MS, cancelAt ? cancelAt.getTime() - 60 * MIN_MS : Infinity)
  );
  const okMember = (key: string): boolean => b.ws.roles.has(key) && (joinedAt(key)?.getTime() ?? Infinity) + 10 * MIN_MS <= upper.getTime();
  if (!okMember(b.host)) return null;

  const att = b.att.filter(([k]) => k !== b.host && okMember(k));
  const people = [b.host, ...att.map(([k]) => k)];
  // Chuỗi họp được tạo một lần; người vào nhóm sau đó chỉ được thêm vào (mốc mời muộn hơn), không kéo lùi mốc tạo cuộc họp.
  const floor = Math.max(b.ws.createdAt.getTime() + 5 * MIN_MS, ...(b.series ? [b.host] : people).map((k) => (joinedAt(k)?.getTime() ?? 0) + 10 * MIN_MS));
  const invitedAtOf = (key: string, created: Date): Date => (b.series ? new Date(Math.max(created.getTime(), (joinedAt(key)?.getTime() ?? 0) + 10 * MIN_MS)) : created);
  const desired = b.fixedCreatedAt ?? (b.state === "ENDED" ? new Date(startAt.getTime() - between(rng, 1, 6) * DAY_MS) : new Date(i.now.getTime() - between(rng, 0.15, 3.4) * DAY_MS));
  let createdAt = new Date(Math.min(Math.max(desired.getTime(), floor), upper.getTime()));
  if (b.series) createdAt = new Date(createdAt.getTime() + b.series.index * 1000);

  // Mốc diễn ra thật của buổi họp đã kết thúc.
  const lateMin = b.ended?.late ?? Math.floor(rng() * 4);
  const startedAt = b.state === "ENDED" ? new Date(startAt.getTime() + lateMin * MIN_MS + Math.floor(rng() * 40_000)) : null;
  const overMin = b.ended?.over ?? Math.round(between(rng, -5, 8));
  const endLeave = startedAt ? new Date(Math.max(endAt.getTime() + overMin * MIN_MS, startedAt.getTime() + 20 * MIN_MS)) : null;
  const reason = b.ended?.reason ?? "HOST_ENDED";
  const endedAt = endLeave ? new Date(endLeave.getTime() + (reason === "EMPTY" ? 320_000 : 0)) : null;

  const attendees: ResolvedAttendee[] = [];
  const hostId = i.dir.id(b.host);
  const lastRsvpAt = new Date(Math.min(i.now.getTime() - MIN_MS, b.cancel ? i.now.getTime() - b.cancel.hoursAgo * 3_600_000 - MIN_MS : startAt.getTime() - 5 * MIN_MS));
  attendees.push({
    key: b.host, userId: hostId, role: "HOST", rsvp: "ACCEPTED", rsvpAt: createdAt, invitedAt: createdAt,
    firstJoinedAt: startedAt, attendedSeconds: startedAt && endLeave ? Math.max(60, Math.floor((endLeave.getTime() - startedAt.getTime()) / 1000) - Math.floor(rng() * 50)) : 0,
    updatedAt: endedAt ? new Date(endedAt.getTime() + 1000) : createdAt,
  });
  const ids = new Map<string, string>([[b.host, hostId]]);
  for (const [key, code, join, stay] of att) {
    const userId = i.dir.id(key);
    ids.set(key, userId);
    const arng = mixedRng(`attendee:${b.key}:${key}`);
    const rsvp = RSVP[code];
    const invitedAt = invitedAtOf(key, createdAt);
    const rsvpAt = rsvp === "PENDING" ? null : new Date(Math.min(invitedAt.getTime() + between(arng, 8, 36 * 60) * MIN_MS, Math.max(lastRsvpAt.getTime(), invitedAt.getTime() + MIN_MS)));
    let firstJoinedAt: Date | null = null;
    let attendedSeconds = 0;
    if (startedAt && endLeave && join !== undefined && stay !== undefined) {
      const joinAt = new Date(startedAt.getTime() + join * MIN_MS + Math.floor(arng() * 45_000));
      const leave = new Date(Math.min(joinAt.getTime() + stay * MIN_MS, endLeave.getTime()));
      if (leave.getTime() - joinAt.getTime() >= 60_000) {
        firstJoinedAt = joinAt;
        attendedSeconds = Math.floor((leave.getTime() - joinAt.getTime()) / 1000);
      }
    }
    attendees.push({
      key, userId, role: b.co.includes(key) ? "CO_HOST" : "ATTENDEE", rsvp, rsvpAt, invitedAt, firstJoinedAt, attendedSeconds,
      updatedAt: endedAt && firstJoinedAt ? new Date(endedAt.getTime() + 1000) : (rsvpAt ?? invitedAt),
    });
  }

  const recap = endedAt ? makeRecap(i, b, ids, hostId, endedAt, rng) : null;
  return {
    key: b.key, id: stableId(`meeting:${b.key}`), ws: b.ws, title: b.title, agenda: renderText(i.dir, b.agenda, startAt), where: b.where, startAt, endAt, state: b.state, hostId,
    open: b.open, remind: [...b.remind].sort((x, y) => y - x), recapRequired: b.recapRequired, createdAt,
    updatedAt: cancelAt ?? endedAt ?? createdAt, version: b.state === "ENDED" ? 3 : b.state === "CANCELLED" || b.series?.exception ? 2 : 1,
    startedAt, endedAt, endReason: endedAt ? reason : null,
    cancel: b.cancel && cancelAt ? { at: cancelAt, by: i.dir.id(b.cancel.by), reason: b.cancel.reason } : null,
    series: b.series, attendees, recap,
  };
}

export function resolveAll(i: ResolveInput): { meetings: ResolvedMeeting[]; series: ResolvedSeries[]; skipped: string[] } {
  const meetings: ResolvedMeeting[] = [];
  const series: ResolvedSeries[] = [];
  const skipped: string[] = [];
  for (const p of MEETINGS) {
    const base = planBase(p, i);
    const m = base ? resolveOne(base, i) : null;
    if (m) meetings.push(m);
    else skipped.push(p.key);
  }
  for (const s of SERIES) {
    const ws = i.workspaces.get(s.ws);
    if (!ws) {
      skipped.push(s.key);
      continue;
    }
    const seriesId = stableId(`series:${s.key}`);
    const rng = mixedRng(`series:${s.key}`);
    const probe = seriesBases(s, i, seriesId, ws.createdAt)[0] as Base;
    const people = [s.host, ...s.att.map(([k]) => k)].filter((k) => ws.roles.has(k) && (memberSince(i, ws, k)?.getTime() ?? Infinity) + 30 * MIN_MS <= i.now.getTime());
    if (!people.includes(s.host)) {
      skipped.push(s.key);
      continue;
    }
    const floor = Math.max(ws.createdAt.getTime() + 5 * MIN_MS, (memberSince(i, ws, s.host)?.getTime() ?? 0) + 10 * MIN_MS);
    const createdAt = new Date(Math.min(Math.max(probe.start.getTime() - between(rng, 2, 4) * DAY_MS, floor), probe.start.getTime() - 2 * 3_600_000));
    const bases = seriesBases(s, i, seriesId, createdAt);
    const kept = new Set(people);
    let last = probe.start;
    for (const b of bases) {
      b.att = seriesAttendance(s, b).filter(([k]) => kept.has(k));
      const m = resolveOne(b, i);
      if (m) {
        meetings.push(m);
        last = m.startAt;
      }
    }
    series.push({
      id: seriesId, ws, plan: s, hostId: i.dir.id(s.host), createdAt,
      coHostIds: (s.co ?? []).filter((k) => kept.has(k)).map((k) => i.dir.id(k)),
      attendeeIds: s.att.map(([k]) => k).filter((k) => kept.has(k) && !(s.co ?? []).includes(k)).map((k) => i.dir.id(k)),
      materializedUntil: last,
    });
  }
  return { meetings, series, skipped };
}
