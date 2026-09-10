'use strict';
/* ---------------------------------------------------------------------------
 * Template registry — install / update / uninstall / browse templates.
 *
 * Templates are installed into `<templatesRoot>/_registry/<name>` and each
 * entry is recorded in `<templatesRoot>/_registry/.registry.json`:
 *   { "<name>": { source, subdir, installedAt, commit, via: "git"|"zip" } }
 *
 * install source formats accepted:
 *   - "owner/repo"             clone whole repo (template is the repo root)
 *   - "owner/repo:subdir"      clone repo, use subdir as the template
 *   - "https://github.com/..." full git URL, optional "#subdir"
 *
 * Updates run `git pull --ff-only` on git-installed templates; zip installs
 * are re-downloaded. Zero third-party deps: prefers git when present, else
 * downloads the GitHub codeload zip and extracts with PowerShell Expand-Archive
 * (Windows) or the `unzip`/`tar` binaries.
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync, spawnSync } = require('child_process');

const REGISTRY_DIR = '_registry';
const REGISTRY_FILE = '.registry.json';

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

const hasGit = () => !!which('git');

function readRegistry(managedRoot) {
    const file = path.join(managedRoot, REGISTRY_FILE);
    const obj = (() => {
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
    })();
    return obj && typeof obj === 'object' ? obj : {};
}

function writeRegistry(managedRoot, data) {
    const file = path.join(managedRoot, REGISTRY_FILE);
    fs.mkdirSync(managedRoot, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/* Parse "owner/repo", "owner/repo:subdir", or a git URL (+ "#subdir"). */
function parseSource(input) {
    const s = String(input || '').trim();
    if (!s) return null;

    // git URL with optional "#subdir"
    const hash = s.lastIndexOf('#');
    let subdir = '';
    let src = s;
    if (hash !== -1) {
        src = s.slice(0, hash);
        subdir = s.slice(hash + 1).replace(/^\/+/, '');
    }

    // "owner/repo:subdir" shorthand
    const colon = src.lastIndexOf(':');
    if (colon !== -1 && /^[\w.-]+\/[\w.-]+/.test(src.slice(0, colon)) && !/^[a-zA-Z]:[\\/]/.test(src)) {
        const maybeUrl = src.slice(0, colon);
        const maybeSub = src.slice(colon + 1);
        // a real git URL has scheme:// or host pattern; "owner/repo" does not
        if (!/^https?:\/\//i.test(src)) {
            src = maybeUrl;
            subdir = maybeSub.replace(/^\/+/, '') || subdir;
        }
    }

    let kind = 'url';
    let url = src;
    if (/^[\w.-]+\/[\w.-]+$/.test(src)) {
        kind = 'short'; // owner/repo
        url = `https://github.com/${src}.git`;
    } else if (/^[\w.-]+@[\w.-]+:[\w./-]+$/i.test(src)) {
        kind = 'ssh'; // git@github.com:owner/repo.git
    }

    return { kind, url, subdir, name: (subdir ? subdir.split('/').pop() : '') || src.split('/').pop().replace(/\.git$/, '') || '' };
}

/* Extract a single directory (or the whole archive) to dest. On Windows uses
 * Expand-Archive; elsewhere prefers unzip → tar fallback. Returns the staging
 * dir where the extracted content now lives. */
function extractZip(zipPath, destDir, subdir) {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === 'win32') {
        const ps = [
            `$ErrorActionPreference='Stop'`,
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
        ].join('; ');
        execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true });
    } else {
        const unzip = which('unzip');
        if (unzip) {
            execFileSync(unzip, ['-q', '-o', zipPath, '-d', destDir]);
        } else {
            execFileSync('tar', ['-xf', zipPath, '-C', destDir]);
        }
    }
    return destDir;
}

/* The codeload zip contains a single top-level folder "<repo>-<branch>". */
function topLevelFolders(dir) {
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(dir, e.name));
}

function moveTemplate(srcDir, destDir) {
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
    fs.cpSync(srcDir, destDir, { recursive: true });
}

function downloadZip(url, outPath) {
    if (process.platform === 'win32') {
        const ps = [
            `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12`,
            `Invoke-WebRequest -UseBasicParsing -Uri '${url.replace(/'/g, "''")}' -OutFile '${outPath.replace(/'/g, "''")}'`
        ].join('; ');
        execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true });
    } else {
        execFileSync('curl', ['-L', '-o', outPath, url], { stdio: ['ignore', 'inherit', 'inherit'] });
    }
}

