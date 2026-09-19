'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const mf = require('./src/manifest');
const registry = require('./src/registry');
const doc = require('./src/template-doctor');
const exp = require('./src/experience');

const SKIP_KEY = 'devWizard.skipNext';
const LAST_KEY = 'devWizard.lastProject';
const CREATED_KEY = 'devWizard.lastCreated';

function cfg() {
    return vscode.workspace.getConfiguration('devWizard');
}

/* ---------------------------------------------------------------------------
 * Template discovery (v2-compatible)
 * ------------------------------------------------------------------------- */
function listTemplates(root) {
    const out = [];
    if (!root || !fs.existsSync(root)) return out;
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
        return out;
    }
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        // skip the managed registry dir (it IS scanned, but separately)
        const dir = path.join(root, ent.name);
        let files = [];
        try {
            files = fs.readdirSync(dir);
        } catch (e) {
            continue;
        }
        const raw = mf.readManifest(dir);
        const m = mf.normalizeManifest(raw);
        const hasWorkspace = files.some((f) => f.endsWith('.code-workspace'));
        out.push({
            id: ent.name,
            dir,
            label: m.label || ent.name,
            description: m.description || '',
            icon: m.icon || 'new-folder',
            open: m.open || (hasWorkspace ? 'workspace' : 'folder'),
            mcus: m.mcus,
            pythonEnv: m.pythonEnv,
            replace: m.replace,
            defaultName: m.defaultName,
            variables: m.variables,
            exclude: m.exclude,
            afterCreate: m.afterCreate,
            sort: m.sort,
            group: m.group,
            pick: m.pick
        });
    }
    out.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    return out;
}

function copyTemplate(tpl, dest) {
    // v2: respect exclude patterns
    const exRe = (tpl.exclude || []).map(mf.globToRe).filter(Boolean);
    // default excludes (build/ is already hardcoded below, keep it)
    exRe.push(mf.globToRe('build/'));
    fs.mkdirSync(dest, { recursive: true });

    function copyDir(src, dst, relBase) {
        relBase = relBase || src;
        let entries = [];
        try {
            entries = fs.readdirSync(src, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const ent of entries) {
            const fullSrc = path.join(src, ent.name);
            const fullDst = path.join(dst, ent.name);
            const rel = path.relative(relBase, fullSrc).replace(/\\/g, '/');
            if (ent.isDirectory()) {
                if (mf.isExcluded(rel, true, exRe)) continue;
                fs.mkdirSync(fullDst, { recursive: true });
                copyDir(fullSrc, fullDst, relBase);
            } else {
                if (mf.isExcluded(rel, false, exRe)) continue;
                fs.copyFileSync(fullSrc, fullDst);
            }
        }
    }
    copyDir(tpl.dir, dest, tpl.dir);
}

function patchEideName(dir, name) {
    const yml = path.join(dir, '.eide', 'eide.yml');
    if (fs.existsSync(yml)) {
        const txt = fs.readFileSync(yml, 'utf8');
        fs.writeFileSync(yml, txt.replace(/^(\s*)name:.*$/m, `$1name: ${name}`), 'utf8');
        return;
    }
    const json = path.join(dir, '.eide', 'eide.json');
    const obj = mf.readJsonSafe(json);
    if (obj && typeof obj.name === 'string') {
        obj.name = name;
        fs.writeFileSync(json, JSON.stringify(obj, null, 2), 'utf8');
    }
}

function replaceInFile(file, from, to) {
    try {
        const txt = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, txt.split(from).join(to), 'utf8');
    } catch (e) {
        // tolerate missing/unreadable files
    }
}

function replaceTokenRecursive(dir, token, value) {
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        return;
    }
    for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            replaceTokenRecursive(p, token, value);
            continue;
        }
        if (mf.TEXT_EXT_RE.test(ent.name)) {
            replaceInFile(p, token, value);
        }
    }
}

async function openTarget(ctx, target) {
    ctx.globalState.update(SKIP_KEY, true);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), false);
}

/* ---------------------------------------------------------------------------
 * Conda env picker (unchanged from v1.2)
 * ------------------------------------------------------------------------- */
function condaRootFromCondaExe(p) {
    if (!p || typeof p !== 'string') return null;
    let dir = path.dirname(path.resolve(p.trim().replace(/^"|"$/g, '')));
    const base = path.basename(dir).toLowerCase();
    if (base === 'scripts' || base === 'condabin' || base === 'bin') dir = path.dirname(dir);
    return dir;
}

function findCondaRoots() {
    const roots = [];
    const push = (r) => {
        if (!r) return;
        r = path.normalize(String(r));
        try {
            if (!fs.statSync(r).isDirectory()) return;
        } catch (e) {
            return;
        }
        if (!roots.some((x) => x.toLowerCase() === r.toLowerCase())) roots.push(r);
    };
    push(cfg().get('condaRoot'));
    const pyConda = vscode.workspace.getConfiguration('python').inspect('condaPath');
    const pyCondaPath = pyConda
        ? pyConda.workspaceValue || pyConda.globalValue || pyConda.defaultValue
        : null;
    push(condaRootFromCondaExe(pyCondaPath));
    const homes = process.platform === 'win32'
        ? [process.env.USERPROFILE, process.env.LOCALAPPDATA, process.env.ProgramData]
        : [process.env.HOME];
    for (const home of homes) {
        if (!home) continue;
        for (const name of ['anaconda3', 'miniconda3']) push(path.join(home, name));
    }
    return roots;
}

