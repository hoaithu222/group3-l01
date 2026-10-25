import { useCallback, useMemo } from 'react';

import { useDebounce, useQueryParams } from '@/shared/hooks';

import { TALENT_FILTER_KEYS, TALENT_LIMITS, TALENT_SEARCH_DEBOUNCE_MS } from '../constants/portal.constants';
import type { TalentSearchParams } from '../types/talent.types';

/** Mã kỹ năng hợp lệ (`talentSearchQuerySchema`): chữ thường/số/gạch ngang 2–40. Mã lạ trên URL bị bỏ — BE trả 400 với mã sai dạng. */
const SKILL_CODE = /^[a-z0-9-]{2,40}$/;

const toNumber = (raw: string, min: number, max: number, integer: boolean): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return integer && !Number.isInteger(n) ? undefined : n;
};

/**
 * Bộ lọc ứng viên — TOÀN BỘ sống trên URL (`useQueryParams`, admin.md p6-08 §2.4): copy link / F5 / back giữ nguyên. Giá trị URL sai dạng bị bỏ thay vì gửi cho BE nhận 400.
 * `values` là giá trị TỨC THÌ cho các ô nhập; `params` là bản DEBOUNCE 400 ms dùng để gọi API — gõ liên tục chỉ bắn một lượt tìm (và một lượt trong hạn mức xem/ngày).
 * `q` chỉ gửi khi ≥ 2 ký tự (BE `q.min(2)`); `minContribution = 0` coi như không lọc.
 */
export function useTalentFilters() {
  // Không có phân trang ở đây ("Tải thêm" theo cursor) nên KHÔNG để `setParam` tự ghi `?page=1` vào URL.
  const { getParam, setParam, updateParams } = useQueryParams({ resetPageOnChange: false });

  const skillsRaw = getParam('skills');
  const minContributionRaw = getParam('minContribution');
  const minBadgesRaw = getParam('minBadges');
  const role = getParam('role').slice(0, TALENT_LIMITS.roleMax);
  const location = getParam('location').slice(0, TALENT_LIMITS.locationMax);
  const q = getParam('q').slice(0, TALENT_LIMITS.keywordMax);

  const skills = useMemo(
    () =>
      skillsRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => SKILL_CODE.test(s))
        .slice(0, TALENT_LIMITS.filterSkillsMax),
    [skillsRaw],
  );
  const minContribution = toNumber(minContributionRaw, 0, 100, false);
  const minBadges = toNumber(minBadgesRaw, 0, TALENT_LIMITS.minBadgesMax, true);

  const immediate = useMemo<TalentSearchParams>(
    () => ({
      ...(skills.length > 0 && { skills }),
      ...(minContribution !== undefined && minContribution > 0 && { minContribution }),
      ...(minBadges !== undefined && minBadges > 0 && { minBadges }),
      ...(role.trim() && { role: role.trim() }),
      ...(location.trim() && { location: location.trim() }),
      ...(q.trim().length >= TALENT_LIMITS.keywordMin && { q: q.trim() }),
    }),
    [skills, minContribution, minBadges, role, location, q],
  );
  const params = useDebounce(immediate, TALENT_SEARCH_DEBOUNCE_MS);

  // Ô nhập số/chữ ghi thẳng vào URL: `null`/rỗng xoá khoá (URL sạch).
  const setSkills = useCallback((codes: string[]) => setParam('skills', codes.join(',') || null), [setParam]);
  const setMinContribution = useCallback(
    (n: number | null) => setParam('minContribution', n === null || n <= 0 ? null : n),
    [setParam],
  );
  const setMinBadges = useCallback(
    (n: number | null) => setParam('minBadges', n === null || n <= 0 ? null : n),
    [setParam],
  );
  const setRole = useCallback((v: string) => setParam('role', v || null), [setParam]);
  const setLocation = useCallback((v: string) => setParam('location', v || null), [setParam]);
  const setKeyword = useCallback((v: string) => setParam('q', v || null), [setParam]);
  const clear = useCallback(
    () => updateParams(Object.fromEntries(TALENT_FILTER_KEYS.map((k) => [k, null]))),
    [updateParams],
  );

  return {
    values: { skills, minContribution: minContribution ?? 0, minBadges: minBadges ?? 0, role, location, q },
    params,
    hasFilter: Object.keys(immediate).length > 0,
    setSkills,
    setMinContribution,
    setMinBadges,
    setRole,
    setLocation,
    setKeyword,
    clear,
  };
}
