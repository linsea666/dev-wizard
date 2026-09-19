'use strict';
/* ---------------------------------------------------------------------------
 * Template doctor — per-template validation report.
 * Checks (per template):
 *   1. manifest presence + parseability
 *   2. manifest field types / invalid values (validateManifest)
 *   3. `replace[].files` reference files that exist in the template
 *   4. unused token definitions (variables never appear in any text file)
 *   5. undefined token usage ({{x}} / <x> with no builtin/variable backing)
 *   6. afterCreate commands resolvable on PATH (where/command -v)
 *   7. EIDE project config (.eide/eide.yml) structural sanity — a target block
 *      without `uploader` / `uploadConfigMap` makes EIDE throw
 *      "Cannot read properties of undefined (reading 'undefined')" on open
 *
 * Returns an array of report objects (one per template), each with a list of
 * { level: 'ok'|'warn'|'error', message } lines, ready to render in a QuickPick
 * or output channel.
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const mf = require('./manifest');

function which(cmd) {
    try {
        const out = execSync(
            process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`,
            { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
        );
        return out.toString().trim().split(/\r?\n/)[0] || null;
    } catch (e) {
        return null;
    }
}

function listTemplateDirs(root) {
    if (!root || !fs.existsSync(root)) return [];
    try {
        return fs.readdirSync(root, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => path.join(root, e.name));
    } catch (e) {
        return [];
    }
}

/* EIDE 加载工程时会执行（dist/extension.js 的 parse()）：
 *     target.toolchainConfig = target.toolchainConfigMap[target.toolchain];
 *     target.uploadConfig    = target.uploadConfigMap[target.uploader];
 * 一旦 `uploader` / `uploadConfigMap` 缺失，就是
 *     TypeError: Cannot read properties of undefined (reading 'undefined')
 * 整个工程打不开（EIDE 的 _OpenProject 会整个失败）。只做浅层结构扫描，
 * 不引 YAML 依赖：模板里这两个字段永远是 target 下 4 空格缩进的顶层键。
 */
const EIDE_UPLOADERS = [
    'JLink', 'STLink', 'stcgal', 'STVP', 'pyOCD', 'OpenOCD', 'probe-rs', 'Custom'
];

