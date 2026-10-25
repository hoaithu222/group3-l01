#!/bin/sh
# Sinh lại client riêng của p4-05 từ prisma/schema.prisma hiện tại (tạm thời — xoá thư mục này cuối phiên).
cd "$(dirname "$0")/.." || exit 1
{ printf 'generator client {\n  provider = "prisma-client-js"\n  output   = "./client"\n}\n'; sed -n '5,$p' prisma/schema.prisma; } > .p405-prisma/schema.prisma
npx prisma generate --schema .p405-prisma/schema.prisma 2>&1 | tail -4