/* Install a template from a source string. Returns { ok, name, via, error? }. */
function installTemplate(managedRoot, source) {
    const parsed = parseSource(source);
    if (!parsed || !parsed.name) {
        return { ok: false, error: `无效的模板源: "${source}"。支持 "owner/repo"、"owner/repo:subdir" 或 git URL。` };
    }
    const name = parsed.name;
    const dest = path.join(managedRoot, name);
    const registry = readRegistry(managedRoot);

    if (registry[name]) {
        return { ok: false, error: `模板 "${name}" 已在注册表中，先卸载或更新。` };
    }

    try {
        fs.mkdirSync(managedRoot, { recursive: true });
        if (hasGit()) {
            // parsed.url is already the full git URL for kind=short;
            // for kind=url it's the raw URL; for kind=ssh it's the ssh URL.
            // Pass --config to disable any user url.insteadOf proxy rewriting
            // that would double-rewrite the URL (e.g. ghfast.top mirrors).
            const gitUrl = parsed.url;

            const tmp = path.join(managedRoot, `.tmp-${name}-${Date.now()}`);
            // Disable user's url.insteadOf proxy config to avoid double-rewriting
            const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
            execSync(`git clone --depth 1 ${JSON.stringify(gitUrl)} ${JSON.stringify(tmp)}`, { stdio: 'pipe', windowsHide: true, env });
            const commit = runOut(execSync, `git -C ${JSON.stringify(tmp)} rev-parse --short HEAD`);
            let srcDir = tmp;
            if (parsed.subdir) {
                srcDir = path.join(tmp, ...parsed.subdir.split('/'));
                if (!fs.existsSync(srcDir)) throw new Error(`子目录不存在: ${parsed.subdir}`);
            }
            moveTemplate(srcDir, dest);
            fs.rmSync(tmp, { recursive: true, force: true });

            registry[name] = { source, subdir: parsed.subdir || '', installedAt: new Date().toISOString(), commit, via: 'git' };
            writeRegistry(managedRoot, registry);
            return { ok: true, name, via: 'git', commit };
        }

        // ZIP fallback: codeload for github repos; raw zip URL otherwise
        // Extract owner/repo from original input to construct codeload URL directly
        // (not affected by git's url.insteadOf proxy config)
        let zipUrl = parsed.url;
        const ghMatch = parsed.url.match(/github\.com[\/:]([^\/\s]+)\/([^\/\s\.]+?)(?:\.git)?$/i);
        if (ghMatch) {
            const [, owner, repo] = ghMatch;
            zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`;
        }
        const tmp = path.join(managedRoot, `.tmp-${name}-${Date.now()}`);
        const zipPath = path.join(managedRoot, `.tmp-${name}.zip`);
        try {
            downloadZip(zipUrl, zipPath);
            extractZip(zipPath, tmp, parsed.subdir);
            fs.rmSync(zipPath, { force: true });

            let srcDir = tmp;
            const tops = topLevelFolders(tmp);
            if (tops.length === 1 && !parsed.subdir) srcDir = tops[0];
            if (parsed.subdir) srcDir = path.join(tmp, ...parsed.subdir.split('/'));
            if (!fs.existsSync(srcDir)) throw new Error(`解压后未找到模板内容: ${parsed.subdir || '(repo root)'}`);

            moveTemplate(srcDir, dest);
            fs.rmSync(tmp, { recursive: true, force: true });

            registry[name] = { source, subdir: parsed.subdir || '', installedAt: new Date().toISOString(), commit: null, via: 'zip' };
            writeRegistry(managedRoot, registry);
            return { ok: true, name, via: 'zip' };
        } catch (e) {
            fs.rmSync(tmp, { recursive: true, force: true });
            fs.rmSync(zipPath, { force: true });
            throw e;
        }
    } catch (e) {
        fs.rmSync(dest, { recursive: true, force: true });
        return { ok: false, error: (e && e.stderr ? String(e.stderr) : String(e && e.message || e)).slice(0, 500) };
    }
}

function runOut(fn, ...args) {
    return String(fn(...args)).trim();
}

/* git pull --ff-only for every git-managed template; returns per-name results. */
function updateTemplates(managedRoot) {
    const registry = readRegistry(managedRoot);
    const results = [];
    for (const [name, rec] of Object.entries(registry)) {
        const dir = path.join(managedRoot, name);
        if (!fs.existsSync(dir)) {
            results.push({ name, ok: false, error: '目录不存在' });
            continue;
        }
        if (rec.via !== 'git') {
            results.push({ name, ok: false, error: 'zip 安装（无 git 元数据），请重新安装以更新' });
            continue;
        }
        if (!hasGit()) {
            results.push({ name, ok: false, error: '未找到 git' });
            continue;
        }
        try {
            execSync(`git -C ${JSON.stringify(dir)} pull --ff-only`, { stdio: 'pipe', windowsHide: true });
            const commit = runOut(execSync, `git -C ${JSON.stringify(dir)} rev-parse --short HEAD`);
            if (rec.commit !== commit) {
                rec.commit = commit;
                results.push({ name, ok: true, updated: true, commit });
            } else {
                results.push({ name, ok: true, updated: false, commit });
            }
        } catch (e) {
            results.push({ name, ok: false, error: (e && e.stderr ? String(e.stderr) : String(e && e.message || e)).slice(0, 300) });
        }
    }
    writeRegistry(managedRoot, registry);
    return results;
}

/* Delete a template dir + its registry entry (does NOT touch the trash). */
function uninstallTemplate(managedRoot, name) {
    const registry = readRegistry(managedRoot);
    if (!registry[name]) return { ok: false, error: `模板 "${name}" 不在注册表中` };
    const dir = path.join(managedRoot, name);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    delete registry[name];
    writeRegistry(managedRoot, registry);
    return { ok: true, name };
}

function listInstalled(managedRoot) {
    const registry = readRegistry(managedRoot);
    return Object.entries(registry).map(([name, rec]) => {
        const dir = path.join(managedRoot, name);
        return {
            name,
            source: rec.source || '',
            via: rec.via || 'unknown',
            commit: rec.commit || null,
            installedAt: rec.installedAt || '',
            exists: fs.existsSync(dir)
        };
    });
}

module.exports = {
    REGISTRY_DIR,
    REGISTRY_FILE,
    hasGit,
    parseSource,
    installTemplate,
    updateTemplates,
    uninstallTemplate,
    listInstalled,
    readRegistry,
    writeRegistry
};