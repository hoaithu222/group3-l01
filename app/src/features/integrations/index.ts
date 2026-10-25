/**
 * Tích hợp GitHub/GitLab/Figma (cấp nhóm) + Google Calendar (cá nhân) — p5-03. Route trỏ thẳng `screens/*`; barrel chỉ để nơi khác biết feature
 * có gì. Thẻ tin hệ thống `INTEGRATION` nằm ở `features/chat` (payload là hợp đồng chung p1-04), KHÔNG ở đây.
 */
export { IntegrationCallbackScreen } from './screens/IntegrationCallbackScreen';
export { IntegrationDetailScreen } from './screens/IntegrationDetailScreen';
export { IntegrationMarketplaceScreen } from './screens/IntegrationMarketplaceScreen';
export { PersonalIntegrationsScreen } from './screens/PersonalIntegrationsScreen';
