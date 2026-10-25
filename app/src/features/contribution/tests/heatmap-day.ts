import type { HeatmapDay } from '../api/contribution.types';

/** Một ngày của biểu đồ hoạt động: `total` = số thẻ (`task`), các loại khác 0 trừ khi `over` ghi đè. Dùng chung `heatmap-grid` + `heatmap-text`. */
export const day = (date: string, total: number, over: Partial<HeatmapDay> = {}): HeatmapDay => ({
  checklist: 0,
  comment: 0,
  date,
  review: 0,
  task: total,
  total,
  ...over,
});
