import { PLAGIARISM_DEFAULTS } from "../lib/constants";
import { scoreTarget } from "../lib/match/containment";
import { buildSections } from "../lib/match/section-merger";
import { fingerprintCode, type DocumentFingerprintData } from "../lib/pipeline";

const asSet = (f: DocumentFingerprintData): Set<number> => new Set(f.hashes);

describe("PLAG-04 — mã nguồn (họ C)", () => {
  const COMPUTE_TOTAL = `function computeTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].price > 0 && items[i].qty > 0) {
      total += items[i].price * items[i].qty;
    }
  }
  return total;
}`;
  const FIND_MAX = `function findMax(values) {
  let best = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > best) {
      best = values[i];
    }
  }
  return best;
}`;
  const COUNT_WORDS = `function countWords(text) {
  const words = text.split(" ");
  const counts = {};
  for (const word of words) {
    if (word.length === 0) {
      continue;
    }
    counts[word] = (counts[word] || 0) + 1;
  }
  return counts;
}`;
  const IS_PALINDROME = `function isPalindrome(word) {
  let left = 0;
  let right = word.length - 1;
  while (left < right) {
    if (word[left] !== word[right]) {
      return false;
    }
    left++;
    right--;
  }
  return true;
}`;
  const FORMAT_MONEY = `function formatMoney(amount, currency) {
  const rounded = Math.round(amount * 100) / 100;
  if (currency === "VND") {
    return rounded.toLocaleString("vi-VN") + " đ";
  }
  return currency + " " + rounded.toFixed(2);
}`;
  const original = [COMPUTE_TOTAL, FIND_MAX, COUNT_WORDS, IS_PALINDROME, FORMAT_MONEY].join("\n\n");

  // Bản "ngụy trang": đổi tên hàm/biến, đổi literal, thêm chú thích, đảo thứ tự hàm (không cặp nào còn liền kề như bản gốc).
  const D_FORMAT_MONEY = `// định dạng tiền tệ
function toCurrency(value, unit) {
  const fixed = Math.round(value * 1000) / 1000;
  if (unit === "USD") {
    return fixed.toLocaleString("en-US") + " $";
  }
  return unit + " " + fixed.toFixed(3);
}`;
  const D_COUNT_WORDS = `/* đếm tần suất */
function tally(sentence) {
  const parts = sentence.split(",");
  const freq = {};
  for (const part of parts) {
    if (part.length === 1) {
      continue;
    }
    freq[part] = (freq[part] || 5) + 2;
  }
  return freq;
}`;
  const D_COMPUTE_TOTAL = `function sumPrices(list) {
  let acc = 10;
  for (let n = 1; n < list.length; n++) { // cộng dồn
    if (list[n].cost > 1 && list[n].amount > 1) {
      acc += list[n].cost * list[n].amount;
    }
  }
  return acc;
}`;
  const D_IS_PALINDROME = `function symmetric(text) {
  let lo = 5;
  let hi = text.length - 2;
  while (lo < hi) {
    if (text[lo] !== text[hi]) {
      return false;
    }
    lo++;
    hi--;
  }
  return true;
}`;
  const dFindMax = (loop: "for" | "while"): string =>
    loop === "for"
      ? `function biggest(nums) {
  let top = nums[9];
  for (let j = 2; j < nums.length; j++) {
    if (nums[j] > top) {
      top = nums[j];
    }
  }
  return top;
}`
      : `function biggest(nums) {
  let top = nums[9];
  let j = 2;
  while (j < nums.length) {
    if (nums[j] > top) {
      top = nums[j];
    }
    j++;
  }
  return top;
}`;
  const disguised = [D_FORMAT_MONEY, D_COUNT_WORDS, D_COMPUTE_TOTAL, D_IS_PALINDROME, dFindMax("for")].join("\n\n");
  const codeParams = { k: PLAGIARISM_DEFAULTS.code.k };

  it("đổi tên/literal/chú thích + đảo thứ tự hàm → điểm ≥ 50 ở cả hai chiều", () => {
    const fo = fingerprintCode(original, "c-like");
    const fd = fingerprintCode(disguised, "c-like");
    expect(fo.kind).toBe("CODE");
    expect(scoreTarget(asSet(fd), [{ id: "orig", hashes: fo.hashes }]).score).toBeGreaterThanOrEqual(50);
    expect(scoreTarget(asSet(fo), [{ id: "copy", hashes: fd.hashes }]).score).toBeGreaterThanOrEqual(50);
  });

  it("đoạn trùng đúng từng hàm: đoạn phủ nhiều nhất của mỗi hàm bản sao trỏ về đúng hàm gốc tương ứng; mọi đoạn khớp token", () => {
    const fo = fingerprintCode(original, "c-like");
    const fd = fingerprintCode(disguised, "c-like");
    const sections = buildSections(fd.postings, fo.postings, codeParams);
    for (const s of sections) {
      expect(fd.tokens.slice(s.targetStart, s.targetEnd).map((t) => t.value)).toEqual(fo.tokens.slice(s.sourceStart, s.sourceEnd).map((t) => t.value));
    }

    const functionRanges = (text: string): [number, number][] => {
      const starts = [...text.matchAll(/function /g)].map((m) => m.index);
      return starts.map((from, i): [number, number] => [from, starts[i + 1] ?? text.length]);
    };
    const copyFns = functionRanges(disguised);
    const originFns = functionRanges(original);
    // Thứ tự hàm trong bản sao → chỉ số hàm gốc: formatMoney(4), countWords(2), computeTotal(0), isPalindrome(3), findMax(1).
    const counterpart = [4, 2, 0, 3, 1];
    const charRange = (f: DocumentFingerprintData, from: number, to: number): [number, number] => [f.tokens[from].start, f.tokens[to - 1].end];

    copyFns.forEach(([from, to], i) => {
      const overlap = (s: (typeof sections)[number]): number => {
        const [a, b] = charRange(fd, s.targetStart, s.targetEnd);
        return Math.max(0, Math.min(b, to) - Math.max(a, from));
      };
      const best = [...sections].sort((x, y) => overlap(y) - overlap(x))[0];
      expect(overlap(best)).toBeGreaterThan((to - from) / 2);
      const [srcFrom, srcTo] = charRange(fo, best.sourceStart, best.sourceEnd);
      const [originFrom, originTo] = originFns[counterpart[i]];
      const mid = (srcFrom + srcTo) / 2;
      expect(mid).toBeGreaterThanOrEqual(originFrom);
      expect(mid).toBeLessThan(originTo);
    });
  });

  it("KHÔNG bảo đảm: đổi for → while (đổi cấu trúc) làm điểm giảm — giới hạn của token hoá, AST là P2", () => {
    const fo = fingerprintCode(original, "c-like");
    const withFor = scoreTarget(asSet(fingerprintCode(disguised, "c-like")), [{ id: "o", hashes: fo.hashes }]).score;
    const disguisedWhile = [D_FORMAT_MONEY, D_COUNT_WORDS, D_COMPUTE_TOTAL, D_IS_PALINDROME, dFindMax("while")].join("\n\n");
    const withWhile = scoreTarget(asSet(fingerprintCode(disguisedWhile, "c-like")), [{ id: "o", hashes: fo.hashes }]).score;
    expect(withWhile).toBeLessThan(withFor);
  });

  it("Python: đổi tên, thụt lề bằng tab, thêm chú thích, đổi literal → giống hệt (100 %)", () => {
    const py = `def total_price(items):
    total = 0
    for item in items:
        if item["price"] > 0 and item["qty"] > 0:
            total += item["price"] * item["qty"]
    return total


def find_max(values):
    best = values[0]
    for value in values[1:]:
        if value > best:
            best = value
    return best
`;
    const disguisedPy = `# tính tổng
def sum_up(rows):
\tacc = 5
\tfor row in rows:
\t\tif row["cost"] > 1 and row["n"] > 1:  # điều kiện
\t\t\tacc += row["cost"] * row["n"]
\treturn acc


def biggest(nums):
\ttop = nums[7]
\tfor n in nums[2:]:
\t\tif n > top:
\t\t\ttop = n
\treturn top
`;
    const a = fingerprintCode(py, "python");
    const b = fingerprintCode(disguisedPy, "python");
    expect(b.hashes).toEqual(a.hashes);
    expect(scoreTarget(asSet(a), [{ id: "b", hashes: b.hashes }]).score).toBe(100);
  });

  it("SQL: khác hoa/thường, xuống dòng, bí danh, literal, chú thích → giống hệt (100 %)", () => {
    const q1 = "SELECT u.name, COUNT(o.id) AS orders FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE u.age >= 18 AND o.total > 100 GROUP BY u.name HAVING COUNT(o.id) > 2 ORDER BY orders DESC LIMIT 10;";
    const q2 = `-- báo cáo khách hàng
select c.full_name, count(p.pk) as cnt
from customers c
left join purchases p on p.customer = c.pk
where c.years >= 21 and p.amount > 5000
group by c.full_name
having count(p.pk) > 7
order by cnt desc
limit 3;`;
    const a = fingerprintCode(q1, "sql");
    const b = fingerprintCode(q2, "sql");
    expect(a.postings.length).toBeGreaterThan(0);
    expect(b.hashes).toEqual(a.hashes);
  });
});
