import { useState } from 'react';
import { useWatch } from 'react-hook-form';

import { useZodForm } from '@/shared/form/useZodForm';

import type { ContributionConfig } from '../api/contribution.types';
import { usePutContributionConfig } from '../queries/report.queries';
import {
  contributionConfigSchema,
  toConfigInput,
  WEIGHT_TOTAL,
  weightsTotal,
} from '../schemas/contribution-config.schema';
import { contributionErrorMessage, errorCodeOf, isVersionConflict } from '../utils/contribution-errors';

export interface UseContributionConfigFormArgs {
  boardId: string;
  /** Công thức hiện hành (`GET contribution-config`) — nguồn của giá trị ban đầu và của `expectedVersion`. */
  config: ContributionConfig;
  /** Tải lại công thức mới nhất; trả `undefined` khi tải lỗi. */
  reload: () => Promise<ContributionConfig | undefined>;
  onSaved: () => void;
}

/**
 * Vòng đời của tấm "Đổi trọng số" (app.md §3–§4): RHF + Zod (tổng = 100) trong bộ nhớ, lưu bằng `PUT` với `expectedVersion`.
 *  · Dòng tổng tính lại theo TỪNG ký tự gõ (`total`) — lỗi "tổng ≠ 100" hiện tại đó, không cần bấm Lưu;
 *  · `RES_003` (người khác vừa đổi): banner + "Tải lại" nhận `version` mới nhưng GIỮ giá trị đang gõ — không lặng lẽ ghi đè, cũng không
 *    bắt gõ lại;
 *  · `CONTRIB_002` từ server (tổng ≠ 100 lọt qua client) hiện ở dòng tổng như lỗi client; lỗi khác hiện trong tấm, không toast.
 */
export function useContributionConfigForm({ boardId, config, reload, onSaved }: UseContributionConfigFormArgs) {
  const put = usePutContributionConfig(boardId);
  const form = useZodForm(contributionConfigSchema, { defaultValues: toConfigInput(config) });
  const watched = useWatch({ control: form.control });
  const [baseVersion, setBaseVersion] = useState(config.version);
  const [conflict, setConflict] = useState(false);
  const [serverError, setServerError] = useState<{ code: string | undefined; message: string } | null>(null);

  const total = weightsTotal(watched);

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await put.mutateAsync({
        expectedVersion: baseVersion,
        onTimeGraceHours: values.graceHours,
        unestimatedPoints: values.unestimated,
        weights: { onTime: values.onTime, peer: values.peer, points: values.points },
      });
      onSaved();
    } catch (error) {
      if (isVersionConflict(error)) setConflict(true);
      else setServerError({ code: errorCodeOf(error), message: contributionErrorMessage(error) });
    }
  });

  const reloadLatest = async (): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  return {
    conflict,
    form,
    pending: put.isPending,
    reloadLatest,
    /** Lỗi hiện ở dòng tổng: tổng ≠ 100 (client, theo từng ký tự) hoặc `CONTRIB_002` server trả. */
    totalError:
      total !== WEIGHT_TOTAL
        ? `Tổng trọng số phải bằng ${WEIGHT_TOTAL} (hiện là ${total}).`
        : serverError?.code === 'CONTRIB_002'
          ? serverError.message
          : null,
    total,
    /** Lỗi khác của lần lưu (mạng, 403…) — hiện trong tấm. */
    submitError: serverError && serverError.code !== 'CONTRIB_002' ? serverError.message : null,
    submit,
  };
}