function scanEideTargets(text) {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((l) => /^targets:\s*$/.test(l));
    if (start < 0) return [];

    const targets = [];
    let cur = null;
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^\S/.test(line) && line.trim()) break;              // 出了 targets 块
        let mm = /^ {2}([^\s#][^:]*):/.exec(line);               // 目标名（2 空格）
        if (mm) {
            cur = { name: mm[1].trim(), keys: {}, indent: 2 };
            targets.push(cur);
            continue;
        }
        if (!cur) continue;
        mm = /^ {4}([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);       // 目标下的顶层键
        if (mm) cur.keys[mm[1]] = mm[2].trim();
    }
    return targets;
}

function checkEideConfig(dir) {
    const issues = [];
    const cfg = path.join(dir, '.eide', 'eide.yml');
    if (!fs.existsSync(cfg)) return issues;                      // 非 EIDE 工程，跳过

    let text;
    try {
        text = fs.readFileSync(cfg, 'utf8');
    } catch (e) {
        issues.push({ level: 'warn', message: `.eide/eide.yml 读不出来: ${e.message}` });
        return issues;
    }

    const targets = scanEideTargets(text);
    if (!targets.length) {
        issues.push({ level: 'warn', message: '.eide/eide.yml 里没解析到 targets.* 配置块' });
        return issues;
    }

    for (const t of targets) {
        const where = `targets.${t.name}`;
        if (!t.keys.toolchain) {
            issues.push({ level: 'error', message: `${where} 缺 toolchain（EIDE 无法确定工具链）` });
        }
        if (!('uploadConfigMap' in t.keys)) {
            issues.push({
                level: 'error',
                message: `${where} 缺 uploadConfigMap —— EIDE 打开工程时会抛 TypeError`
            });
        }
        if (!('uploader' in t.keys)) {
            issues.push({
                level: 'error',
                message: `${where} 缺 uploader —— EIDE 打开工程时会抛 TypeError`
            });
        } else if (!t.keys.uploader) {
            issues.push({ level: 'warn', message: `${where}.uploader 为空` });
        } else if (!EIDE_UPLOADERS.includes(t.keys.uploader)) {
            issues.push({
                level: 'error',
                message: `${where}.uploader="${t.keys.uploader}" 不是 EIDE 认的名字（会抛 Invalid uploader type）`
            });
        }
    }

    if (!issues.length) {
        issues.push({ level: 'ok', message: `EIDE 工程配置完整（${targets.length} 个配置：${targets.map((t) => t.name).join(', ')}，uploader=${targets.map((t) => t.keys.uploader).join(', ')}）` });
    }
    return issues;
}

/* Scan one template dir -> report object. */
function inspectTemplate(dir) {
    const name = path.basename(dir);
    const report = { name, dir, lines: [] };
    const add = (level, message) => report.lines.push({ level, message });

    const manifestPath = path.join(dir, mf.MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) {
        add('warn', `缺少 ${mf.MANIFEST_FILE}（可用，但无标签/图标/替换等自定义）`);
        add('ok', '以文件夹名作为模板 ID');
        return report;
    }

    const raw = mf.readManifest(dir);
    if (raw === null) {
        add('error', `${mf.MANIFEST_FILE} 不是合法 JSON`);
        return report;
    }
    const m = mf.normalizeManifest(raw);
    add('ok', `manifest 已解析（label="${m.label || name}"）`);

    // field-level validation
    for (const issue of mf.validateManifest(m)) {
        add(issue.level, issue.message);
    }

    // variables health
    if (m.variables.length) {
        const seen = new Set();
        for (const v of m.variables) {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.name)) {
                add('warn', `变量名 "${v.name}" 需符合 [A-Za-z_][A-Za-z0-9_]*`);
            }
            if (seen.has(v.name)) add('warn', `变量名 "${v.name}" 重复定义`);
            seen.add(v.name);
        }
    }

    // replace file references
    for (const r of m.replace) {
        for (const f of r.files) {
            const p = path.join(dir, f);
            if (!fs.existsSync(p)) {
                add('warn', `replace 引用的文件不存在: ${f}  (find="${r.find}")`);
            } else if ((r.find || '').length === 0) {
                add('warn', `replace 的 find 为空: ${f}`);
            }
        }
    }

    // exclude patterns well-formed
    const exRe = [];
    for (const e of m.exclude) {
        const re = mf.globToRe(e);
        if (re) exRe.push(re);
        else add('warn', `exclude 模式无法编译: ${e}`);
    }

    // token usage
    const scan = mf.scanTokens(dir, m);
    if (scan.undefinedTokens.length) {
        add('warn', `使用了未定义令牌: ${scan.undefinedTokens.map((t) => '{{' + t + '}}').join(', ')}`);
    }
    const varNames = new Set(m.variables.map((v) => v.name));
    const unusedVars = m.variables.filter((v) => !scan.used.includes(v.name));
    if (unusedVars.length) {
        add('warn', `定义了变量但模板文本中从未使用: ${unusedVars.map((v) => v.name).join(', ')}`);
    }

    // afterCreate command resolvable
    for (const c of m.afterCreate) {
        if (!which(c.command)) {
            add('warn', `afterCreate 命令不在 PATH: ${c.command}`);
        }
    }

    // EIDE project config sanity (templates without .eide/ are simply skipped)
    for (const issue of checkEideConfig(dir)) {
        add(issue.level, issue.message);
    }

    if (!report.lines.some((l) => l.level !== 'ok')) {
        add('ok', '未发现问题');
    }
    return report;
}

/* Inspect the whole templatesRoot (including the managed registry dir). */
function inspectAll(root) {
    const dirs = listTemplateDirs(root);
    return dirs.map(inspectTemplate);
}

module.exports = { inspectTemplate, inspectAll, listTemplateDirs, checkEideConfig };