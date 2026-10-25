import { useModerationIntentStore } from '@/shared/stores/moderation-intent.store';

import { BlockConfirmSheet } from './BlockConfirmSheet';
import { ReportSheet } from './ReportSheet';

/**
 * Nơi DỰNG hai tấm mà feature khác chỉ "yêu cầu" (qua `useModerationActions` → `moderation-intent.store`).
 *
 * Mount MỘT LẦN ở `app/(app)/_layout.tsx` — nơi lắp ráp được phép import mọi feature, cùng chỗ
 * `useConversationSocket`/`registerSystemMessageRenderer`. ⛔ Đừng mount thêm ở màn nào: hai host
 * cùng đọc một store là hai tấm chồng nhau.
 */
export function ModerationHost() {
  const report = useModerationIntentStore((state) => state.report);
  const block = useModerationIntentStore((state) => state.block);
  const closeReport = useModerationIntentStore((state) => state.closeReport);
  const closeBlock = useModerationIntentStore((state) => state.closeBlock);

  return (
    <>
      <ReportSheet request={report} onClose={closeReport} />
      <BlockConfirmSheet request={block} onClose={closeBlock} />
    </>
  );
}
