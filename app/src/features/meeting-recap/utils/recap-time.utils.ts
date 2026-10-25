import dayjs from 'dayjs';

/** ISO → `HH:mm` theo giờ MÁY (ô giờ họp thực tế của biên bản); không có/không hợp lệ → `null` (ô trống). */
export function formatClock(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = dayjs(iso);
  return d.isValid() ? d.format('HH:mm') : null;
}

/** Giữ NGÀY của `baseIso`, thay GIỜ:PHÚT bằng `clock` (`HH:mm`) → ISO UTC gửi BE. `clock` sai dạng → giữ nguyên `baseIso`. */
export function withClock(baseIso: string, clock: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  const base = dayjs(baseIso);
  if (!match || !base.isValid()) return baseIso;
  return base.hour(Number(match[1])).minute(Number(match[2])).second(0).millisecond(0).toISOString();
}
