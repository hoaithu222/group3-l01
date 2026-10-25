import { normalizeSearch } from "../../../src/core/utils/normalize";
import { PERSON_BY_KEY, THU_KEY } from "../people";
import type { DmSpec, GroupChatSpec, Line, WorkspaceSpec } from "../types";

const MENTION_RE = /\{@([a-z0-9_]+)\}/g;
const MAX_TEXT = 2000;

/**
 * Kiểm tra toàn bộ nội dung seed TRƯỚC khi ghi bất cứ thứ gì: khoá người, tư cách thành viên, chỉ số trả lời, cột/nhãn của thẻ,
 * slug bộ học... Trả về danh sách lỗi (rỗng = hợp lệ) để người viết nội dung sửa một lượt thay vì chết giữa chừng khi đã ghi dở.
 */
export function validateSpecs(specs: readonly WorkspaceSpec[], dms: readonly DmSpec[], groupChats: readonly GroupChatSpec[]): string[] {
  const errors: string[] = [];
  const known = (k: string) => k === THU_KEY || PERSON_BY_KEY.has(k);
  const slugs = new Set<string>();
  const keys = new Set<string>();
  const rosterOf = new Map<string, Set<string>>();

  for (const ws of specs) {
    const where = `[${ws.key}]`;
    if (keys.has(ws.key)) errors.push(`${where} khoá nhóm bị trùng`);
    keys.add(ws.key);
    const all = [ws.owner, ...ws.admins, ...ws.members];
    const roster = new Set(all);
    rosterOf.set(ws.key, roster);
    if (roster.size !== all.length) errors.push(`${where} có người xuất hiện hai lần trong owner/admins/members`);
    for (const k of all) if (!known(k)) errors.push(`${where} khoá người không tồn tại: "${k}"`);
    for (const [k] of ws.pending ?? []) {
      if (!known(k)) errors.push(`${where} pending: khoá người không tồn tại "${k}"`);
      if (roster.has(k)) errors.push(`${where} pending: "${k}" đã là thành viên`);
    }

    const chanNames = new Set<string>();
    ws.channels.forEach((ch, ci) => {
      const cw = `${where} kênh "${ch.name}"`;
      const n = normalizeSearch(ch.name);
      if (chanNames.has(n)) errors.push(`${cw} bị trùng tên`);
      chanNames.add(n);
      if (ci === 0 && n !== "chung") errors.push(`${where} kênh đầu tiên phải là "Chung"`);
      if ((ch.type === "VOICE" || ch.type === "POMODORO") && (ch.lines?.length ?? 0) > 0) errors.push(`${cw} kênh VOICE/POMODORO không có tin`);
      const allowed = ch.private ? new Set([ws.owner, ...ch.private]) : roster;
      for (const k of ch.private ?? []) if (!roster.has(k)) errors.push(`${cw} private: "${k}" không thuộc nhóm`);
      checkLines(ch.lines ?? [], allowed, cw, errors, true);
    });

    for (const b of ws.boards) {
      const bw = `${where} bảng "${b.name}"`;
      const labelNames = new Set(b.labels.map(([n]) => n));
      if (b.columns.filter((c) => c.kind === "DONE").length !== 1) errors.push(`${bw} phải có đúng 1 cột DONE`);
      b.tasks.forEach((t, i) => {
        const tw = `${bw} thẻ #${i} "${t.title}"`;
        if (t.col < 0 || t.col >= b.columns.length) errors.push(`${tw} col=${t.col} ngoài phạm vi`);
        for (const l of t.labels ?? []) if (!labelNames.has(l)) errors.push(`${tw} nhãn "${l}" không có trong labels`);
        for (const k of [...(t.assignees ?? []), ...(t.by ? [t.by] : []), ...(t.comments ?? []).map(([by]) => by)]) {
          if (!roster.has(k)) errors.push(`${tw} người "${k}" không thuộc nhóm`);
        }
        if (t.title.length > 120) errors.push(`${tw} tiêu đề quá dài`);
      });
    }

    for (const s of ws.studySets) {
      if (slugs.has(s.slug)) errors.push(`${where} slug bộ học bị trùng: ${s.slug}`);
      slugs.add(s.slug);
      if (!roster.has(s.owner)) errors.push(`${where} bộ học "${s.slug}": chủ "${s.owner}" không thuộc nhóm`);
      if (s.items.length === 0) errors.push(`${where} bộ học "${s.slug}" rỗng`);
    }
    for (const e of ws.expenses ?? []) {
      for (const k of [e.paidBy, ...e.among]) if (!roster.has(k)) errors.push(`${where} khoản chi "${e.description}": "${k}" không thuộc nhóm`);
    }
  }

  for (const dm of dms) {
    const dw = `[dm:${dm.peer}]`;
    if (!known(dm.peer)) errors.push(`${dw} khoá người không tồn tại`);
    checkLines(dm.lines, new Set([THU_KEY, dm.peer]), dw, errors, false);
  }
  for (const g of groupChats) {
    const gw = `[group:${g.title}]`;
    const roster = rosterOf.get(g.workspace);
    if (!roster) {
      errors.push(`${gw} nhóm làm việc không tồn tại: ${g.workspace}`);
      continue;
    }
    const members = new Set([g.owner, ...g.members]);
    for (const k of members) if (!roster.has(k)) errors.push(`${gw} "${k}" không thuộc nhóm làm việc ${g.workspace}`);
    checkLines(g.lines, members, gw, errors, false);
  }
  return errors;
}

