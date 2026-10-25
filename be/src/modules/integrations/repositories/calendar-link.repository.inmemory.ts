import type { CalendarLinkEntity } from "../entities/integration.interface";
import type { ICalendarLinkRepository, UpsertCalendarLinkInput } from "./calendar-link.repository.interface";

/** Repository in-memory cho unit test: mô phỏng `@@unique([meetingId, userId])`. */
export class InMemoryCalendarLinkRepository implements ICalendarLinkRepository {
  readonly rows = new Map<string, CalendarLinkEntity>();
  private seq = 0;

  find(meetingId: string, userId: string): Promise<CalendarLinkEntity | null> {
    const row = [...this.rows.values()].find((r) => r.meetingId === meetingId && r.userId === userId);
    return Promise.resolve(row ? { ...row } : null);
  }

  upsert(input: UpsertCalendarLinkInput): Promise<CalendarLinkEntity> {
    const existing = [...this.rows.values()].find((r) => r.meetingId === input.meetingId && r.userId === input.userId);
    const row: CalendarLinkEntity = {
      id: existing?.id ?? `cal_${++this.seq}`,
      meetingId: input.meetingId,
      userId: input.userId,
      userIntegrationId: input.userIntegrationId,
      externalEventId: input.externalEventId,
      etag: input.etag,
      syncedVersion: input.syncedVersion,
      deletedAt: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve({ ...row });
  }

  markDeleted(id: string, syncedVersion: number): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, deletedAt: new Date(), syncedVersion });
    return Promise.resolve();
  }

  listLiveByMeeting(meetingId: string): Promise<CalendarLinkEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.meetingId === meetingId && !r.deletedAt).map((r) => ({ ...r })));
  }

  listLiveByUserIntegration(userIntegrationId: string, limit: number): Promise<CalendarLinkEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.userIntegrationId === userIntegrationId && !r.deletedAt).slice(0, limit).map((r) => ({ ...r })));
  }

  deleteByUserIntegration(userIntegrationId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (row.userIntegrationId === userIntegrationId) {
        this.rows.delete(id);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}
