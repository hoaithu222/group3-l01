/**
 * Commitlint config — enforce conventional commit messages.
 *
 * Format: <type>(<scope>): <subject>
 *
 * Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert
 *
 * Examples:
 *   feat(auth): add firebase login
 *   fix(users): resolve email duplicate check
 *   chore: update dependencies
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // Tính năng mới
        "fix",      // Sửa bug
        "docs",     // Chỉ thay đổi documentation
        "style",    // Format, semicolons, ...
        "refactor", // Refactor code
        "test",     // Thêm/sửa test
        "chore",    // Build, config, tools
        "perf",     // Cải thiện performance
        "ci",       // CI/CD changes
        "build",    // Build system
        "revert",   // Revert commit trước
      ],
    ],
    "subject-max-length": [2, "always", 100],
  },
};
