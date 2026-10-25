// scripts/generate-icons.mjs — Generate icon registry from SVG assets
// Produces ONLY 2 files (no per-icon TSX files):
//   1. src/assets/icons/index.tsx   — all component defs in one file
//   2. src/shared/ui/icons/index.ts — name→component registry + types
// Run: npm run generate:icons
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICONS_DIR = path.resolve(__dirname, '../src/assets/icons');
const SYSTEMS_INDEX = path.join(ICONS_DIR, 'index.tsx');
const REGISTRY_PATH = path.resolve(__dirname, '../src/shared/ui/icons/index.ts');

const GENERATED_HEADER = `// ⚠️  AUTO-GENERATED — DO NOT EDIT MANUALLY
// Source: src/assets/icons/*.svg
// Regenerate: npm run generate:icons`;

function toPascalCase(str) {
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function extractAttr(svg, attr) {
  const m = svg.match(new RegExp(`${attr}="([^"]*)"`));
  return m ? m[1] : null;
}

// Kebab-case SVG presentation attributes → React camelCase (JSX-safe).
// Figma exports + stroke-based outline icons dùng các attr này; React yêu cầu
// camelCase, nếu không sẽ warn "Invalid DOM property" và bỏ qua thuộc tính.
const SVG_ATTR_CAMEL = {
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-miterlimit': 'strokeMiterlimit',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'clip-path': 'clipPath',
  'color-interpolation-filters': 'colorInterpolationFilters',
};

// Transform raw SVG inner elements to JSX-safe markup with currentColor fills
function transformInner(raw) {
  let out = raw
    .replace(/\s+id="[^"]*"/g, '')
    .replace(/fill="var\(--fill-\d+,\s*[^)]+\)"/g, 'fill="currentColor"')
    .replace(/stroke="var\(--stroke-\d+,\s*[^)]+\)"/g, 'stroke="currentColor"')
    .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"')
    .replace(/stroke="#[0-9a-fA-F]{3,8}"/g, 'stroke="currentColor"')
    .replace(/\bclass="/g, 'className="');

  // Kebab → camelCase cho mọi attr trình bày (chỉ match tên thuộc tính ngay trước `=`).
  for (const [kebab, camel] of Object.entries(SVG_ATTR_CAMEL)) {
    out = out.replace(new RegExp(`\\b${kebab}=`, 'g'), `${camel}=`);
  }

  return out.trim();
}

function isValidSvgContent(inner) {
  return /<(path|circle|rect|ellipse|polygon|polyline|line|g|use|defs|clipPath|mask)\b/.test(inner);
}

async function processSvg(svgPath) {
  const raw = await fs.readFile(svgPath, 'utf-8');
  const filename = path.basename(svgPath, '.svg');
  const componentName = `${toPascalCase(filename)}Icon`;
  const viewBox = extractAttr(raw, 'viewBox') ?? '0 0 16 16';
  const innerMatch = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  const inner = innerMatch ? transformInner(innerMatch[1].trim()) : '';

  if (!inner || !isValidSvgContent(inner)) {
    return { filename, componentName, viewBox, inner: null };
  }
  return { filename, componentName, viewBox, inner };
}

// Delete stale per-icon .tsx/.ts files left from previous runs
async function cleanStaleFiles(iconsDir) {
  const entries = await fs.readdir(iconsDir);
  const stale = entries.filter((f) => {
    if (!f.endsWith('.tsx') && !f.endsWith('.ts')) return false;
    return f !== 'index.tsx'; // keep only the generated barrel
  });
  await Promise.all(stale.map((f) => fs.unlink(path.join(iconsDir, f))));
  if (stale.length) {
    console.log(`🗑  Removed ${stale.length} stale files`);
  }
}

async function main() {
  const entries = await fs.readdir(ICONS_DIR);
  const svgFiles = entries.filter((f) => f.endsWith('.svg')).sort();

  if (!svgFiles.length) {
    console.error('❌ No SVG files found in', ICONS_DIR);
    process.exit(1);
  }

  console.log(`🔍 Found ${svgFiles.length} SVG files\n`);

  // Remove stale per-icon files from previous runs
  await cleanStaleFiles(ICONS_DIR);

  const valid = [];
  const failed = [];

  for (const file of svgFiles) {
    const result = await processSvg(path.join(ICONS_DIR, file));
    if (!result.inner) {
      failed.push(file);
      console.warn(`  ⚠️  ${file} — skipped (no valid SVG elements)`);
    } else {
      valid.push(result);
    }
  }

  // ── File 1: src/assets/icons/systems/index.tsx ──────────────────────────
  // All 112 components defined in one file — no per-icon files
  const componentDefs = valid.map(
    ({ componentName, viewBox, inner }) =>
      `export function ${componentName}({ className, ...props }: SVGProps<SVGSVGElement>) {\n` +
      `  return (\n` +
      `    <svg viewBox="${viewBox}" fill="none" overflow="visible" aria-hidden className={className} {...props}>\n` +
      `      ${inner}\n` +
      `    </svg>\n` +
      `  );\n` +
      `}`
  );

  const systemsIndexContent = [
    GENERATED_HEADER,
    `import type { SVGProps } from 'react';`,
    ``,
    ...componentDefs,
    ``,
  ].join('\n');

  await fs.writeFile(SYSTEMS_INDEX, systemsIndexContent, 'utf-8');
  console.log(`📦 icons/index.tsx — ${valid.length} components`);

  // ── File 2: src/shared/ui/icons/index.ts ────────────────────────────────
  const namedImports = valid.map(({ componentName }) => `  ${componentName},`).join('\n');
  const mapEntries = valid
    .map(({ filename, componentName }) => `  '${filename}': ${componentName},`)
    .join('\n');

  const registryContent = [
    GENERATED_HEADER,
    `import type { ComponentType, SVGProps } from 'react';`,
    `import {`,
    namedImports,
    `} from '@/assets/icons';`,
    ``,
    `/** Map of icon name (kebab-case SVG filename) → React component */`,
    `export const systemIcons = {`,
    mapEntries,
    `} as const;`,
    ``,
    `export type SystemIconName = keyof typeof systemIcons;`,
    `export type SystemIconComponent = ComponentType<SVGProps<SVGSVGElement>>;`,
    ``,
  ].join('\n');

  await fs.writeFile(REGISTRY_PATH, registryContent, 'utf-8');
  console.log(`📦 shared/ui/icons/index.ts — registry ready\n`);

  console.log(`✅ Done — ${valid.length} icons in 2 files`);
  if (failed.length) {
    console.warn(`⚠️  ${failed.length} SVG files skipped: ${failed.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('❌ generate-icons failed:', err);
  process.exit(1);
});