function listCondaEnvs(root) {
    const out = [];
    const tryPy = (dir, name) => {
        for (const cand of [
            path.join(dir, 'python.exe'),
            path.join(dir, 'python3.exe'),
            path.join(dir, 'bin', 'python3'),
            path.join(dir, 'bin', 'python')
        ]) {
            if (fs.existsSync(cand)) {
                out.push({ name, python: cand });
                return;
            }
        }
    };
    tryPy(root, 'base');
    let entries = [];
    try {
        entries = fs.readdirSync(path.join(root, 'envs'), { withFileTypes: true });
    } catch (e) {
        entries = [];
    }
    for (const ent of entries) {
        if (ent.isDirectory()) tryPy(path.join(root, 'envs', ent.name), ent.name);
    }
    return out;
}

function writeVscodeSettings(dir, patch) {
    try {
        const vscDir = path.join(dir, '.vscode');
        fs.mkdirSync(vscDir, { recursive: true });
        const file = path.join(vscDir, 'settings.json');
        const obj = mf.readJsonSafe(file) || {};
        for (const [k, v] of Object.entries(patch)) obj[k] = v;
        fs.writeFileSync(file, JSON.stringify(obj, null, 4) + '\n', 'utf8');
        return true;
    } catch (e) {
        return false;
    }
}

async function pickCondaEnv() {
    const envs = [];
    for (const root of findCondaRoots()) {
        for (const env of listCondaEnvs(root)) {
            if (!envs.some((e) => e.python.toLowerCase() === env.python.toLowerCase())) {
                envs.push(env);
            }
        }
    }
    if (!envs.length) {
        vscode.window.showInformationMessage('未检测到 Anaconda/Miniconda，工程将使用默认解释器');
        return null;
    }
    const items = envs.map((e) => ({
        label: `$(file-binary) ${e.name}`,
        description: e.python,
        settings: { 'python.defaultInterpreterPath': e.python }
    }));
    items.push({ label: '$(close) 不用 conda，用默认解释器 / Skip', skip: true });
    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '这个工程用哪个 conda 环境？',
        ignoreFocusOut: true,
        matchOnDescription: true
    });
    if (!pick) return undefined;
    if (pick.skip) return null;
    return pick.settings;
}

/* ---------------------------------------------------------------------------
 * v2: ask variables (returns { name: value } or undefined on cancel)
 * ------------------------------------------------------------------------- */
async function askVariables(variables) {
    const values = {};
    for (const v of variables) {
        const re = (() => { try { return new RegExp(v.pattern); } catch (e) { return /^.*$/; } })();
        const val = await vscode.window.showInputBox({
            prompt: v.label,
            placeHolder: v.default || v.name,
            value: v.default,
            validateInput: (input) => {
                if (v.required && !input) return `${v.label} 不能为空`;
                if (input && !re.test(input)) return `格式不匹配: ${v.pattern}`;
                return null;
            }
        });
        if (val === undefined) return undefined; // cancelled
        values[v.name] = val || v.default;
    }
    return values;
}

/* ---------------------------------------------------------------------------
 * v2: afterCreate commands (each confirmed)
 * ------------------------------------------------------------------------- */
async function runAfterCreate(projectDir, commands) {
    if (!commands || !commands.length) return;
    const allowSetting = cfg().get('allowAfterCreate');
    if (allowSetting === 'deny') return;

    const out = vscode.window.createOutputChannel('Dev Wizard: afterCreate');
    out.clear();

    for (const c of commands) {
        const fullCmd = `${c.command} ${c.args.map((a) => JSON.stringify(a)).join(' ')}`;
        if (allowSetting !== 'allow') {
            const confirm = await vscode.window.showWarningMessage(
                `即将执行: ${fullCmd}\n工作目录: ${path.resolve(projectDir, c.cwd)}\n\n确认？`,
                { modal: true },
                '允许', '跳过'
            );
            if (confirm !== '允许') {
                out.appendLine(`[跳过] ${fullCmd}`);
                continue;
            }
        }
        out.appendLine(`[执行] ${fullCmd}`);
        out.show(true);

        await new Promise((resolve) => {
            const { spawn } = require('child_process');
            const cwd = path.resolve(projectDir, c.cwd || '.');
            const proc = spawn(c.command, c.args, { cwd, stdio: 'pipe', shell: true });
            proc.stdout.on('data', (d) => out.append(d.toString()));
            proc.stderr.on('data', (d) => out.append(d.toString()));
            proc.on('close', (code) => {
                out.appendLine(`[exit ${code}]`);
                resolve();
            });
            proc.on('error', (e) => {
                out.appendLine(`[error] ${e.message}`);
                resolve();
            });
        });
    }
}

/* ---------------------------------------------------------------------------
 * Create project (v2-aware)
 * ------------------------------------------------------------------------- */
