import { A4 } from "../pdf/pdf-document";
import { COLORS, Flow, PAGE } from "../pdf/pdf-flow";

export interface PdfHeatmap {
  /** Thứ Hai đầu tiên (`YYYY-MM-DD`) và số tuần; `days[i]` là tổng hoạt động của ngày thứ `i` kể từ đó (7 ngày/tuần). */
  firstMonday: string;
  weeks: number;
  days: number[];
  /** Ngày có nhiều hoạt động nhất, nhãn "dd/MM" đã định dạng — cho dòng tóm tắt. */
  summary: string;
}

/** Mức màu 0–4: 0 khi không có hoạt động; còn lại chia theo tỉ lệ so với ngày nhiều nhất. */
export const heatLevel = (value: number, max: number): number => (value <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((4 * value) / max)));

export function drawHeatmap(flow: Flow, heatmap: PdfHeatmap): void {
  const cell = 9;
  const step = 11;
  flow.need(24 + 7 * step + 40);
  flow.line(`Hoạt động theo ngày — ${heatmap.weeks} tuần gần nhất (cả bảng)`, PAGE.marginX, { size: 12, bold: true });
  flow.gap(4);
  const max = Math.max(0, ...heatmap.days);
  const top = flow.top;
  for (let week = 0; week < heatmap.weeks; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const level = heatLevel(heatmap.days[week * 7 + day] ?? 0, max);
      flow.page.rect(PAGE.marginX + week * step, A4.height - (top + day * step + cell), cell, cell, { fill: COLORS.heat[level] });
    }
  }
  flow.top = top + 7 * step + 4;
  flow.line("Ít", PAGE.marginX, { size: 8, color: COLORS.muted });
  const legendTop = flow.top - 8 * 1.4;
  COLORS.heat.forEach((color, i) => flow.page.rect(PAGE.marginX + 16 + i * 12, A4.height - (legendTop + 9), 9, 9, { fill: color }));
  flow.page.text("Nhiều", PAGE.marginX + 16 + 5 * 12 + 4, flow.baseline(8, legendTop), { size: 8, color: COLORS.muted });
  flow.paragraph(heatmap.summary, { size: 9, color: COLORS.muted });
  flow.gap(8);
}
