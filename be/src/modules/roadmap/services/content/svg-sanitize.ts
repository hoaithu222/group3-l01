import { LIMITS } from "../../../../core/constants/limits";

export interface SvgSanitizeResult {
  svg: string | null;
  width: number | null;
  height: number | null;
  warning: string | null;
}

const DANGEROUS_TAG = /<\s*(script|iframe|object|embed|foreignObject|link|meta)\b/gi;
const EVENT_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_HREF = /((?:xlink:)?href\s*=\s*)("|')\s*javascript:[^"']*\2/gi;
const XML_DECL = /<\?xml[^>]*\?>/gi;
const DOCTYPE = /<!DOCTYPE[^>]*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const VIEWBOX = /viewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i;
const WIDTH_ATTR = /\bwidth\s*=\s*["']([\d.]+)/i;
const HEIGHT_ATTR = /\bheight\s*=\s*["']([\d.]+)/i;

/**
 * Vệ sinh SVG trước khi lưu inline (`RoadmapMedia.svg`) — mockup nhập từ giáo trình đã là vector thuần (không
 * `<image>`/`<foreignObject>` theo khảo sát nguồn), nhưng vẫn phòng thủ: bỏ thẻ nguy hiểm, thuộc tính `on*`,
 * `href="javascript:"`, comment, khai báo XML/DOCTYPE. Không dùng DOM parser (Node không có, tránh phụ thuộc mới) —
 * xử lý bằng regex trên các mẫu KHÔNG hợp lệ, giữ nguyên phần còn lại nguyên văn.
 */
export function sanitizeSvg(raw: string): SvgSanitizeResult {
  if (!/<svg[\s>]/i.test(raw)) return { svg: null, width: null, height: null, warning: "Không phải SVG hợp lệ (thiếu thẻ <svg>)" };

  let svg = raw.replace(XML_DECL, "").replace(DOCTYPE, "").replace(COMMENT, "");
  const hadDangerous = DANGEROUS_TAG.test(svg);
  DANGEROUS_TAG.lastIndex = 0;
  svg = svg.replace(DANGEROUS_TAG, "<!--removed-->").replace(EVENT_ATTR, "").replace(JS_HREF, "$1$2#$2");
  svg = svg.trim();

  if (Buffer.byteLength(svg, "utf8") > LIMITS.roadmap.svgMaxBytes) {
    return { svg: null, width: null, height: null, warning: `SVG vượt ${LIMITS.roadmap.svgMaxBytes} byte sau khi vệ sinh` };
  }

  const vb = VIEWBOX.exec(svg);
  const width = vb ? Math.round(Number(vb[1])) : WIDTH_ATTR.exec(svg) ? Math.round(Number(WIDTH_ATTR.exec(svg)![1])) : null;
  const height = vb ? Math.round(Number(vb[2])) : HEIGHT_ATTR.exec(svg) ? Math.round(Number(HEIGHT_ATTR.exec(svg)![1])) : null;

  return { svg, width: width && width > 0 ? width : null, height: height && height > 0 ? height : null, warning: hadDangerous ? "Đã bỏ thẻ/thuộc tính không an toàn trong SVG" : null };
}
