import fs from 'fs';
import process from 'process';

const FONT_PATH = './src/styles/font/font.json';
const OUT_PATH = './src/styles/font/generated-font.css';

// Suffix -> { CSS variable, giá trị mặc định }.
//
// Base weight = 450 (in-between Regular 400 and Medium 500) — dùng Inter
// variable font để chữ rõ nét hơn trên nền tối (chuẩn trading dashboard:
// TradingView / Stripe / Vercel). Các suffix explicit (-medium, -semibold,
// -bold) giữ nguyên 500/600/700 cho hierarchy.
//
// Vì sao đi qua biến `--fw-*` thay vì ghi thẳng con số:
//   TV mode cần nâng bậc weight (450→500, 500→600) vì font-weight KHÔNG scale
//   theo `--ui-scale`, mà nét mảnh thì chìm trên panel TV nhìn từ xa. Nếu
//   override bằng một rule CSS riêng (`.tv .text-body-14 { font-weight: 500 }`)
//   thì rule đó có specificity NGANG với utility `font-bold`, và ai thắng phụ
//   thuộc thứ tự Tailwind sắp xếp output → có thể âm thầm bóp chữ đậm thành 500.
//   Repo ĐANG có tổ hợp đó thật (`text-h2 font-bold`,
//   `text-caption-12-medium font-semibold`). Dùng biến giữ nguyên 100% cấu trúc
//   rule và specificity hiện tại — chỉ đổi GIÁ TRỊ, nên không thể phát sinh
//   tranh chấp mới. Giá trị TV khai ở `globals.css` (`.tv { --fw-regular: … }`).
//
// NOTE: src/shared/utils/cn.ts reads the same font.json + mirrors these suffixes
// to keep tailwind-merge from dropping the size tokens — keep them in sync.
const fontWeightSuffix = {
    '': { variable: '--fw-regular', fallback: 450 },
    '-medium': { variable: '--fw-medium', fallback: 500 },
    '-semibold': { variable: '--fw-semibold', fallback: 600 },
    '-bold': { variable: '--fw-bold', fallback: 700 },
};

const ROOT_FONT_SIZE_PX = 16;

/**
 * "14px" -> "0.875rem".
 *
 * ⛔ KHÔNG phóng root font-size. Tailwind v4 khai `--spacing` bằng rem, nên
 * phóng gốc là phóng luôn mọi `p-*` / `gap-*` / `h-*` → bố cục vỡ. Cơ chế TV
 * vì thế nhân `--ui-scale` vào ĐÚNG token chữ, ngay trong utility sinh ra ở
 * đây (`calc(var(--fs-x) * var(--ui-scale))`); khung giữ nguyên kích thước.
 *
 * `font.json` vẫn khai bằng px vì dễ đối chiếu Figma — chỉ output là rem.
 */
const toRem = (value) => {
    const px = parseFloat(value);
    if (Number.isNaN(px)) {
        throw new Error(`generate-font: không đọc được giá trị px "${value}" trong font.json`);
    }
    // parseFloat(9px)/16 = 0.5625 — mọi cỡ trong font.json đều ra phân số nhị
    // phân gọn, nhưng vẫn cắt đuôi phòng khi thêm cỡ lẻ (vd 15px → 0.9375).
    const rem = Number((px / ROOT_FONT_SIZE_PX).toFixed(6));
    return `${rem}rem`;
};

