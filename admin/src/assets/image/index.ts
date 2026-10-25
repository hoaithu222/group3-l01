// ⚠️  AUTO-GENERATED — DO NOT EDIT MANUALLY
// Source: src/assets/image/*.{png,jpg,jpeg,gif,svg,webp,avif}
// Regenerate: npm run generate:images

import folderEmptyUrl from "./folder-empty.svg?url";
import folderFillUrl from "./folder-fill.svg?url";
import loadingSpinnerUrl from "./loading-spinner.svg?url";

/** Map of image name (kebab-case filename stem) → bundled URL. */
export const images = {
  "folder-empty": folderEmptyUrl,
  "folder-fill": folderFillUrl,
  "loading-spinner": loadingSpinnerUrl,
} as const;

export type ImageName = keyof typeof images;