async function createProject(tpl, ctx, mcu) {
    const name = await vscode.window.showInputBox({
        prompt: 'Project name? (letters / digits / _ / -)   请输入工程名称',
        placeHolder: tpl.defaultName || 'e.g. led-demo',
        value: tpl.defaultName || '',
        validateInput: (v) => {
            if (!v) return 'Name cannot be empty';
            if (!/^[A-Za-z0-9_-]+$/.test(v)) return 'Only letters, digits, _ and -';
            return null;
        }
    });
    if (!name) return true;

    // v2: ask variables
    let varValues = {};
    if (tpl.variables && tpl.variables.length) {
        varValues = await askVariables(tpl.variables);
        if (varValues === undefined) return true; // cancelled
    }

    const defaultRoot = cfg().get('projectsRoot') || cfg().get('templatesRoot') || '';
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '选择工程存放位置 / Select location',
        title: '工程放在哪？',
        defaultUri: defaultRoot ? vscode.Uri.file(defaultRoot) : undefined
    });
    if (!picked || !picked.length) return true;
    const projectsRoot = picked[0].fsPath;

    let pySettings = null;
    if (tpl.pythonEnv) {
        pySettings = await pickCondaEnv();
        if (pySettings === undefined) return true;
    }

    const dest = path.join(projectsRoot, name);

    if (!fs.existsSync(tpl.dir)) {
        vscode.window.showErrorMessage('Template not found: ' + tpl.dir);
        return true;
    }
    if (fs.existsSync(dest)) {
        vscode.window.showErrorMessage('Project already exists: ' + dest);
        return true;
    }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Creating project ${name} ...` },
        async () => {
            copyTemplate(tpl, dest);

            if (fs.existsSync(path.join(dest, '.eide'))) {
                patchEideName(dest, name);
            }

            const files = fs.readdirSync(dest);
            const oldWs = files.find((f) => f.endsWith('.code-workspace'));
            if (oldWs) {
                fs.renameSync(path.join(dest, oldWs), path.join(dest, name + '.code-workspace'));
            }

            // manifest-driven text replacements (v1 replace)
            for (const r of tpl.replace) {
                if (!r || !r.find) continue;
                for (const f of r.files || []) {
                    replaceInFile(path.join(dest, f), r.find, r.to || name);
                }
            }

            // <name> / {{name}} tokens
            replaceTokenRecursive(dest, '<name>', name);
            replaceTokenRecursive(dest, '{{name}}', name);

            // <mcu> / {{mcu}} tokens
            if (mcu) {
                replaceTokenRecursive(dest, '<mcu>', mcu);
                replaceTokenRecursive(dest, '{{mcu}}', mcu);
            }

            // v2 variable tokens
            for (const [k, v] of Object.entries(varValues)) {
                replaceTokenRecursive(dest, `{{${k}}}`, v);
            }

            if (pySettings && !writeVscodeSettings(dest, pySettings)) {
                vscode.window.showWarningMessage('写入 .vscode/settings.json 失败');
            }

            // generate context.md
            if (cfg().get('writeContextFile', true)) {
                exp.generateContextFile(dest, { mcu, board: varValues.board || '', contextHint: '' });
            }

            const target =
                tpl.open === 'workspace' && fs.existsSync(path.join(dest, name + '.code-workspace'))
                    ? path.join(dest, name + '.code-workspace')
                    : dest;
            // 记录给新窗口的 activate()：打开后弹带动作按钮的完成提示
            ctx.globalState.update(CREATED_KEY, { name, dir: dest });
            await openTarget(ctx, target);
        }
    );

    vscode.window.showInformationMessage(`✔ Project created: ${name}` + (mcu ? `  (MCU: ${mcu})` : ''));

    // v2: afterCreate
    await runAfterCreate(dest, tpl.afterCreate);

    // git init (optional)
    if (cfg().get('gitInitOnCreate', false)) {
        const gitConfirm = await vscode.window.showInformationMessage(
            '是否 git init 并提交初始版本？',
            '是', '否'
        );
        if (gitConfirm === '是') {
            const r = exp.gitInit(dest);
            if (r.ok) vscode.window.showInformationMessage('✔ git init + initial commit 完成');
            else vscode.window.showWarningMessage(`git init 失败: ${r.error}`);
        }
    }

    return false;
}

/* ---------------------------------------------------------------------------
 * Wizard UI
 * ------------------------------------------------------------------------- */
/* MCU 选择 + 创建（含二级芯片选择的模板共用这条路径） */
async function startCreate(ctx, tpl) {
    let mcu = null;
    if (tpl.mcus.length) {
        const m = await vscode.window.showQuickPick(
            tpl.mcus.map((x) => ({ label: x })),
            { placeHolder: `选择 ${tpl.label} 的芯片型号`, ignoreFocusOut: true }
        );
        if (!m) return true;
        mcu = m.label;
    }
    return await createProject(tpl, ctx, mcu);
}

/* 分组入口的展示名 —— 未知分组回退为分组 id 本身 */
const GROUP_LABELS = {
    embedded: { label: '$(chip) 嵌入式工程 / Embedded', desc: '51 / STM32 / ESP32 —— 点进去选芯片' },
    native: { label: '$(code) C / C++ 工程 / Desktop', desc: 'CMake 控制台工程 —— 点进去选 C 或 C++' }
};

async function showWizardOnce(ctx, templates) {
    const last = ctx.globalState.get(LAST_KEY);
    const items = [
        {
            kind: 'continue',
            label: '$(history) 继续上次的工作 / Continue last work',
            description: last || '（暂无记录 / no history yet）'
        }
    ];

    if (templates.length) {
        items.push({ kind: 'sep', label: '─'.repeat(24) + ' 开始新工程 / New project ' + '─'.repeat(24) });

        // 按 .wizard.json 的 group 字段折叠：同组一个入口（二级菜单选芯片），
        // 没有分组的模板照旧单列
        const grouped = new Map();
        const singles = [];
        for (const t of templates) {
            if (t.group) {
                if (!grouped.has(t.group)) grouped.set(t.group, []);
                grouped.get(t.group).push(t);
            } else {
                singles.push(t);
            }
        }
        for (const [gid, members] of grouped) {
            const gl = GROUP_LABELS[gid] || { label: `$(folder-library) ${gid}`, desc: '' };
            items.push({
                kind: 'group',
                gid,
                members,
                label: gl.label,
                description: gl.desc || `${members.length} 个模板 / ${members.length} templates`
            });
        }
        for (const t of singles) {
            items.push({
                kind: 'new',
                tpl: t,
                label: `$(${t.icon}) ${t.label}`,
                description: t.description
            });
        }
    } else {
        items.push({
            kind: 'notpl',
            label: '$(warning) 未找到模板 / No templates found',
            description: '在 devWizard.templatesRoot 目录下放模板文件夹，或用 installTemplate 安装'
        });
    }

    items.push({ kind: 'skip', label: "$(sign-out) 退下吧，我自己来 / I'll take it from here" });

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '今天要做什么？（Esc 收起，命令面板随时唤起）',
        ignoreFocusOut: true,
        matchOnDescription: true
    });

    if (pick === undefined) return 'esc'; // 主菜单按 Esc / 关闭：本次不再纠缠
    if (!pick.kind || pick.kind === 'sep') return true;
    if (pick.kind === 'skip') return false;
    if (pick.kind === 'notpl') return true;

    if (pick.kind === 'continue') {
        if (!last) {
            vscode.window.showInformationMessage('还没有历史工程记录');
            return false;
        }
        const cur = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
        if (cur && cur.uri.fsPath.toLowerCase() === String(last).toLowerCase()) {
            vscode.window.showInformationMessage('当前已经在上次的工程里');
            return false;
        }
        await openTarget(ctx, last);
        return false;
    }

    if (pick.kind === 'group') {
        // 二级菜单：芯片名写清楚（模板 .wizard.json 的 pick 字段）
        const memItems = pick.members.map((t) => ({
            kind: 'new',
            tpl: t,
            label: t.pick || t.label,
            description: t.pick ? t.label : t.description
        }));
        const mem = await vscode.window.showQuickPick(memItems, {
            placeHolder: `选择芯片型号 / Pick a chip —— ${pick.gid}`,
            ignoreFocusOut: true,
            matchOnDescription: true
        });
        if (!mem) return true; // Esc 返回主菜单
        return await startCreate(ctx, mem.tpl);
    }

    return await startCreate(ctx, pick.tpl);
}

async function showWizard(ctx) {
    let templates = listTemplates(cfg().get('templatesRoot'));
    for (;;) {
        const dismissed = await showWizardOnce(ctx, templates);
        if (dismissed === 'esc' && !cfg().get('persistOnEsc', false)) {
            vscode.window.showInformationMessage(
                '向导已收起 —— 命令面板运行 “Dev Wizard: what are we doing today?” 随时唤起'
            );
            return;
        }
        if (!dismissed) return;
        console.log('[dev-wizard] dismissed without choice, re-showing');
        await new Promise((r) => setTimeout(r, 800));
    }
}

/* ---------------------------------------------------------------------------
 * Environment Doctor (existing, unchanged)
 * ------------------------------------------------------------------------- */
function whichCmd(cmd) {
    try {
        const out = execSync(`where ${cmd}`, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        });
        return out.toString().trim().split(/\r?\n/)[0] || null;
    } catch (e) {
        return null;
    }
}

/* `sdcc -v` 把版本信息写在 stderr 上，两个流都读，并且不关心退出码。
 * 51 系列（STC51 / AT89S51）都靠它编译，所以体检里单独列一行版本。 */
function sdccVersion() {
    const p = whichCmd('sdcc');
    if (!p) return null;
    try {
        const r = spawnSync(p, ['-v'], { windowsHide: true, encoding: 'utf8' });
        const txt = `${(r && r.stdout) || ''}\n${(r && r.stderr) || ''}`;
        const m = txt.match(/SDCC\s*:\s*\S+\s+([\d.]+ #\d+)/);
        if (m) return m[1];
        const first = txt.split(/\r?\n/).find((l) => l.trim());
        return first ? first.trim().slice(0, 80) : null;
    } catch (e) {
        return null;
    }
}

/* 描述一个安装目录：在不在？里面有没有 bin\？ */
function dirDetail(p) {
    if (!p) return '未设置（对应工程会找不到编译器）';
    if (!fs.existsSync(p)) return `${p}（目录不存在）`;
    return fs.existsSync(path.join(p, 'bin')) ? p : `${p}（该目录下没有 bin\\）`;
}

async function runDoctor(ctx) {
    const root = cfg().get('templatesRoot');
    const items = [];
    const mark = (ok) => (ok ? '$(pass)' : '$(error)');
    const add = (icon, label, detail, act) => items.push({ label: `${icon} ${label}`, detail, act });

    add('$(pass)', `VS Code  ${vscode.version}`, '编辑器运行正常');

    const wantExt = [
        ['cl.eide', 'EIDE (嵌入式构建/烧录)'],
        ['marus25.cortex-debug', 'Cortex-Debug (ARM 调试)'],
        ['ms-vscode.cmake-tools', 'CMake Tools (C/C++ 构建)'],
        ['ms-python.python', 'Python'],
        ['ms-vscode.cpptools', 'C/C++ (F12 跳转定义 / 智能感知)']
    ];
    const have = vscode.extensions.all.map((e) => e.id);
    for (const [id, name] of wantExt) {
        const ok = have.includes(id);
        add(
            mark(ok),
            `扩展 ${name}`,
            ok ? `已安装 (${id})` : `未安装 (${id}) —— 点我打开扩展商店安装`,
            ok ? null : { type: 'openExt', id }
        );
    }

    // [命令, 名称, 是否可选] —— 可选工具缺失只提示，不算问题
    const tools = [
        ['arm-none-eabi-gcc', 'ARM GCC (STM32)', '', '由 setup.ps1 自动部署'],
        ['sdcc', 'SDCC (STC51 / AT89S51 编译)', '', '由 setup.ps1 自动部署'],
        ['packihx', 'packihx (SDCC 配套：ihx 转 hex)', '', '随 SDCC 一起安装'],
        ['openocd', 'OpenOCD (调试器)', '', '由 setup.ps1 自动部署'],
        ['python', 'Python', '', '由 setup.ps1 自动部署'],
        ['stcgal', 'stcgal (STC 烧录)', 'pip install stcgal', '由 setup.ps1 自动部署'],
        ['avrdude', 'avrdude (AT89S51 的 USBasp 下载)', '', '可选：只在烧录 AT89S51 时需要'],
        ['gcc', 'MinGW gcc (C/C++)', '', '由 setup.ps1 自动部署'],
        ['g++', 'MinGW g++ (C/C++)', '', '由 setup.ps1 自动部署'],
        ['cmake', 'CMake (C/C++)', '', '由 setup.ps1 自动部署']
    ];
    for (const [c, name, fixCmd, note] of tools) {
        const p = whichCmd(c);
        const optional = c === 'avrdude';
        const icon = p ? '$(pass)' : optional ? '$(warning)' : '$(error)';
        const detail = p ? `在 PATH: ${p}` : `未在 PATH 找到 ${c}（${note}）`;
        add(icon, `工具链 ${name}`, detail, !p && fixCmd ? { type: 'copy', text: fixCmd } : null);
    }

    const sdccVer = sdccVersion();
    add(mark(!!sdccVer), 'SDCC 版本', sdccVer || '未找到 sdcc —— 51 系列（STC51 / AT89S51）编译不了');

    // Keil C51（AT89S51 模板默认编译器，不用 PATH，找安装目录）
    const keilC51 = ['E:\\keilc51v957', 'C:\\Keil_v5', 'C:\\Keil']
        .map((d) => `${d}\\C51\\BIN\\C51.exe`)
        .find((p) => fs.existsSync(p));
    add(mark(!!keilC51), 'Keil C51 (AT89S51 默认编译器)',
        keilC51 || '未找到 Keil 安装目录 —— build-keil.ps1 用不了，SDCC/F7 仍可用');

    let tOk = false;
    let tDetail = '';
    if (!root) {
        tDetail = '未配置 devWizard.templatesRoot';
    } else if (!fs.existsSync(root)) {
        tDetail = `目录不存在: ${root}`;
    } else {
        const ts = listTemplates(root);
        tOk = ts.length > 0;
        tDetail = tOk ? `找到 ${ts.length} 个模板` : '目录存在但为空';
    }
    add(tOk ? '$(pass)' : '$(error)', '模板目录 templatesRoot', tDetail);

    const eide = vscode.workspace.getConfiguration('EIDE');
    const armDir = eide.get('ARM.GCC.InstallDirectory');
    const sdccDir = eide.get('SDCC.InstallDirectory');
    add(armDir ? '$(pass)' : '$(warning)', 'EIDE ARM GCC 路径', dirDetail(armDir));
    add(sdccDir ? '$(pass)' : '$(warning)', 'EIDE SDCC 路径', dirDetail(sdccDir));

    const passN = items.filter((i) => i.label.startsWith('$(pass)')).length;
    const errN = items.filter((i) => i.label.startsWith('$(error)')).length;
    const summary = errN
        ? `环境体检：${passN}/${items.length} 通过，${errN} 项待修（点条目执行修复，Esc 退出）`
        : `环境体检：${passN}/${items.length} 全部通过 ✓（Esc 退出）`;

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: summary,
        ignoreFocusOut: true,
        matchOnDescription: true
    });

    if (!pick) return; // Esc 退出
    if (pick.act) {
        if (pick.act.type === 'openExt') {
            await vscode.commands.executeCommand('extension.open', pick.act.id);
        } else if (pick.act.type === 'copy') {
            await vscode.env.clipboard.writeText(pick.act.text);
            vscode.window.showInformationMessage(`已复制到剪贴板: ${pick.act.text}`);
        }
    }
    return runDoctor(ctx); // 处理完再刷一轮，Esc 退出
}

/* ---------------------------------------------------------------------------
 * Template Doctor (new)
 * ------------------------------------------------------------------------- */
async function runTemplateDoctor() {
    const root = cfg().get('templatesRoot');
    if (!root || !fs.existsSync(root)) {
        vscode.window.showErrorMessage('templatesRoot 未配置或不存在');
        return;
    }

    const reports = doc.inspectAll(root);
    const items = [];
    for (const r of reports) {
        const errs = r.lines.filter((l) => l.level === 'error').length;
        const warns = r.lines.filter((l) => l.level === 'warn').length;
        const icon = errs ? '$(error)' : warns ? '$(warning)' : '$(pass)';
        items.push({
            label: `${icon} ${r.name}`,
            description: `${errs} error(s), ${warns} warning(s)`,
            detail: r.lines.map((l) => `  [${l.level}] ${l.message}`).join('\n'),
            report: r
        });
    }

    if (!items.length) {
        vscode.window.showInformationMessage('模板目录为空');
        return;
    }

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '模板体检报告（点击查看详情）',
        ignoreFocusOut: true,
        matchOnDescription: true
    });

    if (pick && pick.report) {
        const out = vscode.window.createOutputChannel('Dev Wizard: Template Doctor');
        out.clear();
        out.appendLine(`=== ${pick.report.name} ===`);
        out.appendLine(`目录: ${pick.report.dir}`);
        out.appendLine('');
        for (const l of pick.report.lines) {
            out.appendLine(`[${l.level}] ${l.message}`);
        }
        out.show();
    }
}

/* ---------------------------------------------------------------------------
 * Registry commands (new)
 * ------------------------------------------------------------------------- */
function getManagedRoot() {
    const root = cfg().get('templatesRoot');
    if (!root) {
        vscode.window.showErrorMessage('请先配置 devWizard.templatesRoot');
        return null;
    }
    return path.join(root, registry.REGISTRY_DIR);
}

async function installTemplateCmd() {
    const source = await vscode.window.showInputBox({
        prompt: '模板源（owner/repo、owner/repo:subdir 或 git URL）',
        placeHolder: 'e.g. linsea666/dev-wizard:templates/esp32-base'
    });
    if (!source) return;

    const managedRoot = getManagedRoot();
    if (!managedRoot) return;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Installing template from ${source}...` },
        async () => {
            const result = registry.installTemplate(managedRoot, source);
            if (result.ok) {
                vscode.window.showInformationMessage(`✔ 模板安装成功: ${result.name} (via ${result.via})`);
            } else {
                vscode.window.showErrorMessage(`安装失败: ${result.error}`);
            }
        }
    );
}

