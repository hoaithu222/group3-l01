import type { ModuleConfig } from './types';
import { placeholderPage } from './module-defaults';

/**
 * Job AI — ⏸ D-13 (AI đang tạm dừng toàn hệ thống). `enabled: false` để KHÔNG
 * dựng route/hiện menu, nhưng GIỮ entry trong registry cho lúc bật lại.
 */
export const aiJobModule: ModuleConfig = {
  id: 'ai-job',
  path: '/ai-job',
  title: 'AI',
  iconName: 'bolt-outline',
  color: 'purple',
  order: 70,
  enabled: false,
  featureFlag: 'ai',
  tabTitles: {
    jobs: 'Job',
    usage: 'Sử dụng',
    budgets: 'Hạn mức',
    prompts: 'Prompt',
    evals: 'Đánh giá',
  },
  defaultTab: 'jobs',
  page: { lazy: placeholderPage },
};
