/**
 * Partial Eta của trang công khai. QUY TẮC AN TOÀN: mọi giá trị động in bằng `<%= %>` (Eta `autoEscape` thoát `& < > " '`); `<%~ %>` (thô) CHỈ dùng cho `it.css`
 * (hằng tĩnh từ `styles.ts`) và cho `include(...)`. Không có `<script>`, không thuộc tính `on*`, không `style=` động. Template nhúng trong TS (thay vì tệp `.eta`)
 * vì `tsc` không sao chép tệp phi-TS vào `dist/`.
 */
export const PARTIALS: Readonly<Record<string, string>> = {
  /** Đoạn văn: `paras` = mảng đoạn, mỗi đoạn là mảng dòng (xuống dòng → `<br>`, không nhận HTML). */
  "@paras": `<% for (const lines of it.paras) { %><p><% lines.forEach((l, i) => { %><%= l %><% if (i < lines.length - 1) { %><br><% } %><% }) %></p><% } %>`,

  "@about": `<section class="sec sec-about" aria-labelledby="h-about"><h2 id="h-about">Giới thiệu</h2><%~ include("@paras", { paras: it.aboutParagraphs }) %></section>`,

  "@project": `<article class="project" aria-labelledby="proj-<%= it.i %>">
<% if (it.p.coverUrl) { %><img class="cover" src="<%= it.p.coverUrl %>" alt="<%= it.p.coverAlt %>" width="1200" height="630" loading="lazy"><% } %>
<div class="project-body"><h3 id="proj-<%= it.i %>"><%= it.p.title %></h3>
<% if (it.p.role || it.p.period) { %><p class="meta"><% if (it.p.role) { %><%= it.p.role %><% } %><% if (it.p.role && it.p.period) { %> · <% } %><% if (it.p.period) { %><%= it.p.period %><% } %></p><% } %>
<%~ include("@paras", { paras: it.p.summaryParagraphs }) %>
<% if (it.p.highlights.length > 0) { %><ul class="highlights"><% for (const h of it.p.highlights) { %><li><%= h %></li><% } %></ul><% } %>
<% if (it.p.stats.length > 0) { %><dl class="stats"><% for (const s of it.p.stats) { %><div class="stat"><dt><%= s.label %></dt><dd><%= s.value %></dd></div><% } %></dl><% } %>
<% if (it.p.contributionNote) { %><p class="note"><%= it.p.contributionNote %></p><% } %>
<% if (it.p.teammatesHeading) { %><p class="team"><%= it.p.teammatesHeading %><% if (it.p.teammateNames.length > 0) { %>: <%= it.p.teammateNames.join(", ") %><% } %></p><% } %>
<p class="stamp">Số liệu cập nhật lúc <%= it.p.snapshotAtText %></p></div></article>`,

  "@projects": `<section class="sec sec-projects" aria-labelledby="h-projects"><h2 id="h-projects">Dự án</h2><div class="projects"><% it.projects.forEach((p, i) => { %><%~ include("@project", { p, i }) %><% }) %></div>
<p class="note">Số liệu do hệ thống ghi nhận từ công việc thực tế trong nhóm, không do chủ hồ sơ tự khai.</p></section>`,

  "@skills": `<section class="sec sec-skills" aria-labelledby="h-skills"><h2 id="h-skills">Kỹ năng đã được xác thực</h2>
<ul class="badges"><% for (const b of it.badges) { %><li><span class="badge"><%= b.name %></span> <span class="since"><%= b.unlockedText %></span></li><% } %></ul>
<p class="note">Huy hiệu do hệ thống cấp dựa trên công việc đã hoàn thành, không thể tự đăng ký.</p></section>`,

  "@contact": `<section class="sec sec-contact" aria-labelledby="h-contact"><h2 id="h-contact">Liên hệ</h2>
<ul class="links"><% for (const l of it.links) { %><li><a href="<%= l.url %>" rel="noopener nofollow ugc" target="_blank"><%= l.label %></a></li><% } %></ul></section>`,
};
