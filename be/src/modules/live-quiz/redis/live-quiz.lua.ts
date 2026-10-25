/**
 * Lua của live quiz (p5-01 be.md §5). Nhúng dưới dạng chuỗi TS (thay vì file `.lua` như be.md §1) để `tsc` không phải sao chép
 * tài nguyên vào `dist/`. MỌI mốc thời gian dùng `redis.call('TIME')` — MỘT đồng hồ duy nhất cho mọi instance API (LQ-04).
 * Trả về mảng chuỗi (`{'OK', ...}` / `{'<MÃ LỖI>', ...}`) vì Lua cắt số thực khi trả về Redis.
 *
 * Hàm dùng chung: `now` tính từ TIME (ms).
 */
const NOW_MS = `local t = redis.call('TIME'); local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)`;

/**
 * KEYS: 1 meta · 2 players · 3 scores · 4 kicked — ARGV: 1 userId · 2 playerJson · 3 max · 4 initialComposite.
 * Vào phòng (idempotent theo userId): người bị kick → KICKED; đã có → EXISTS; đủ người → FULL. Khoá `players`/`scores` tạo lười
 * nên kế thừa TTL còn lại của `meta`.
 */
export const JOIN_LUA = `
local st = redis.call('HGET', KEYS[1], 'status')
if not st then return {'GONE'} end
if st == 'FINISHED' or st == 'CANCELLED' then return {'ENDED'} end
if redis.call('SISMEMBER', KEYS[4], ARGV[1]) == 1 then return {'KICKED'} end
if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 1 then return {'EXISTS', tostring(redis.call('HLEN', KEYS[2]))} end
if redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[3]) then return {'FULL'} end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[3], 'NX', ARGV[4], ARGV[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then redis.call('EXPIRE', KEYS[2], ttl); redis.call('EXPIRE', KEYS[3], ttl) end
return {'JOINED', tostring(redis.call('HLEN', KEYS[2]))}
`;

/**
 * KEYS: 1 meta — ARGV: 1 mode ('start'|'next') · 2 expectedVersion · 3 seconds · 4 total.
 * CAS `version` (LQ-05: hai host cùng `next` ⇒ chỉ một thắng). `start` cần status WAITING; `next` cần IN_PROGRESS + phase REVEAL.
 * Hết câu → {'END'} (service kết thúc phiên `COMPLETED`, version không đổi). Ghi mốc mở câu theo TIME của Redis.
 */
export const ADVANCE_LUA = `
local st = redis.call('HGET', KEYS[1], 'status')
if not st then return {'GONE'} end
local ver = tonumber(redis.call('HGET', KEYS[1], 'version'))
if ver ~= tonumber(ARGV[2]) then return {'VERSION', tostring(ver)} end
local phase = redis.call('HGET', KEYS[1], 'phase')
if ARGV[1] == 'start' then
  if st ~= 'WAITING' then return {'STATE', st} end
else
  if st ~= 'IN_PROGRESS' or phase ~= 'REVEAL' then return {'STATE', st} end
end
local nextIdx = tonumber(redis.call('HGET', KEYS[1], 'currentIndex')) + 1
if nextIdx >= tonumber(ARGV[4]) then return {'END'} end
${NOW_MS}
local deadline = now + tonumber(ARGV[3]) * 1000
redis.call('HSET', KEYS[1], 'status', 'IN_PROGRESS', 'phase', 'QUESTION', 'currentIndex', nextIdx,
  'questionStartedAtMs', now, 'deadlineAtMs', deadline, 'version', ver + 1)
return {'OK', tostring(nextIdx), tostring(now), tostring(deadline), tostring(ver + 1)}
`;

/**
 * KEYS: 1 meta — ARGV: 1 index. Đóng câu (QUESTION → REVEAL) đúng MỘT lần: hết giờ / mọi người đã trả lời / host bấm sớm.
 * Trả 1 nếu CHÍNH lời gọi này đóng câu (người đó phát `quiz:reveal`), 0 nếu đã đóng hoặc lệch câu.
 */
