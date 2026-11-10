// Copy knowledge/skills/* (the source of truth, in git, served by the MCP) into the local
// .cursor/skills and .claude/skills folders so Cursor and Claude Code pick them up as skills.
//   node scripts/sync-skills.mjs [workspace root, default ../..]
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../knowledge/skills");
const root = resolve(process.argv[2] || resolve(here, "../../.."));
for (const target of [".cursor/skills", ".claude/skills"]) {
  const dest = join(root, target);
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (!existsSync(join(src, name, "SKILL.md"))) continue;
    cpSync(join(src, name), join(dest, name), { recursive: true });
    console.log(`${target}/${name}`);
  }
}