async function updateTemplatesCmd() {
    const managedRoot = getManagedRoot();
    if (!managedRoot) return;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Updating templates...' },
        async () => {
            const results = registry.updateTemplates(managedRoot);
            if (!results.length) {
                vscode.window.showInformationMessage('注册表中无模板');
                return;
            }
            const updated = results.filter((r) => r.updated);
            const failed = results.filter((r) => !r.ok);
            const msg = updated.length
                ? `✔ ${updated.length} 个模板已更新`
                : '所有模板已是最新';
            vscode.window.showInformationMessage(msg + (failed.length ? ` (${failed.length} 失败)` : ''));
        }
    );
}

async function uninstallTemplateCmd() {
    const managedRoot = getManagedRoot();
    if (!managedRoot) return;

    const installed = registry.listInstalled(managedRoot);
    if (!installed.length) {
        vscode.window.showInformationMessage('注册表中无已安装模板');
        return;
    }

    const items = installed.map((i) => ({
        label: `$(trash) ${i.name}`,
        description: `${i.via} · ${i.commit || 'no commit'} · ${i.installedAt.slice(0, 10)}`,
        name: i.name
    }));

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要卸载的模板',
        ignoreFocusOut: true
    });
    if (!pick) return;

    const confirm = await vscode.window.showWarningMessage(
        `确认卸载模板 "${pick.name}"？（将删除模板目录）`,
        { modal: true },
        '卸载'
    );
    if (confirm !== '卸载') return;

    const result = registry.uninstallTemplate(managedRoot, pick.name);
    if (result.ok) {
        vscode.window.showInformationMessage(`✔ 模板已卸载: ${result.name}`);
    } else {
        vscode.window.showErrorMessage(`卸载失败: ${result.error}`);
    }
}