function checkLines(lines: readonly Line[], allowed: ReadonlySet<string>, where: string, errors: string[], allowRich: boolean): void {
  lines.forEach(([by, text, opts], i) => {
    const lw = `${where} dòng ${i}`;
    if (!allowed.has(by)) errors.push(`${lw}: người gửi "${by}" không được nói ở đây`);
    if (text.trim().length === 0 || text.length > MAX_TEXT) errors.push(`${lw}: nội dung rỗng hoặc quá dài`);
    for (const m of text.matchAll(MENTION_RE)) if (!allowed.has(m[1])) errors.push(`${lw}: nhắc tên "${m[1]}" không thuộc phạm vi`);
    if (opts?.reply !== undefined && !(opts.reply >= 0 && opts.reply < i)) errors.push(`${lw}: reply=${opts.reply} không trỏ tới dòng đứng trước`);
    for (const people of Object.values(opts?.react ?? {})) {
      for (const k of people) if (!allowed.has(k)) errors.push(`${lw}: người thả cảm xúc "${k}" không thuộc phạm vi`);
    }
    if (!allowRich && (opts?.thread || opts?.poll)) errors.push(`${lw}: thread/poll không dùng được ở đây`);
    for (const [tBy, tText] of opts?.thread ?? []) {
      if (!allowed.has(tBy)) errors.push(`${lw}: người trả lời luồng "${tBy}" không thuộc phạm vi`);
      if (tText.trim().length === 0 || tText.length > MAX_TEXT) errors.push(`${lw}: tin trong luồng rỗng/quá dài`);
      for (const m of tText.matchAll(MENTION_RE)) if (!allowed.has(m[1])) errors.push(`${lw}: nhắc tên "${m[1]}" trong luồng không thuộc phạm vi`);
    }
    if (opts?.poll) {
      if (opts.poll.options.length < 2) errors.push(`${lw}: poll cần ≥ 2 lựa chọn`);
      if (opts.poll.votes.length !== opts.poll.options.length) errors.push(`${lw}: poll.votes phải cùng độ dài options`);
      const seen = new Set<string>();
      opts.poll.votes.forEach((voters) =>
        voters.forEach((k) => {
          if (!allowed.has(k)) errors.push(`${lw}: người bỏ phiếu "${k}" không thuộc phạm vi`);
          if (!opts.poll?.multi && seen.has(k)) errors.push(`${lw}: "${k}" bỏ phiếu hai lựa chọn nhưng poll không multi`);
          seen.add(k);
        })
      );
    }
  });
}
