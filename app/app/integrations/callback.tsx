import { IntegrationCallbackScreen } from '@/features/integrations/screens/IntegrationCallbackScreen';

/** `superapp://integrations/callback?…` — NGOÀI `(app)` để xử lý được ngay khi app vừa mở lại từ trình duyệt OAuth (p5-03 app.md §1). */
export default function IntegrationCallbackRoute() {
  return <IntegrationCallbackScreen />;
}