function browseTemplatesCmd() {
    vscode.env.openExternal(vscode.Uri.parse('https://github.com/search?q=topic%3Adev-wizard-template&type=repositories'));
}

/* ---------------------------------------------------------------------------
 * Experience commands (new)
 * ------------------------------------------------------------------------- */
function getProjectDir(opts) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || !folders.length) {
        if (!opts || !opts.silent) vscode.window.showErrorMessage('请先打开一个工程文件夹');
        return null;
    }
    return folders[0].uri.fsPath;
}

async function writeContextCmd() {
    const projectDir = getProjectDir();
    if (!projectDir) return;

    const mcu = await vscode.window.showInputBox({
        prompt: 'MCU 型号（可选，留空跳过）',
        placeHolder: 'e.g. STM32F103C8T6'
    });

    const ctxFile = exp.generateContextFile(projectDir, { mcu: mcu || '' });
    vscode.window.showInformationMessage(`✔ 已生成 ${path.relative(projectDir, ctxFile)}`);
}

const COMMON_MCUS = ['STC89C52RC', 'STC15F104W', 'STM32F103C8T6', 'AT89S51', 'AT89S52', 'ESP32'];

async function pickMcu() {
    const items = COMMON_MCUS.map((m) => ({ label: m }));
    items.push({ label: '$(edit) 其他型号（手动输入）', manual: true });
    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '工程里没写芯片型号——选一个，或手动输入',
        ignoreFocusOut: true
    });
    if (!pick) return null;
    if (pick.manual) {
        const v = await vscode.window.showInputBox({ prompt: 'MCU 型号', placeHolder: 'e.g. STM32F407VGT6' });
        return v || null;
    }
    return pick.label;
}

