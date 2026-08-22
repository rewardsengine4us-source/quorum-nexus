#!/usr/bin/env node
/**
 * Pre-push static checks for the Next.js App Router conventions that have
 * actually broken production builds on this project. This is not a
 * substitute for `next build` — it's a fast guard for the specific
 * mistakes that keep recurring:
 *
 *   1. Illegal exports from page.tsx / route.ts / layout.tsx
 *   2. Reading a property that isn't declared on a local interface
 *   3. Imports pointing at files that don't exist
 *   4. Unbalanced braces / parentheses
 *   5. Client-side hooks used without "use client"
 *
 * Run: node scripts/check.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
let problems = 0;

function fail(file, message) {
  console.log(`  FAIL  ${file}\n        ${message}`);
  problems++;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")),
               ...walk(path.join(ROOT, "components"))];

// --- 1. Illegal exports -------------------------------------------------
const PAGE_ALLOWED = new Set([
  "metadata", "generateMetadata", "generateStaticParams", "dynamic",
  "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion",
  "maxDuration", "viewport", "generateViewport",
]);
const ROUTE_ALLOWED = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
  "dynamic", "revalidate", "runtime", "maxDuration", "preferredRegion",
  "fetchCache", "dynamicParams",
]);

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const base = path.basename(file);
  const isPage = /^(page|layout|template|loading|error|not-found)\.tsx?$/.test(base);
  const isRoute = base === "route.ts" || base === "route.tsx";
  if (!isPage && !isRoute) continue;

  const src = fs.readFileSync(file, "utf8");
  const allowed = isRoute ? ROUTE_ALLOWED : PAGE_ALLOWED;

  const exportRe = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
  for (const m of src.matchAll(exportRe)) {
    const line = m[0];
    if (line.includes("export default")) continue;
    const name = m[1];
    if (!allowed.has(name)) {
      fail(rel, `"${name}" is not a valid ${isRoute ? "Route" : "Page"} export. ` +
                `Move it to lib/ and import it.`);
    }
  }
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const raw of m[1].split(",")) {
      const name = raw.split(/\s+as\s+/).pop().trim();
      if (name && name !== "default" && !allowed.has(name)) {
        fail(rel, `re-exported "${name}" is not a valid ${isRoute ? "Route" : "Page"} export.`);
      }
    }
  }
}

// Array and Object members that are never interface fields. Without this
// list, `adapters.find(...)` reads as "field `find` missing from Adapter".
const ARRAY_AND_BUILTIN = new Set([
  "map", "filter", "find", "findIndex", "some", "every", "reduce", "forEach",
  "sort", "slice", "splice", "concat", "join", "includes", "indexOf",
  "lastIndexOf", "flat", "flatMap", "reverse", "push", "pop", "shift",
  "unshift", "at", "keys", "values", "entries", "length",
  "toLocaleString", "toString", "valueOf", "hasOwnProperty",
]);

// --- 2. Local interface property access ---------------------------------
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");

  const interfaces = {};
  for (const m of src.matchAll(/(?:export\s+)?interface\s+([A-Za-z0-9_$]+)\s*\{([\s\S]*?)\n\}/g)) {
    interfaces[m[1]] = m[2]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
      .map((l) => l.split(/[?:]/)[0].trim())
      .filter(Boolean);
  }

  // Map "const [x] = useState<Type[]>" and ": Type" annotations to variables.
  const varTypes = {};
  for (const m of src.matchAll(/const\s+\[([A-Za-z0-9_$]+),\s*set[A-Za-z0-9_$]+\]\s*=\s*useState<([A-Za-z0-9_$]+)\[\]>/g)) {
    varTypes[m[1]] = m[2];
  }
  for (const m of src.matchAll(/const\s+\[([A-Za-z0-9_$]+),\s*set[A-Za-z0-9_$]+\]\s*=\s*useState<([A-Za-z0-9_$]+)\s*\|\s*null>/g)) {
    varTypes[m[1]] = m[2];
  }

  // For each array-typed state var, check `.map((item) => item.field)` usage.
  for (const [varName, typeName] of Object.entries(varTypes)) {
    const declared = interfaces[typeName];
    if (!declared) continue;
    const mapRe = new RegExp(varName + "\\.map\\(\\(?([A-Za-z0-9_$]+)", "g");
    for (const m of src.matchAll(mapRe)) {
      const item = m[1];
      const accessRe = new RegExp("\\b" + item + "\\.([A-Za-z0-9_$]+)", "g");
      for (const a of src.matchAll(accessRe)) {
        const prop = a[1];
        if (ARRAY_AND_BUILTIN.has(prop)) continue;
        if (!declared.includes(prop)) {
          fail(rel, `"${item}.${prop}" not declared on interface ${typeName} ` +
                    `(has: ${declared.join(", ")})`);
        }
      }
    }
    // Direct `varName.field` where varName is a single object (null-union case)
    const directRe = new RegExp("\\b" + varName + "\\.([A-Za-z0-9_$]+)", "g");
    for (const a of src.matchAll(directRe)) {
      const prop = a[1];
      if (ARRAY_AND_BUILTIN.has(prop)) continue;
      if (!declared.includes(prop)) {
        fail(rel, `"${varName}.${prop}" not declared on interface ${typeName} ` +
                  `(has: ${declared.join(", ")})`);
      }
    }
  }
}

// --- 3. Import resolution ------------------------------------------------
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
    const target = m[1].replace(/^@\//, "");
    const candidates = [
      target, target + ".ts", target + ".tsx",
      path.join(target, "index.ts"), path.join(target, "index.tsx"),
    ];
    if (!candidates.some((c) => fs.existsSync(path.join(ROOT, c)))) {
      fail(rel, `import "${m[1]}" does not resolve to a file`);
    }
  }
}

// --- 4. Balance + 5. "use client" ---------------------------------------
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");

  const counts = (re) => (src.match(re) || []).length;
  if (counts(/\{/g) !== counts(/\}/g)) fail(rel, "unbalanced braces");
  if (counts(/\(/g) !== counts(/\)/g)) fail(rel, "unbalanced parentheses");

  const usesHooks = /\buse(State|Effect|Memo|Callback|Ref|SearchParams|Router)\s*[(<]/.test(src);
  const isClient = /^["']use client["'];?/m.test(src);
  const isLib = rel.startsWith("lib" + path.sep);
  if (usesHooks && !isClient && !isLib) {
    fail(rel, `uses React hooks but is missing the "use client" directive`);
  }
}

console.log(
  problems === 0
    ? `\n✓ ${files.length} files checked, no problems found.`
    : `\n✗ ${problems} problem(s) found across ${files.length} files.`
);
process.exit(problems === 0 ? 0 : 1);
