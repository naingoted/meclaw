#!/usr/bin/env node
// Merge each workspace package's Istanbul coverage-final.json into a single
// root coverage/coverage-final.json for `fallow health --coverage`.
//
// Each package writes ./coverage/coverage-final.json (vitest istanbul provider,
// see the per-package vitest.config.ts). Istanbul maps are keyed by ABSOLUTE
// file path, so packages never collide and a shallow merge is correct. Run
// after `turbo run test -- --coverage` (the root `coverage` script does both).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgGlobs = ["apps/admin", "apps/chat", "packages/core", "packages/rag", "packages/ui"];

const merged = {};
let found = 0;

for (const pkg of pkgGlobs) {
  const file = join(root, pkg, "coverage", "coverage-final.json");
  if (!existsSync(file)) {
    console.warn(`merge-coverage: no coverage for ${pkg} (skipped)`);
    continue;
  }
  const map = JSON.parse(readFileSync(file, "utf8"));
  Object.assign(merged, map);
  found += 1;
}

if (found === 0) {
  console.error(
    "merge-coverage: no package coverage found. Run `pnpm coverage` (turbo test -- --coverage).",
  );
  process.exit(1);
}

const outDir = join(root, "coverage");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "coverage-final.json");
writeFileSync(out, JSON.stringify(merged));
console.log(
  `merge-coverage: merged ${found} packages, ${Object.keys(merged).length} files -> coverage/coverage-final.json`,
);