const main = () => {
    const raw = fs.readFileSync(FONT_PATH, 'utf-8');
    const fontData = JSON.parse(raw);

    let css = '/* ⚠️  AUTO-GENERATED — DO NOT EDIT. Run `npm run generate:font`. */\n';
    css += '/* Source: src/styles/font/font.json */\n';
    css += '/*\n';
    css += ' * Cỡ chữ:   `calc(var(--fs-{token}, <mặc định>) * var(--ui-scale, 1))`\n';
    css += ' * Giãn dòng: `calc(var(--lh-{token}, <mặc định>) * var(--lh-scale, 1))`\n';
    css += ' * Weight qua `--fw-*`. Ở tỉ lệ 1 kết quả ĐÚNG BẰNG số trong font.json.\n';
    css += ' *\n';
    css += ' * ⚠️ Giãn dòng dùng biến RIÊNG (`--lh-scale`), KHÔNG dùng chung `--ui-scale`.\n';
    css += ' * Lý do: rất nhiều ô trong app có CHIỀU CAO CỐ ĐỊNH vừa khít một dòng chữ\n';
    css += ' * (`h-6` = 24px, `h-7`, `h-8`…). Giãn dòng tăng cùng nhịp với cỡ chữ sẽ đẩy\n';
    css += ' * dòng cao hơn ô và chữ TRÀN / ĐÈ lên nhau. `--lh-scale` tăng ở NỬA nhịp nên\n';
    css += ' * chữ to lên mà chiều cao dòng gần như giữ nguyên. Xem `globals.css`.\n';
    css += ' *\n';
    css += ' * ⛔ VÌ SAO NHÂN Ở ĐÂY, KHÔNG PHẢI Ở ROOT FONT-SIZE\n';
    css += ' * Bản trước phóng to bằng `html { font-size: calc(16px * var(--ui-scale)) }`.\n';
    css += ' * Cách đó phóng to MỌI thứ, không riêng chữ: Tailwind v4 để `--spacing`\n';
    css += ' * theo rem nên `p-2`, `h-11`, `w-80`, `gap-2`… đều giãn theo. Ở 1.8× thì màn\n';
    css += ' * 1920px chỉ còn ~1067px không gian logic → bảng, panel, header tràn và vỡ\n';
    css += ' * bố cục. Nhân vào riêng token chữ thì KHUNG GIỮ NGUYÊN, chỉ chữ to lên —\n';
    css += ' * đúng thứ màn hình TV cần.\n';
    css += ' *\n';
    css += ' * Biến `--fs-{token}` riêng vẫn giữ để nâng SÀN cho vài token bé nhất\n';
    css += ' * (caption-9 / caption-10) mà không phải sửa ~200 chỗ gọi trong JSX.\n';
    css += ' * Xem `globals.css` mục "TV mode".\n';
    css += ' */\n\n';

    // Emit one utility per (token, weight) pair with explicit font-size /
    // line-height / font-weight. Avoid `font:` shorthand because it requires
    // font-family at the end — without it the numeric weight is mis-parsed as
    // font-family and the weight silently fails to apply.
    //
    // ⛔ PHẢI dùng `@utility` (Tailwind v4), KHÔNG phải `.class` thường.
    // Class thường nằm ngoài tầm biết của Tailwind nên MỌI variant đều không
    // sinh ra: `wide:text-body-14`, `md:text-caption-12`, `hover:text-h4-bold`…
    // đều bị bỏ qua IM LẶNG (class có trong JSX, không có rule nào trong CSS).
    // Lỗi này từng làm 40 khai báo responsive trong `src/` không chạy.
    // `@utility` đăng ký token thành utility thật → dùng được mọi variant.
    for (const [key, value] of Object.entries(fontData)) {
        for (const [suffix, weight] of Object.entries(fontWeightSuffix)) {
            css += `@utility text-${key}${suffix} {\n`;
            css += `  font-size: calc(var(--fs-${key}, ${toRem(value.fontSize)}) * var(--ui-scale, 1));\n`;
            css += `  line-height: calc(var(--lh-${key}, ${toRem(value.lineHeight)}) * var(--lh-scale, 1));\n`;
            css += `  font-weight: var(${weight.variable}, ${weight.fallback});\n`;
            css += `}\n\n`;
        }
    }

    fs.writeFileSync(OUT_PATH, css);
    console.log('✅ Font CSS generated at', OUT_PATH);
};

main();
