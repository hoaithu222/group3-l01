import { Divider } from '@/shared/ui/divider';

/** "Tin chưa đọc" — cố định tại vị trí lúc MỞ màn, không di chuyển khi đọc tiếp (app.md §3). */
export function UnreadDivider() {
  return <Divider className="px-md py-xs" label="Tin chưa đọc" tone="strong" />;
}