async function flashCmd(ctx) {
    const projectDir = getProjectDir();
    if (!projectDir) return;
    const pt = exp.detectProjectType(projectDir);
    const stcOpts = exp.readEideFlashOptions(projectDir); // 模板自带的 .eide/stc.flash.json
    let mcu = exp.detectMcu(projectDir);
    let protocol = stcOpts ? stcOpts.device : '';

    // EIDE 工程 + 非内置烧录器（如 at89s51 的 Custom/avrdude）：配置里有 EIDE 变量，
    // 这里展开不了——引导用户用 EIDE 自己的 Flash 按钮
    if (pt.type === 'eide' && !protocol) {
        const yml = (() => {
            try {
                return fs.readFileSync(path.join(projectDir, '.eide', 'eide.yml'), 'utf8');
            } catch (e) {
                return '';
            }
        })();
        const up = yml.match(/^[ \t]*uploader:[ \t]*(\S+)/m);
        if (up && up[1] !== 'stcgal') {
            vscode.window.showInformationMessage(
                '这个工程在 EIDE 里配了自定义烧录器——请点 EIDE 面板的 Flash 按钮（那里会展开模板的烧录配置）'
            );
            return;
        }
    }

    if (!mcu && !protocol) {
        mcu = await pickMcu();
        if (!mcu) return;
    }
    if (protocol && !mcu) mcu = protocol.toUpperCase(); // 仅用于展示

    // STC 子系列协议：stc.flash.json > 芯片前缀 > 用户手选
    if (protocol || /^STC/i.test(mcu)) {
        if (!protocol) protocol = exp.stcProtocolFromMcu(mcu);
        if (!protocol) {
            const p = await vscode.window.showQuickPick(
                ['stc89', 'stc15', 'stc15a', 'stc12a', 'stc12b', 'stc12x', 'stc8', 'stc8d', 'stc8g', 'stc8h', 'stc16', 'stc32']
                    .map((x) => ({ label: x })),
                { placeHolder: 'STC 子系列协议（stcgal -P）——不确定就选芯片手册标注的系列', ignoreFocusOut: true }
            );
            if (!p) return;
            protocol = p.label;
        }
    }

    let serialPort = '';
    if (protocol || /^STC/i.test(mcu)) {
        const ports = exp.detectSerialPorts();
        if (!ports.length) {
            vscode.window.showErrorMessage('没检测到串口设备——插好 USB 转串口线（装好驱动）再试');
            return;
        }
        const last = ctx.workspaceState.get('devWizard.lastSerialPort', '');
        const items = ports.map((p) => ({
            label: p.port === last ? `$(check) ${p.port}` : p.port,
            description: p.description + (p.port === last ? '（上次使用）' : ''),
            port: p.port
        }));
        if (last) items.sort((a, b) => (b.port === last) - (a.port === last));
        const pick = await vscode.window.showQuickPick(items, {
            placeHolder: '选择串口（STC 烧录用）',
            ignoreFocusOut: true
        });
        if (!pick) return;
        serialPort = pick.port;
        ctx.workspaceState.update('devWizard.lastSerialPort', serialPort);
    }

    await exp.executeFlash(projectDir, {
        mcu,
        serialPort,
        protocol,
        baud: stcOpts ? stcOpts.baudrate : '',
        oscFreq: stcOpts ? stcOpts.oscFreq : ''
    });
}

