#!/usr/bin/env ts-node
/**
 * ============================================================================
 * PROJECT SETUP — Cấu hình dự án mới từ base template
 * ============================================================================
 *
 * Sử dụng:
 *   npm run setup -- <projectName>
 *
 * Script sẽ:
 *   1. Đổi tên project trong package.json
 *   2. Tạo file .env từ .env.example
 *   3. Xóa module mẫu (users) nếu muốn
 *   4. Reset git history
 * ============================================================================
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as readline from "readline";

const rootDir = path.resolve(__dirname, "..");

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const projectName = process.argv[2];

  if (!projectName) {
    console.error("❌ Sử dụng: npm run setup -- <projectName>");
    console.error("   Ví dụ: npm run setup -- my-awesome-api");
    process.exit(1);
  }

  console.log(`\n🚀 Cấu hình dự án: ${projectName}\n`);

  // 1. Update package.json
  const pkgPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.name = projectName;
  pkg.version = "0.1.0";
  pkg.description = `${projectName} API`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log(`✅ package.json → name: "${projectName}"`);

  // 2. Tạo .env từ .env.example
  const envExample = path.join(rootDir, ".env.example");
  const envFile = path.join(rootDir, ".env");
  if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
    fs.copyFileSync(envExample, envFile);
    console.log("✅ .env đã tạo từ .env.example");
  } else if (fs.existsSync(envFile)) {
    console.log("⏩ .env đã tồn tại, bỏ qua");
  }

  // 3. Update docker-compose service name
  const composePath = path.join(rootDir, "docker-compose.yml");
  if (fs.existsSync(composePath)) {
    let compose = fs.readFileSync(composePath, "utf-8");
    compose = compose.replace(/container_name:\s*\S+/g, `container_name: ${projectName}`);
    fs.writeFileSync(composePath, compose, "utf-8");
    console.log("✅ docker-compose.yml → container_name updated");
  }

  // 4. Hỏi có muốn xóa module mẫu không
  const removeExample = await ask("🗑️  Xóa module mẫu (users)? (y/N): ");
  if (removeExample.toLowerCase() === "y") {
    const usersDir = path.join(rootDir, "src", "modules", "users");
    if (fs.existsSync(usersDir)) {
      fs.rmSync(usersDir, { recursive: true, force: true });
      console.log("✅ Module users đã xóa");

      // Cập nhật router.ts
      const routerPath = path.join(rootDir, "src", "router.ts");
      let routerContent = fs.readFileSync(routerPath, "utf-8");
      routerContent = routerContent
        .replace(/import userRoutes.*\n/, "")
        .replace(/router\.use\("\/users".*\n/, "");
      fs.writeFileSync(routerPath, routerContent, "utf-8");
      console.log("✅ router.ts đã cập nhật (xóa user routes)");
    }
  }

  // 5. Hỏi có reset git không
  const resetGit = await ask("🔄 Reset git history? (y/N): ");
  if (resetGit.toLowerCase() === "y") {
    try {
      execSync("git checkout --orphan temp_branch", { cwd: rootDir, stdio: "ignore" });
      execSync("git add -A", { cwd: rootDir, stdio: "ignore" });
      execSync(`git commit -m "Initial commit: ${projectName}"`, {
        cwd: rootDir,
        stdio: "ignore",
      });
      execSync("git branch -D main", { cwd: rootDir, stdio: "ignore" });
      execSync("git branch -m main", { cwd: rootDir, stdio: "ignore" });
      console.log("✅ Git history đã reset");
    } catch {
      console.log("⚠️  Không thể reset git. Có thể chưa có git repo.");
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🎉 Dự án "${projectName}" đã sẵn sàng!                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Bước tiếp theo:                                             ║
║    1. Cấu hình .env (DATABASE_URL, JWT_SECRET, ...)          ║
║    2. npm install                                            ║
║    3. npx prisma migrate dev                                 ║
║    4. npm run dev                                            ║
║                                                              ║
║  Tạo module mới:                                             ║
║    npm run gen:module -- product name:string price:number     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
}

main();