export const CLOSE_LUA = `
if redis.call('HGET', KEYS[1], 'status') ~= 'IN_PROGRESS' then return 0 end
if redis.call('HGET', KEYS[1], 'phase') ~= 'QUESTION' then return 0 end
if tonumber(redis.call('HGET', KEYS[1], 'currentIndex')) ~= tonumber(ARGV[1]) then return 0 end
redis.call('HSET', KEYS[1], 'phase', 'REVEAL')
return 1
`;

/**
 * KEYS: 1 meta · 2 players · 3 answers:{i} · 4 stats:{i} · 5 scores · 6 correct
 * ARGV: 1 userId · 2 index · 3 choice · 4 base · 5 bonus · 6 seconds.
 * Một đáp án/người/câu (HSETNX — LQ-01), chấm theo `TIME` của Redis (LQ-02: quá hạn → CLOSED, 0 điểm). KHÔNG trả đúng/sai
 * (chỉ điểm để service ghi log nội bộ) — người chơi biết đúng/sai ở `quiz:reveal`. Điểm ZSET: xem `TIEBREAK_BASE` (10^7).
 */
export const ANSWER_LUA = `
local st = redis.call('HGET', KEYS[1], 'status')
if not st then return {'GONE'} end
if st ~= 'IN_PROGRESS' then return {'STATE'} end
if redis.call('HEXISTS', KEYS[2], ARGV[1]) == 0 then return {'NOT_PLAYER'} end
if redis.call('HGET', KEYS[1], 'phase') ~= 'QUESTION' or tonumber(redis.call('HGET', KEYS[1], 'currentIndex')) ~= tonumber(ARGV[2]) then return {'CLOSED'} end
${NOW_MS}
if now > tonumber(redis.call('HGET', KEYS[1], 'deadlineAtMs')) then return {'CLOSED'} end
local corr = redis.call('HGET', KEYS[6], ARGV[2])
if not corr then return {'GONE'} end
local sep = string.find(corr, ':', 1, true)
local correct = tonumber(string.sub(corr, 1, sep - 1))
local nopt = tonumber(string.sub(corr, sep + 1))
local choice = tonumber(ARGV[3])
if choice < 0 or choice >= nopt then return {'BAD_CHOICE'} end
local elapsed = now - tonumber(redis.call('HGET', KEYS[1], 'questionStartedAtMs'))
if elapsed < 0 then elapsed = 0 end
if redis.call('HSETNX', KEYS[3], ARGV[1], ARGV[3] .. ':' .. elapsed) == 0 then return {'DUP'} end
redis.call('HINCRBY', KEYS[4], ARGV[3], 1)
local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then redis.call('EXPIRE', KEYS[3], ttl); redis.call('EXPIRE', KEYS[4], ttl) end
local points = 0
if choice == correct then
  local span = tonumber(ARGV[6]) * 1000
  local e = elapsed
  if e > span then e = span end
  points = tonumber(ARGV[4]) + math.floor(tonumber(ARGV[5]) * (1 - e / span))
  redis.call('ZINCRBY', KEYS[5], string.format('%.0f', points * 10000000 - elapsed), ARGV[1])
end
return {'OK', tostring(points), tostring(redis.call('HLEN', KEYS[3])), tostring(redis.call('HLEN', KEYS[2]))}
`;

/**
 * KEYS: 1 meta — ARGV: 1 expectedVersion (-1 = không kiểm) · 2 targetStatus · 3 allowedFrom ('*' hoặc danh sách trạng thái).
 * Đóng phiên (FINISHED/CANCELLED) — idempotent: đã đóng → ALREADY (service vẫn chạy bước ghi Mongo, vì lần trước có thể chết giữa chừng).
 */
export const FINISH_LUA = `
local st = redis.call('HGET', KEYS[1], 'status')
if not st then return {'GONE'} end
local ver = tonumber(redis.call('HGET', KEYS[1], 'version'))
if st == 'FINISHED' or st == 'CANCELLED' then return {'ALREADY', st, tostring(ver)} end
if tonumber(ARGV[1]) >= 0 and ver ~= tonumber(ARGV[1]) then return {'VERSION', tostring(ver)} end
if ARGV[3] ~= '*' and string.find(ARGV[3], st, 1, true) == nil then return {'STATE', st} end
redis.call('HSET', KEYS[1], 'status', ARGV[2], 'phase', 'ENDED', 'version', ver + 1)
return {'OK', st, tostring(ver + 1)}
`;
