/**
 * Barrel CÔNG KHAI của module `discovery` (p1-09) — ngoại lệ có chủ đích của luật "không import chéo module", cùng cơ chế
 * `@modules/messages/public`. Chỉ export hàm THUẦN mà module khác cần dùng lại (p5-04 `workspace-search` dựng snippet + tô đậm giữ
 * nguyên dấu gốc) — không export service/repository.
 */
export { buildSnippet, buildDisplayText, type Snippet } from "./services/snippet.util";