async function gitInitCmd() {
    const projectDir = getProjectDir();
    if (!projectDir) return;

    const confirm = await vscode.window.showWarningMessage(
        '将在当前目录执行 git init + initial commit，确认？',
        { modal: true },
        '确认'
    );
    if (confirm !== '确认') return;

    const result = exp.gitInit(projectDir);
    if (result.ok) {
        vscode.window.showInformationMessage('✔ git init + initial commit 完成');
    } else {
        vscode.window.showErrorMessage(`git init 失败: ${result.error}`);
    }
}

/* ---------------------------------------------------------------------------
 * Status bar: project type + build button
 * ------------------------------------------------------------------------- */
let statusBar = null;

function updateStatusBar() {
    if (!statusBar) return;
    const projectDir = getProjectDir({ silent: true });
    if (!projectDir) {
        statusBar.hide();
        return;
    }
    const pt = exp.detectProjectType(projectDir);
    const mcu = exp.detectMcu(projectDir);
    statusBar.text = `$(tools) ${pt.type.toUpperCase()}` + (mcu ? ` · ${mcu}` : '');
    statusBar.tooltip = pt.detail + '\n点击：构建 / 烧录 / 体检';
    statusBar.command = 'sea.devWizard.menu';
    statusBar.show();
}

/* 状态栏点击后的快捷菜单 */
async function statusBarMenu() {
    const items = [
        { label: '$(zap) 构建 / Build', cmd: 'sea.devWizard.build' },
        { label: '$(rocket) 烧录 / Flash', cmd: 'sea.devWizard.flash' },
        { label: '$(pulse) 环境体检 / Doctor', cmd: 'sea.devWizard.doctor' },
        { label: '$(file-text) 生成 context.md', cmd: 'sea.devWizard.writeContext' },
        { label: '$(git-branch) git init + 首次提交', cmd: 'sea.devWizard.gitInit' }
    ];
    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Dev Wizard 快捷操作',
        ignoreFocusOut: true
    });
    if (pick) await vscode.commands.executeCommand(pick.cmd);
}

