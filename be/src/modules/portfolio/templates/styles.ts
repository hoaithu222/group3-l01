import type { PortfolioAccent, PortfolioTemplate } from "../entities/portfolio.interface";
import { ACCENT_TOKENS, DARK, LIGHT, TEMPLATE_META, type Palette } from "./theme-tokens";

/**
 * CSS của trang công khai (inline `<style>` — CSP chỉ cho `style-src 'unsafe-inline'`, không font/ảnh ngoài, chỉ font hệ thống). Toàn bộ giá trị màu từ `theme-tokens.ts`
 * (hằng tĩnh đã kiểm tương phản), KHÔNG chứa dữ liệu người dùng — an toàn để chèn thô. Mobile-first, `overflow-wrap:anywhere` để không cuộn ngang ở 360 px.
 */
function base(p: Palette, accent: string): string {
  return `:root{--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${p.muted};--border:${p.border};--accent:${accent}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;overflow-wrap:anywhere}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 40px}
h1,h2,h3{line-height:1.25;margin:0 0 .5em}
h1{font-size:1.9rem}h2{font-size:1.3rem;padding-bottom:.35em;border-bottom:2px solid var(--accent)}h3{font-size:1.1rem}
p{margin:0 0 .8em}
a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
img{max-width:100%;height:auto}
.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--accent)}
.hero{padding:24px 0 8px}
.headline{font-size:1.1rem;margin:0}
.headline,.meta,.note,.stamp,.since{color:var(--muted)}
.sec{margin-top:32px}
.projects{display:grid;gap:16px}
.project{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.project-body{padding:16px}
.cover{display:block;width:100%;aspect-ratio:1200/630;object-fit:cover}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:12px 0}
.stat{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px}
.stat dt{font-size:.8rem;color:var(--muted)}
.stat dd{margin:2px 0 0;font-size:1.15rem;font-weight:700;color:var(--accent)}
.highlights{margin:0 0 .8em;padding-left:1.2em}
.badges,.links{list-style:none;margin:0 0 .8em;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.badge{display:inline-block;border:1px solid var(--accent);color:var(--accent);border-radius:999px;padding:2px 12px;font-weight:600}
.note,.stamp{font-size:.85rem}
.foot{max-width:760px;margin:0 auto;padding:0 16px 32px;color:var(--muted);font-size:.8rem}
.preview-banner{background:var(--surface);color:var(--text);border-bottom:2px dashed var(--accent);text-align:center;padding:6px 12px;font-size:.85rem}
@media print{.preview-banner{display:none}.project{break-inside:avoid}}`;
}

const VARIANT: Record<PortfolioTemplate, string> = {
  CLASSIC: `.hero{text-align:center}.avatar{display:block;margin:0 auto 12px}h2{text-align:center}.badges,.links{justify-content:center}`,
  DEVELOPER: `body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:15px}
.hero{display:flex;flex-wrap:wrap;gap:16px;align-items:center}h2{border-bottom:0;border-left:4px solid var(--accent);padding:0 0 0 12px}
.stat{border-left:3px solid var(--accent)}.badge{border-radius:6px}`,
  DESIGNER: `.wrap{max-width:960px}h1{font-size:2.4rem}.hero{padding:40px 0 16px}.avatar{width:120px;height:120px}
.project{border-radius:16px}.project-body{padding:20px}@media(min-width:720px){.projects{grid-template-columns:repeat(2,minmax(0,1fr))}}`,
  MINIMAL: `.wrap{max-width:640px}h2{border-bottom:1px solid var(--border);font-size:1.15rem}.avatar{width:72px;height:72px;border-width:2px}
.project{background:transparent;border:0;border-top:1px solid var(--border);border-radius:0}.project-body{padding:16px 0}
.stat{background:transparent;border:0;padding:0}.badge{border:0;padding:0;font-weight:600}`,
};

/** CSS hoàn chỉnh của một (mẫu, màu nhấn). Mẫu DEVELOPER dùng bảng màu tối + biến thể màu nhấn cho nền tối. */
export function templateCss(template: PortfolioTemplate, accent: PortfolioAccent): string {
  const dark = TEMPLATE_META[template].dark;
  const tokens = ACCENT_TOKENS[accent];
  return `${base(dark ? DARK : LIGHT, dark ? tokens.onDark : tokens.onLight)}\n${VARIANT[template]}`;
}
