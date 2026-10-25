import { useState } from 'react';

import type {
  Portfolio,
  PortfolioAccent,
  PortfolioSection,
  PortfolioSectionKind,
  PortfolioTemplate,
} from '../api/portfolio.types';
import { useSavePortfolio } from '../queries/portfolio.mutations';
import { isVersionConflict, portfolioErrorMessage } from '../utils/portfolio-errors';
import {
  moveSection,
  sectionsEqual,
  sortedSections,
  toggleSection,
} from '../utils/portfolio-sections';

export interface UsePortfolioAppearanceArgs {
  portfolio: Portfolio;
  /** Tải lại hồ sơ mới nhất; trả `undefined` khi tải lỗi. */
  reload: () => Promise<Portfolio | null | undefined>;
  onSaved: () => void;
}

/**
 * Bản NHÁP giao diện (app.md p6-07 §3 "Giao diện"): mẫu + màu nhấn + bật/tắt/sắp xếp mục + cho phép công cụ tìm kiếm — sửa trong bộ nhớ, chỉ `PUT` khi bấm "Lưu".
 * Vì sao nháp + Lưu chứ không áp ngay từng chạm: (1) `PUT /me/portfolio` ghi ĐỦ hồ sơ với CAS `expectedVersion`, bốn lần chạm liên tiếp là bốn lần va `RES_003` vào chính mình;
 * (2) "Xem trước với mẫu này" xem được mẫu CHƯA lưu (BE nhận `template`/`accent` làm tham số thử) — áp ngay thì chẳng còn gì để "thử". Lỗi ⇒ nháp còn nguyên, không cần rollback.
 */
export function usePortfolioAppearance({ onSaved, portfolio, reload }: UsePortfolioAppearanceArgs) {
  const save = useSavePortfolio();
  const [theme, setTheme] = useState(portfolio.theme);
  const [sections, setSections] = useState<PortfolioSection[]>(() =>
    sortedSections(portfolio.sections),
  );
  const [seoIndexable, setSeoIndexable] = useState(portfolio.seoIndexable);
  const [baseVersion, setBaseVersion] = useState(portfolio.version);
  const [conflict, setConflict] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dirty =
    theme.template !== portfolio.theme.template ||
    theme.accent !== portfolio.theme.accent ||
    seoIndexable !== portfolio.seoIndexable ||
    !sectionsEqual(sections, portfolio.sections);

  const submit = async (): Promise<void> => {
    setSubmitError(null);
    try {
      const saved = await save.mutateAsync({
        avatarAssetId: portfolio.avatarAssetId,
        bio: portfolio.bio,
        displayName: portfolio.displayName,
        expectedVersion: baseVersion,
        headline: portfolio.headline,
        links: portfolio.links,
        sections,
        seoIndexable,
        theme,
      });
      setBaseVersion(saved.version);
      onSaved();
    } catch (error) {
      if (isVersionConflict(error)) setConflict(true);
      else setSubmitError(portfolioErrorMessage(error));
    }
  };

  /** Lấy bản mới nhất về làm nền nhưng GIỮ nháp đang chọn — chỉ `version` đổi, nên lần lưu kế tiếp thắng đúng ý người dùng. */
  const reloadLatest = async (): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  return {
    conflict,
    dirty,
    pending: save.isPending,
    reloadLatest,
    sections,
    seoIndexable,
    setAccent: (accent: PortfolioAccent) => setTheme((current) => ({ ...current, accent })),
    setSeoIndexable,
    setTemplate: (template: PortfolioTemplate) => setTheme((current) => ({ ...current, template })),
    submit,
    submitError,
    theme,
    moveSection: (kind: PortfolioSectionKind, direction: -1 | 1) =>
      setSections((current) => moveSection(current, kind, direction)),
    toggleSection: (kind: PortfolioSectionKind, visible: boolean) =>
      setSections((current) => toggleSection(current, kind, visible)),
  };
}
