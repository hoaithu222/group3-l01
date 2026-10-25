import { formatNumber } from '@/shared/utils/format';

import type { SystemConfigItem } from '../../types/system-config.types';
import { readPath } from '../../utils/config-fields';
import { CONTRIBUTION_FALLBACK, CONTRIBUTION_WEIGHT_TOTAL } from '../constants/pm.constants';
import type {
  ContributionDefaultsFormValues,
  ContributionWeightsValue,
} from '../schemas/contribution-defaults.schema';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Số hợp lệ từ giá trị lạ của server; hỏng/thiếu → `fallback` (không làm vỡ form). */
const numberOr = (raw: unknown, fallback: number): number => (isNum(raw) ? raw : fallback);

function readWeights(raw: unknown, fallback: ContributionWeightsValue): ContributionWeightsValue {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  return {
    points: numberOr(o.points, fallback.points),
    onTime: numberOr(o.onTime, fallback.onTime),
    peer: numberOr(o.peer, fallback.peer),
  };
}

/**
 * Giá trị form từ giá trị HIỆU LỰC của server (`weights` / `onTimeGraceHours` / `unestimatedPoints`); thiếu/hỏng
 * → mặc định khai trong registry (`fields[].default`), cuối cùng mới tới `CONTRIBUTION_FALLBACK`.
 */
export function toContributionForm(item: SystemConfigItem): ContributionDefaultsFormValues {
  const registryDefault = (path: string): unknown =>
    item.fields.find((f) => f.path === path)?.default;
  const weightsFallback = readWeights(registryDefault('weights'), CONTRIBUTION_FALLBACK.weights);
  return {
    weights: readWeights(readPath(item.effective, 'weights'), weightsFallback),
    onTimeGraceHours: numberOr(
      readPath(item.effective, 'onTimeGraceHours'),
      numberOr(registryDefault('onTimeGraceHours'), CONTRIBUTION_FALLBACK.onTimeGraceHours),
    ),
    unestimatedPoints: numberOr(
      readPath(item.effective, 'unestimatedPoints'),
      numberOr(registryDefault('unestimatedPoints'), CONTRIBUTION_FALLBACK.unestimatedPoints),
    ),
  };
}

/** Giá trị form đang xem (`useWatch`, có thể thiếu/dở dang) — chỉ dùng để dựng dòng so sánh sau khi sửa. */
export interface WatchedContribution {
  weights?: Partial<ContributionWeightsValue>;
  onTimeGraceHours?: number | null;
  unestimatedPoints?: number | null;
}

/** Đắp phần đang nhập lên bản server: ô thiếu/không phải số giữ giá trị server thay vì hiện "NaN" trong hộp thoại. */
export function mergeContributionForm(
  base: ContributionDefaultsFormValues,
  watched: WatchedContribution | undefined,
): ContributionDefaultsFormValues {
  return {
    weights: {
      points: numberOr(watched?.weights?.points, base.weights.points),
      onTime: numberOr(watched?.weights?.onTime, base.weights.onTime),
      peer: numberOr(watched?.weights?.peer, base.weights.peer),
    },
    onTimeGraceHours: numberOr(watched?.onTimeGraceHours, base.onTimeGraceHours),
    unestimatedPoints: numberOr(watched?.unestimatedPoints, base.unestimatedPoints),
  };
}

/** Phần `value` gửi PUT: đủ ba field (khoá lạ đã lưu do `useJsonConfigField` giữ nguyên). */
export function contributionPatch(values: ContributionDefaultsFormValues): Record<string, unknown> {
  return {
    weights: {
      points: values.weights.points,
      onTime: values.weights.onTime,
      peer: values.weights.peer,
    },
    onTimeGraceHours: values.onTimeGraceHours,
    unestimatedPoints: values.unestimatedPoints,
  };
}

/** Tổng ba trọng số; ô trống/không phải số tính là 0 (dòng tổng cập nhật ngay cả khi đang gõ dở). */
export function weightsTotal(
  weights: Partial<Record<keyof ContributionWeightsValue, unknown>> | undefined,
): number {
  if (!weights) return 0;
  return [weights.points, weights.onTime, weights.peer].reduce<number>(
    (sum, v) => sum + (isNum(v) ? v : 0),
    0,
  );
}

/** Tổng có đúng 100 không — điều kiện duy nhất để lưu được. */
export const isWeightsTotalValid = (total: number): boolean => total === CONTRIBUTION_WEIGHT_TOTAL;

/** Số có tối đa một chữ số thập phân theo kiểu Việt ("0,5", "1"). */
const formatPoints = (v: number): string => formatNumber(v, Number.isInteger(v) ? 0 : 1);

/** "60 / 20 / 20 · cho phép trễ 0 giờ · thẻ chưa gán điểm tính 1" — một dòng để so trước/sau trong hộp thoại lý do. */
export function summarizeContribution(values: ContributionDefaultsFormValues): string {
  const { points, onTime, peer } = values.weights;
  return [
    `Trọng số ${points} / ${onTime} / ${peer} (điểm thẻ / đúng hạn / chấm chéo)`,
    `cho phép trễ ${formatNumber(values.onTimeGraceHours)} giờ`,
    `thẻ chưa gán điểm tính ${formatPoints(values.unestimatedPoints)}`,
  ].join(' · ');
}

/** Múi giờ hiệu lực của khoá `pm` (dùng cho ghi chú trong thẻ Đóng góp); thiếu → `null`. */
export function timezoneOf(pm: SystemConfigItem | undefined, path: string): string | null {
  const raw = pm ? readPath(pm.effective, path) : undefined;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}
