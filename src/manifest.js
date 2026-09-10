'use strict';
/* ---------------------------------------------------------------------------
 * Manifest v2 — parse / normalize / validate / token-scan
 * Shared by extension.js (template discovery + project creation) and
 * template-doctor.js. Zero third-party deps (Node builtins only).
 *
 * v1 manifest (still supported, fully backward compatible):
 *   { label, description, icon, open, mcus, pythonEnv, replace }
 *
 * v2 additions:
 *   defaultName   string  prefill the project-name input box
 *   variables     [{ name, label, default, pattern, required }]
 *                         named prompts; each is asked once during creation
 *                         and interpolated as {{name}} tokens afterwards
 *   exclude       string[] paths/globs skipped while copying (e.g. "build/", "*.md")
 *   afterCreate   [{ command, args, cwd }] commands run in the project,
 *                         each confirmed by the user first
 *   sort          number  ordering weight in the wizard (smaller = first)
 *
 * Tokens interpolated recursively into text files after copying:
 *   <name>  / {{name}}          project name        (always available)
 *   <mcu>   / {{mcu}}           selected chip       (when template declares mcus)
 *   {{<variable name>}}         named v2 variables  (from the .wizard.json)
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');

const MANIFEST_FILE = '.wizard.json';

// file extensions we consider "text" when doing recursive token interpolation
const TEXT_EXT_RE = /\.(c|h|cpp|hpp|cc|txt|cfg|ld|ini|cmake|yml|yaml|json|md|s|asm|lds|ps1|code-workspace)$/i;

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return null;
    }
}

function readManifest(dir) {
    return readJsonSafe(path.join(dir, MANIFEST_FILE));
}

/* v1 "replace" entries look like     { files: [...], find: "x" }
 * v2 lets a single entry also carry a "to" override and an optional "token"
 * flag for recursive interpolation (default: replace <find> with the name). */
function normalizeReplace(raw) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    for (const r of raw) {
        if (!r || typeof r !== 'object' || typeof r.find !== 'string') continue;
        out.push({
            files: Array.isArray(r.files) ? r.files.filter((f) => typeof f === 'string') : [],
            find: r.find,
            to: typeof r.to === 'string' ? r.to : null
        });
    }
    return out;
}

function normalizeVariables(raw) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    for (const v of raw) {
        if (!v || typeof v.name !== 'string' || !v.name.trim()) continue;
        out.push({
            name: v.name.trim(),
            label: typeof v.label === 'string' && v.label ? v.label : v.name.trim(),
            default: typeof v.default === 'string' ? v.default : '',
            pattern: typeof v.pattern === 'string' && v.pattern ? v.pattern : '^.*$',
            required: v.required === true
        });
    }
    return out;
}

function normalizeExclude(raw) {
    // keep only non-empty strings; normalize leading "./" away
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((e) => typeof e === 'string' && e.trim())
        .map((e) => e.trim().replace(/^\.\//, ''))
        .map((e) => e.replace(/\\/g, '/'));
}

function normalizeAfterCreate(raw) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    for (const c of raw) {
        if (!c || typeof c.command !== 'string' || !c.command.trim()) continue;
        out.push({
            command: c.command.trim(),
            args: Array.isArray(c.args) ? c.args.map(String) : [],
            cwd: typeof c.cwd === 'string' ? c.cwd : '.'
        });
    }
    return out;
}

/* Normalize a raw manifest (or empty object) into a full, typed shape. */
function normalizeManifest(raw) {
    const m = raw && typeof raw === 'object' ? raw : {};
    return {
        label: typeof m.label === 'string' && m.label ? m.label : null,
        description: typeof m.description === 'string' ? m.description : '',
        icon: typeof m.icon === 'string' && m.icon ? m.icon : 'new-folder',
        open: m.open === 'workspace' ? 'workspace' : (m.open === 'folder' ? 'folder' : null),
        mcus: Array.isArray(m.mcus) ? m.mcus.filter((x) => typeof x === 'string') : [],
        pythonEnv: m.pythonEnv === true,
        replace: normalizeReplace(m.replace),
        defaultName: typeof m.defaultName === 'string' ? m.defaultName : '',
        variables: normalizeVariables(m.variables),
        exclude: normalizeExclude(m.exclude),
        afterCreate: normalizeAfterCreate(m.afterCreate),
        sort: typeof m.sort === 'number' ? m.sort : 0
    };
}

/* Convert a glob/path fragment into a RegExp. Supports:
 *   "build/"      -> matches "build" dir and everything under it
 *   "*.md"        -> matches any .md file at any depth
 *   "docs/**"     -> matches everything under docs/
 *   ".git/"       -> matches ".git" dir and its contents
 * a bare "*" spans a single path segment, "**" spans any depth. */
function globToRe(pattern) {
    let p = pattern.replace(/\\/g, '/');
    const matchDir = p.endsWith('/');
    if (matchDir) p = p.slice(0, -1);

    let re = '^';
    const parts = p.split('/');
    for (let i = 0; i < parts.length; i++) {
        if (i > 0) re += '/';
        const seg = parts[i];
        if (seg === '**') {
            re += '.*'; // matches zero+ segments including separators
        } else {
            re += seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
        }
    }
    if (matchDir) {
        re += '(?:/.*)?$'; // the directory itself OR anything under it
    } else {
        re += '$';
    }
    try {
        return new RegExp(re);
    } catch (e) {
        return null;
    }
}

/* Does a directory-entry RELATIVE path (posix, e.g. "build/out/foo.o") match
 * any exclude pattern? dirs are tested with a trailing slash so "build/" rules
 * can match the directory itself. */
function isExcluded(relPath, isDir, excludePatterns) {
    const test = relPath.replace(/\\/g, '/');
    for (const re of excludePatterns) {
        if (!re) continue;
        if (re.test(isDir ? test + '/' : test)) return true;
        if (re.test(test)) return true;
    }
    return false;
}

/* Recursively list files in a directory, returning relative posix paths of
 * every TEXT file (used by token scanning), respecting exclude patterns. */
function listTextFiles(dir, excludePatterns, base) {
    base = base || dir;
    const out = [];
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        return out;
    }
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const rel = path.relative(base, full).replace(/\\/g, '/');
        if (ent.isDirectory()) {
            if (isExcluded(rel, true, excludePatterns)) continue;
            out.push(...listTextFiles(full, excludePatterns, base));
        } else if (!isExcluded(rel, false, excludePatterns) && TEXT_EXT_RE.test(ent.name)) {
            out.push({ abs: full, rel });
        }
    }
    return out;
}