async function buildCmd() {
    const projectDir = getProjectDir();
    if (!projectDir) return;
    const pt = exp.detectProjectType(projectDir);

    const cmds = {
        eide: null, // EIDE handles its own
        cmake: 'cmake --build build',
        makefile: 'make',
        platformio: 'pio run'
    };

    if (pt.type === 'eide') {
        await vscode.commands.executeCommand('eide.project.build');
        return;
    }

    const cmd = cmds[pt.type];
    if (!cmd) {
        vscode.window.showErrorMessage('未识别的工程类型，无法构建');
        return;
    }

    const terminal = vscode.window.createTerminal('Dev Wizard Build');
    terminal.sendText(`cd ${JSON.stringify(projectDir)} && ${cmd}`);
    terminal.show();
}

/* ---------------------------------------------------------------------------
 * activate
 * ------------------------------------------------------------------------- */
function activate(ctx) {
    // existing commands
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.show', () => showWizard(ctx))
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.doctor', () => runDoctor(ctx))
    );

    // new: template doctor
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.templateDoctor', () => runTemplateDoctor())
    );

    // new: registry commands
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.installTemplate', () => installTemplateCmd())
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.updateTemplates', () => updateTemplatesCmd())
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.uninstallTemplate', () => uninstallTemplateCmd())
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.browseTemplates', () => browseTemplatesCmd())
    );

    // new: experience commands
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.writeContext', () => writeContextCmd())
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.flash', () => flashCmd(ctx))
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.gitInit', () => gitInitCmd())
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.build', () => buildCmd())
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.menu', () => statusBarMenu())
    );

    // status bar
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    ctx.subscriptions.push(statusBar);
    updateStatusBar();

    // re-detect when workspace changes
    ctx.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => updateStatusBar())
    );

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) {
        ctx.globalState.update(LAST_KEY, folders[0].uri.fsPath);
    }

    if (cfg().get('showOnStartup', true) === false) {
        console.log('[dev-wizard] startup popup disabled by setting');
        return;
    }

    if (ctx.globalState.get(SKIP_KEY)) {
        console.log('[dev-wizard] skip-once flag set, skip this startup');
        ctx.globalState.update(SKIP_KEY, false);
        // 刚由向导建完工程跳转过来：弹带动作按钮的完成提示
        const lc = ctx.globalState.get(CREATED_KEY);
        if (lc && fs.existsSync(lc.dir)) {
            ctx.globalState.update(CREATED_KEY, undefined);
            const btns = [];
            if (fs.existsSync(path.join(lc.dir, 'README.md'))) btns.push('打开 README');
            btns.push('立即构建');
            vscode.window.showInformationMessage(`✔ 工程已创建: ${lc.name}`, ...btns).then((sel) => {
                if (sel === '打开 README') {
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(lc.dir, 'README.md')));
                } else if (sel === '立即构建') {
                    vscode.commands.executeCommand('sea.devWizard.build');
                }
            });
        }
        return;
    }

    setTimeout(() => showWizard(ctx), 2500);
}

function deactivate() {}

module.exports = { activate, deactivate };