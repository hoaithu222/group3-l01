/**
 * Khung tài liệu HTML dùng chung cho cả 4 mẫu (khác nhau ở CSS `styles.ts` + `it.bodyClass`) — một bộ markup ngữ nghĩa duy nhất bảo đảm cùng chuẩn a11y:
 * `lang="vi"`, landmark `header/main/footer`, thứ tự tiêu đề h1 → h2 → h3, ảnh có `alt`, không `<script>`. `sections` đã lọc (chỉ mục đang bật và có nội dung).
 */
export const LAYOUT = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><%= it.title %></title>
<meta name="description" content="<%= it.description %>">
<meta name="color-scheme" content="<%= it.colorScheme %>">
<% if (it.noindex) { %><meta name="robots" content="noindex, nofollow">
<% } %><% if (it.canonicalUrl) { %><link rel="canonical" href="<%= it.canonicalUrl %>">
<meta property="og:type" content="profile">
<meta property="og:title" content="<%= it.title %>">
<meta property="og:description" content="<%= it.description %>">
<meta property="og:url" content="<%= it.canonicalUrl %>">
<% } %><style><%~ it.css %></style>
</head>
<body class="<%= it.bodyClass %>">
<% if (it.previewBanner) { %><div class="preview-banner" role="note">Bản xem trước — trang chưa được công khai</div>
<% } %><div class="wrap">
<header class="hero">
<% if (it.avatarUrl) { %><img class="avatar" src="<%= it.avatarUrl %>" alt="Ảnh đại diện của <%= it.displayName %>" width="96" height="96">
<% } %><div><h1><%= it.displayName %></h1>
<% if (it.headline) { %><p class="headline"><%= it.headline %></p>
<% } %></div></header>
<main>
<% for (const s of it.sections) { %><% if (s.kind === "ABOUT") { %><%~ include("@about", it) %><% } else if (s.kind === "PROJECTS") { %><%~ include("@projects", it) %><% } else if (s.kind === "SKILLS") { %><%~ include("@skills", it) %><% } else if (s.kind === "CONTACT") { %><%~ include("@contact", it) %><% } %>
<% } %></main>
</div>
<footer class="foot"><p>Trang được tạo lúc <%= it.generatedAtText %> từ dữ liệu do hệ thống ghi nhận.</p></footer>
</body>
</html>
`;
