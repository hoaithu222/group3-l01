/**
 * Query key của portfolio (app.md p6-07 §4). ⚠️ `overview` là TIỀN TỐ của các khoá còn lại (`['career','portfolio']` ⊂ `[…,'slug',…]`): làm mới
 * hồ sơ thì luôn `invalidateQueries({ queryKey: overview(), exact: true })` — không `exact` là kéo theo tải lại cả danh mục mẫu và mọi lượt kiểm slug.
 */
export const portfolioKeys = {
  eligible: () => ['career', 'portfolio', 'eligible'] as const,
  latestBuild: () => ['career', 'portfolio', 'latest-build'] as const,
  overview: () => ['career', 'portfolio'] as const,
  slug: (slug: string) => ['career', 'portfolio', 'slug', slug] as const,
  templates: () => ['career', 'portfolio', 'templates'] as const,
};
