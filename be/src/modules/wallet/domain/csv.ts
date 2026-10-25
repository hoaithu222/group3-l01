/**
 * CSV UTF-8 có BOM (Excel đọc đúng tiếng Việt). Chống CSV injection (OWASP): ô bắt đầu bằng
 * `= + - @` hoặc tab/CR được thêm dấu `'` phía trước để bảng tính không coi là công thức.
 */
const BOM = "﻿";
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Số âm thật (vd điều chỉnh -7500) là dữ liệu chứ không phải công thức — chỉ chặn với chuỗi do người dùng nhập.
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
