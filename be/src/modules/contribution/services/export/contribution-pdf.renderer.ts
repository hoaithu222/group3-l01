import type { ContributionWeights } from "../../../../core/constants/contribution";
import { A4, PdfDocument } from "../pdf/pdf-document";
import { COLORS, Flow, PAGE } from "../pdf/pdf-flow";
import { loadReportFonts } from "../pdf/pdf-fonts";
import { formatVi } from "../contribution-explain";
import { formatVerifyCode, shortHash } from "./verify-code";
import { drawHeatmap, type PdfHeatmap } from "./contribution-pdf-heatmap";

export type { PdfHeatmap };

export interface PdfMember {
  name: string;
  /** "Đã rời nhóm" / "Tài khoản đã xoá" — hiện cạnh tên. */
  membershipLabel: string | null;
  storyPointsDone: number;
  tasksDone: number;
  tasksWithDue: number;
  tasksOnTime: number;
  tasksLate: number;
  reviewCount: number;
  peerScoreAvg: number | null;
  score: number;
  share: number;
  explanation: string;
}

export interface PdfReportInput {
  workspaceName: string;
  boardName: string;
  periodLabel: string;
  timezone: string;
  generatedAtLabel: string;
  weights: ContributionWeights;
  onTimeGraceHours: number;
  definitions: { points: string; onTime: string; peer: string };
  /** "Trọng số đổi lúc 10:32 15/09 bởi Minh (trước: 60/20/20)" hoặc `null` khi chưa đổi. */
  configChangeNote: string | null;
  members: PdfMember[];
  totals: { storyPointsDone: number; tasksDone: number };
  maxStoryPoints: number;
  heatmap: PdfHeatmap | null;
  verifyCode: string;
  dataHash: string;
}

const COLUMNS = [
  { key: "name", label: "Thành viên", width: 150, align: "left" as const },
  { key: "sp", label: "Điểm thẻ", width: 54, align: "right" as const },
  { key: "tasks", label: "Thẻ xong", width: 52, align: "right" as const },
  { key: "onTime", label: "Đúng hạn", width: 60, align: "right" as const },
  { key: "late", label: "Trễ", width: 36, align: "right" as const },
  { key: "peer", label: "Điểm chấm", width: 68, align: "right" as const },
  { key: "score", label: "Điểm", width: 42, align: "right" as const },
  { key: "share", label: "% nhóm", width: 53, align: "right" as const },
];

function drawHeader(flow: Flow, input: PdfReportInput): void {
  flow.line("Báo cáo đóng góp", PAGE.marginX, { size: 20, bold: true });
  flow.line(`${input.workspaceName} · ${input.boardName}`, PAGE.marginX, { size: 12, bold: true, color: COLORS.muted });
  flow.line(`Kỳ báo cáo: ${input.periodLabel}`, PAGE.marginX, { size: 10 });
  flow.line(`Tạo lúc ${input.generatedAtLabel} (múi giờ ${input.timezone})`, PAGE.marginX, { size: 9, color: COLORS.muted });
  flow.gap(10);
}

function drawFormula(flow: Flow, input: PdfReportInput): void {
  const w = input.weights;
  flow.line("Công thức tính điểm", PAGE.marginX, { size: 12, bold: true });
  flow.paragraph(`Trọng số: điểm thẻ ${w.points} · đúng hạn ${w.onTime} · điểm chấm chéo ${w.peer} (tổng 100).`, { size: 9.5 });
  flow.paragraph("Điểm = 100 × Σ (trọng số × thành phần) ÷ Σ trọng số của các thành phần CÓ dữ liệu; % nhóm = điểm của người đó ÷ tổng điểm cả nhóm.", { size: 9, color: COLORS.muted });
  for (const text of [input.definitions.points, input.definitions.onTime, input.definitions.peer]) flow.paragraph(`• ${text}`, { size: 9, indent: 8 });
  if (input.configChangeNote) flow.paragraph(input.configChangeNote, { size: 9, bold: true });
  flow.gap(8);
}

function cells(m: PdfMember): Record<string, string> {
  return {
    name: m.name,
    sp: formatVi(m.storyPointsDone),
    tasks: String(m.tasksDone),
    onTime: m.tasksWithDue > 0 ? `${m.tasksOnTime}/${m.tasksWithDue}` : "—",
    late: m.tasksWithDue > 0 ? String(m.tasksLate) : "—",
    peer: m.peerScoreAvg === null ? "—" : `${formatVi(m.peerScoreAvg, 1)} (${m.reviewCount})`,
    score: formatVi(m.score, 1),
    share: `${formatVi(m.share, 1)} %`,
  };
}

