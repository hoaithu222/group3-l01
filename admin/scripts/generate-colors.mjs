// scripts/generate-colors.mjs — Generate CSS variables + Tailwind @theme from colors-theme.json
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_PATH = path.join(__dirname, '../src/styles/theme/colors-theme.json');
const CSS_OUTPUT = path.join(__dirname, '../src/styles/theme/generated-colors.css');
const TS_OUTPUT = path.join(__dirname, '../src/shared/theme/colors.generated.ts');

const FILE_HEADER = `/* This file is generated. DO NOT EDIT.\n * Edit "colors-theme.json" instead.\n */`;

const generateColorVariables = (colors) =>
  Object.entries(colors)
    .map(([key, value]) => `  --color-${key}: ${value};`)
    .join('\n');

const generateThemeInline = (colorKeys) =>
  colorKeys.map((key) => `  --color-${key}: var(--color-${key});`).join('\n');

const generateCSS = (config) => {
  const light = config.light || {};
  const dark = config.dark || {};
  const themeKeys = Object.keys(light);
  return `${FILE_HEADER}

:root {
${generateColorVariables(light)}
}

.dark {
${generateColorVariables(dark)}
}

/* Tailwind v4: map theme to CSS vars so text-primary-5, bg-neutral-3, etc. work */
@theme inline {
${generateThemeInline(themeKeys)}
}
`;
};

const generateTS = (config) => {
  const light = config.light || {};
  const dark = config.dark || {};
  const keys = Object.keys(light);
  const typeUnion = keys.map((k) => `  | '${k}'`).join('\n');
  const lightEntries = Object.entries(light)
    .map(([k, v]) => `  '${k}': '${v}',`)
    .join('\n');
  const darkEntries = Object.entries(dark)
    .map(([k, v]) => `  '${k}': '${v}',`)
    .join('\n');

  return `/** Generated from colors-theme.json. DO NOT EDIT. */
export type ThemeColorKey =
${typeUnion};

export const THEME_COLOR_KEYS: ThemeColorKey[] = [
${keys.map((k) => `  '${k}',`).join('\n')}
];

export const LIGHT_COLORS: Record<ThemeColorKey, string> = {
${lightEntries}
};

export const DARK_COLORS: Record<ThemeColorKey, string> = {
${darkEntries}
};
`;
};

try {
  const file = await fs.readFile(INPUT_PATH, 'utf-8');
  const colorsConfig = JSON.parse(file);

  // Generate CSS
  const cssContent = generateCSS(colorsConfig);
  await fs.mkdir(path.dirname(CSS_OUTPUT), { recursive: true });
  await fs.writeFile(CSS_OUTPUT, cssContent);
  console.log(`✅ Generated "${CSS_OUTPUT}"`);

  // Generate TypeScript
  const tsContent = generateTS(colorsConfig);
  await fs.mkdir(path.dirname(TS_OUTPUT), { recursive: true });
  await fs.writeFile(TS_OUTPUT, tsContent);
  console.log(`✅ Generated "${TS_OUTPUT}"`);
} catch (error) {
  console.error('❌ Failed:', error);
}
