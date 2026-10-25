import { useMemo, useState } from 'react';

import { useZodForm } from '@/shared/form/useZodForm';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { Portfolio } from '../api/portfolio.types';
import { DEFAULT_THEME } from '../constants/portfolio.constants';
import { useSavePortfolio } from '../queries/portfolio.mutations';
import { profileDefaults, profileSchema, toSaveInput } from '../schemas/portfolio.schemas';
import { isVersionConflict, portfolioErrorMessage } from '../utils/portfolio-errors';
import { DEFAULT_SECTIONS } from '../utils/portfolio-sections';
import { usePortfolioLimits } from './usePortfolioLimits';

export interface UsePortfolioProfileFormArgs {
  /** Hồ sơ hiện có; `null` = chưa tạo (lần lưu đầu tạo lười với `expectedVersion: 0`). */
  portfolio: Portfolio | null;
  /** Tải lại hồ sơ mới nhất; trả `undefined` khi tải lỗi. */
  reload: () => Promise<Portfolio | null | undefined>;
  onSaved: () => void;
}

/**
 * Vòng đời form "Thông tin" (app.md p6-07 §3): RHF + Zod trong bộ nhớ, lưu bằng `PUT` GHI ĐỦ với `expectedVersion`.
 *  · `baseVersion` chụp lúc mở màn và CHỈ nhích khi chính mình lưu/đổi slug hoặc bấm "Tải lại" — không đọc lại từ cache mỗi lần gửi, nếu không thì bản đã đổi ở thiết bị
 *    khác sẽ bị ghi đè LẶNG LẼ bằng nội dung cũ đang gõ;
 *  · `RES_003`: banner "Có thay đổi mới, tải lại" — nội dung đang gõ được GIỮ, "Tải lại" chỉ lấy `version` mới;
 *  · lỗi khác (mạng, `ASSET_003`…) hiện TRONG form, không toast (toast tự tắt sau 4 giây còn lỗi cần nhìn trong lúc sửa lại).
 * Mẫu/mục/SEO không nằm trong form này nhưng `PUT` bắt gửi đủ ⇒ lấy nguyên từ hồ sơ hiện có (mặc định của BE nếu chưa có).
 */
export function usePortfolioProfileForm({
  onSaved,
  portfolio,
  reload,
}: UsePortfolioProfileFormArgs) {
  const limits = usePortfolioLimits();
  const accountName = useAuthStore((state) => state.user?.name) ?? '';
  const schema = useMemo(() => profileSchema(limits), [limits]);
  const form = useZodForm(schema, {
    defaultValues: profileDefaults(portfolio, accountName.slice(0, limits.displayNameMax)),
  });
  const save = useSavePortfolio();
  const [baseVersion, setBaseVersion] = useState(portfolio?.version ?? 0);
  const [conflict, setConflict] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    const rest = {
      sections: portfolio?.sections ?? [...DEFAULT_SECTIONS],
      seoIndexable: portfolio?.seoIndexable ?? false,
      theme: portfolio?.theme ?? DEFAULT_THEME,
    };
    try {
      const saved = await save.mutateAsync(toSaveInput(values, rest, baseVersion));
      setBaseVersion(saved.version);
      onSaved();
    } catch (error) {
      if (isVersionConflict(error)) setConflict(true);
      else setSubmitError(portfolioErrorMessage(error));
    }
  });

  const reloadLatest = async (): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  return {
    baseVersion,
    conflict,
    form,
    limits,
    pending: save.isPending,
    reloadLatest,
    /** Đổi slug cũng tăng `version` — form nhích theo để lần lưu kế tiếp không tự va vào chính mình. */
    syncVersion: (version: number) => setBaseVersion(version),
    submit,
    submitError,
  };
}
