import { useLocalSearchParams } from 'expo-router';

import { ScopeReportsScreen } from '@/features/moderation';

/** Hàng đợi báo cáo THEO PHẠM VI kiểm duyệt của tôi trong nhóm (p1-08 #9) — BE trả 403 nếu tôi không kiểm duyệt phạm vi nào. */
export default function WorkspaceReportsRoute() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  return <ScopeReportsScreen scope={{ type: 'WORKSPACE', id: wsId }} />;
}