/* Validate a manifest, returning [{ level:'error'|'warn', message }]. */
function validateManifest(m) {
    const issues = [];
    const iconRe = /^[a-z0-9-]+$/i;
    if (m.icon && !iconRe.test(m.icon)) {
        issues.push({ level: 'warn', message: `icon "${m.icon}" 不是合法的 codicon 名称` });
    }
    if (m.open && m.open !== 'workspace' && m.open !== 'folder') {
        issues.push({ level: 'warn', message: `open "${m.open}" 需为 workspace 或 folder` });
    }
    for (const r of m.replace) {
        if (!r.files.length) {
            issues.push({ level: 'warn', message: `replace 项缺少 files: find="${r.find}"` });
        }
    }
    for (const c of m.afterCreate) {
        if (typeof c.command !== 'string' || !c.command) {
            issues.push({ level: 'warn', message: 'afterCreate 项缺少 command' });
        }
    }
    return issues;
}

/* Known non-token uses of <...> that should NOT be treated as placeholders:
 *   - EIDE's own <virtual_root> / <virtual_project> markers in eide.yml
 *   - HTML tags found inside doxygen/Doxygen-style comments in vendor HAL headers
 *   - C/C++ #include <header> angle-bracket includes */
const KNOWN_IGNORE_ANGLES = new Set([
    'virtual_root', 'virtual_project',
    // common HTML tags in ST/Atmel HAL doxygen comments
    'h1', 'h2', 'h3', 'h4', 'center', 'code', 'hr', 'b', 'i', 'em',
    'strong', 'pre', 'br', 'ul', 'ol', 'li', 'p', 'div', 'span',
    'table', 'td', 'tr', 'th', 'a', 'img'
]);

/* Scan the template's text files for {{token}} / <token> placeholders and
 * report which are NOT defined (neither builtin <name>/<mcu> nor a v2 variable).
 * Filters out false positives:
 *   - C/C++ #include <header> lines (header names contain dots, e.g. <stdint.h>)
 *   - HTML tags in doxygen comments (matched against KNOWN_IGNORE_ANGLES)
 *   - EIDE internal markers like <virtual_root> */
function scanTokens(tplDir, m) {
    const defined = new Set(['name', 'mcu']);
    for (const v of m.variables) defined.add(v.name);

    const exRe = [...m.exclude.map(globToRe).filter(Boolean)];
    const files = listTextFiles(tplDir, exRe);
    const tokenRe = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}|<([A-Za-z_][A-Za-z0-9_]*)>/g;

    const used = new Set();
    for (const f of files) {
        let txt;
        try {
            txt = fs.readFileSync(f.abs, 'utf8');
        } catch (e) {
            continue;
        }

        // Pre-process: strip #include <...> lines to avoid matching C/C++ headers
        let cleaned = txt.replace(/^\s*#\s*include\s*<[^>]+>/gm, '');

        let mm;
        while ((mm = tokenRe.exec(cleaned)) !== null) {
            const tok = mm[1] || mm[2];
            if (!tok) continue;
            // Skip <angle> tokens that are actually HTML tags or EIDE markers
            if (!mm[1] && KNOWN_IGNORE_ANGLES.has(tok)) continue;
            // Skip <angle> tokens that look like C headers (contain dots, e.g. stdint.h)
            if (!mm[1] && tok.includes('.')) continue;
            used.add(tok);
        }
    }

    const undefinedTokens = [...used].filter((t) => !defined.has(t));
    return { used: [...used], undefinedTokens };
}

module.exports = {
    MANIFEST_FILE,
    readJsonSafe,
    readManifest,
    normalizeManifest,
    normalizeReplace,
    normalizeVariables,
    normalizeExclude,
    normalizeAfterCreate,
    globToRe,
    isExcluded,
    listTextFiles,
    validateManifest,
    scanTokens,
    TEXT_EXT_RE
};