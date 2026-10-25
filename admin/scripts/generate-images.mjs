// scripts/generate-images.mjs — Generate image registry from raster/vector assets.
// Mirrors generate-icons.mjs pattern.
//
// Source: src/assets/image/*.{png,jpg,jpeg,gif,svg,webp,avif}
// Output: src/assets/image/index.ts  (name -> ?url import map + ImageName type)
// Run:    npm run generate:images
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const IMAGE_DIR     = path.resolve(__dirname, '../src/assets/image');
const REGISTRY_PATH = path.join(IMAGE_DIR, 'index.ts');

const EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif'];

const HEADER = `// ⚠️  AUTO-GENERATED — DO NOT EDIT MANUALLY
// Source: src/assets/image/*.{png,jpg,jpeg,gif,svg,webp,avif}
// Regenerate: npm run generate:images`;

// "pms_logo_transparent_background" → "pms-logo-transparent-background"
function toKebab(str) {
  return str
    .replace(/[_\s]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

// "pms-logo-transparent" → "pmsLogoTransparent"
function toCamel(str) {
  return str.replace(/[-_\s]+(\w)/g, (_, c) => c.toUpperCase());
}

async function main() {
  let entries;
  try {
    entries = await fs.readdir(IMAGE_DIR);
  } catch (err) {
    console.error('❌ Cannot read', IMAGE_DIR, err.message);
    process.exit(1);
  }

  const files = entries
    .filter((f) => EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();

  if (!files.length) {
    console.error('❌ No image files found in', IMAGE_DIR);
    process.exit(1);
  }

  console.log(`🔍 Found ${files.length} image files\n`);

  const items = [];
  const seenKeys = new Set();
  const seenVars = new Set();

  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    let key = toKebab(base);
    let varName = toCamel(base) + 'Url';

    // De-dup keys: append ext stem if duplicate (e.g. logo.jpg vs logo.png)
    if (seenKeys.has(key)) {
      const ext = path.extname(file).slice(1).toLowerCase();
      console.warn(`  ⚠️  duplicate key "${key}" — suffixing with "-${ext}"`);
      key = `${key}-${ext}`;
      varName = toCamel(base) + ext.charAt(0).toUpperCase() + ext.slice(1) + 'Url';
    }
    if (seenVars.has(varName)) varName = varName + '_' + items.length;

    seenKeys.add(key);
    seenVars.add(varName);
    items.push({ file, key, varName });
    console.log(`  ✓  ${file.padEnd(40)} → ${key}`);
  }

  const importLines = items
    .map((i) => `import ${i.varName} from "./${i.file}?url";`)
    .join('\n');

  const mapEntries = items
    .map((i) => `  "${i.key}": ${i.varName},`)
    .join('\n');

  const out = [
    HEADER,
    '',
    importLines,
    '',
    '/** Map of image name (kebab-case filename stem) → bundled URL. */',
    'export const images = {',
    mapEntries,
    '} as const;',
    '',
    'export type ImageName = keyof typeof images;',
    '',
  ].join('\n');

  await fs.writeFile(REGISTRY_PATH, out, 'utf-8');
  console.log(`\n📦 ${REGISTRY_PATH}`);
  console.log(`✅ Done — ${items.length} images registered`);
}

main().catch((err) => {
  console.error('❌ generate-images failed:', err);
  process.exit(1);
});