function drawTable(flow: Flow, input: PdfReportInput): void {
  flow.line("Bảng đóng góp của thành viên", PAGE.marginX, { size: 12, bold: true });
  const drawHead = (): void => {
    flow.need(24);
    const top = flow.top;
    flow.page.rect(PAGE.marginX, A4.height - top - 18, PAGE.width, 18, { fill: COLORS.band });
    let x = PAGE.marginX + 4;
    for (const col of COLUMNS) {
      const at = col.align === "right" ? x + col.width - 8 : x;
      flow.page.text(col.label, at, flow.baseline(8.5, top + 5), { font: "F2", size: 8.5, color: COLORS.ink, align: col.align });
      x += col.width;
    }
    flow.top = top + 22;
  };
  drawHead();
  if (input.members.length === 0) flow.paragraph("Chưa có thành viên nào trong kỳ này.", { size: 9.5, color: COLORS.muted });
  for (const m of input.members) {
    const explanation = flow.wrap(m.explanation, PAGE.width - 12, 8);
    flow.need(16 + explanation.length * 11 + 6);
    const top = flow.top;
    const values = cells(m);
    let x = PAGE.marginX + 4;
    for (const col of COLUMNS) {
      const text = col.key === "name" ? (m.membershipLabel ? `${m.name} (${m.membershipLabel})` : m.name) : values[col.key];
      const fit = col.key === "name" && flow.page.measure(text, 9.5, "F2") > col.width - 6 ? `${text.slice(0, 22)}…` : text;
      const at = col.align === "right" ? x + col.width - 8 : x;
      flow.page.text(fit, at, flow.baseline(9.5, top), { font: col.key === "name" || col.key === "score" ? "F2" : "F1", size: 9.5, align: col.align });
      x += col.width;
    }
    flow.top = top + 14;
    for (const line of explanation) flow.line(line, PAGE.marginX + 10, { size: 8, color: COLORS.muted, leading: 1.35 });
    flow.page.line(PAGE.marginX, A4.height - flow.top - 2, PAGE.marginX + PAGE.width, A4.height - flow.top - 2, { stroke: COLORS.line, lineWidth: 0.4 });
    flow.gap(5);
  }
  flow.gap(2);
  flow.paragraph(`Điểm thẻ được so với người có nhiều điểm thẻ nhất nhóm (${formatVi(input.maxStoryPoints)} điểm). Cả nhóm: ${formatVi(input.totals.storyPointsDone)} điểm, ${input.totals.tasksDone} thẻ hoàn thành.`, {
    size: 8.5,
    color: COLORS.muted,
  });
  flow.gap(8);
}

function drawVerification(flow: Flow, input: PdfReportInput): void {
  flow.need(80);
  flow.line("Thông tin xác thực", PAGE.marginX, { size: 12, bold: true });
  flow.paragraph(`Mã xác thực: ${formatVerifyCode(input.verifyCode)}`, { size: 9.5, bold: true });
  flow.paragraph("SHA-256 của dữ liệu chuẩn hoá:", { size: 9, color: COLORS.muted });
  flow.line(input.dataHash.slice(0, 32), PAGE.marginX + 8, { size: 9 });
  flow.line(input.dataHash.slice(32), PAGE.marginX + 8, { size: 9 });
  flow.paragraph("Báo cáo được tạo tự động từ dữ liệu hệ thống; không ai (kể cả chủ nhóm) sửa được điểm. Đối chiếu mã xác thực và mã băm với bản ghi xuất trên hệ thống.", {
    size: 8.5,
    color: COLORS.muted,
  });
}

/** Dựng PDF báo cáo đóng góp (A4 dọc). Chữ Unicode nhúng font Plus Jakarta Sans — đủ dấu tiếng Việt. */
export function renderContributionPdf(input: PdfReportInput, generatedAt: Date = new Date()): Buffer {
  const fonts = loadReportFonts();
  const doc = new PdfDocument(
    {
      title: `Báo cáo đóng góp — ${input.boardName}`,
      author: "Super App",
      subject: `${input.workspaceName} · ${input.periodLabel}`,
      keywords: `mã xác thực ${input.verifyCode}`,
      creationDate: generatedAt,
    },
    { F1: fonts.regular, F2: fonts.semiBold }
  );
  const flow = new Flow(doc);
  drawHeader(flow, input);
  drawFormula(flow, input);
  drawTable(flow, input);
  if (input.heatmap) drawHeatmap(flow, input.heatmap);
  drawVerification(flow, input);

  const footer = `Mã xác thực ${formatVerifyCode(input.verifyCode)} · SHA-256 ${shortHash(input.dataHash)}`;
  flow.forEachPage((page, index, total) => {
    page.line(PAGE.marginX, 40, PAGE.marginX + PAGE.width, 40, { stroke: COLORS.line, lineWidth: 0.5 });
    page.text(footer, PAGE.marginX, 26, { font: "F1", size: 8, color: COLORS.muted });
    page.text(`Trang ${index + 1}/${total}`, PAGE.marginX + PAGE.width, 26, { font: "F1", size: 8, color: COLORS.muted, align: "right" });
  });
  return doc.finish();
}
