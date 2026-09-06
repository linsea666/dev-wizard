const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKIP_KEY = 'devWizard.skipNext';
const LAST_KEY = 'devWizard.lastProject';
const MANIFEST_FILE = '.wizard.json';
const NAME_PLACEHOLDER = '<name>';

function cfg() {
    return vscode.workspace.getConfiguration('devWizard');
}

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return null;
    }
}

/* ---------------------------------------------------------------------------
 * Template discovery
 * Every subfolder of templatesRoot is a template.
 * Optional `.wizard.json` manifest:
 * {
 *   "label":       "新建 STC51 工程",          // shown in the list
 *   "description": "SDCC + EIDE ...",          // shown under the label
 *   "icon":        "chip",                     // any codicon name
 *   "open":        "workspace",                // "workspace" | "folder" (auto if omitted)
 *   "mcus":        ["STM32F103C8T6", ...],     // optional: second-level chip picker
 *   "pythonEnv":   true,                       // optional: ask for a conda env, bind it
 *                                              //   as python.defaultInterpreterPath
 *   "replace": [                               // text patches applied after copying
 *     { "files": ["CMakeLists.txt"], "find": "esp32-base" },
 *     { "files": [".eide/eide.yml"], "find": "<mcu>" }   // <mcu> filled by the picker
 *   ]
 * }
 * Automatic behaviour (no manifest needed):
 *  - `.eide/eide.json` gets its `.name` set to the project name (EIDE projects)
 *  - a `*.code-workspace` in the template root is renamed to <name>.code-workspace
 *    and opened instead of the folder
 * ------------------------------------------------------------------------- */
function listTemplates(root) {
    const out = [];
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
        return out;
    }
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const dir = path.join(root, ent.name);
        let files = [];
        try {
            files = fs.readdirSync(dir);
        } catch (e) {
            continue;
        }
        const mf = readJsonSafe(path.join(dir, MANIFEST_FILE)) || {};
        const hasWorkspace = files.some((f) => f.endsWith('.code-workspace'));
        out.push({
            id: ent.name,
            dir,
            label: mf.label || ent.name,
            description: mf.description || '',
            icon: mf.icon || 'new-folder',
            open: mf.open || (hasWorkspace ? 'workspace' : 'folder'),
            mcus: Array.isArray(mf.mcus) ? mf.mcus : [],
            pythonEnv: mf.pythonEnv === true,
            replace: Array.isArray(mf.replace) ? mf.replace : []
        });
    }
    return out;
}

function copyTemplate(tplDir, dest) {
    fs.cpSync(tplDir, dest, { recursive: true });
    const buildDir = path.join(dest, 'build');
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true, force: true });
    }
}

function patchEideName(dir, name) {
    // EIDE >= 3.27 uses .eide/eide.yml; older versions use .eide/eide.json
    const yml = path.join(dir, '.eide', 'eide.yml');
    if (fs.existsSync(yml)) {
        const txt = fs.readFileSync(yml, 'utf8');
        fs.writeFileSync(yml, txt.replace(/^(\s*)name:.*$/m, `$1name: ${name}`), 'utf8');
        return;
    }
    const json = path.join(dir, '.eide', 'eide.json');
    const obj = readJsonSafe(json);
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
        // tolerate missing/unreadable files listed in the manifest
    }
}

// Recursively fill a token (e.g. "<mcu>") in every text file of the project.
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
        if (/\.(c|h|cpp|hpp|cc|txt|cfg|ld|ini|cmake|yml|json|md|s|asm|lds)$/i.test(ent.name)) {
            replaceInFile(p, token, value);
        }
    }
}

async function openTarget(ctx, target) {
    ctx.globalState.update(SKIP_KEY, true);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), false);
}

/* ---------------------------------------------------------------------------
 * Python environments (v1.2): templates with `"pythonEnv": true` in their
 * .wizard.json let the wizard bind a conda env as the project interpreter.
 * Conda roots are discovered from (merged, de-duplicated):
 *   1. devWizard.condaRoot            (explicit override)
 *   2. python.condaPath               (set by setup.ps1 / the user)
 *   3. well-known install locations   (%USERPROFILE% / %LOCALAPPDATA% / ProgramData)
 * The chosen env is written to <project>/.vscode/settings.json as
 * python.defaultInterpreterPath; with no conda found the user-level default
 * interpreter is left untouched.
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
        const obj = readJsonSafe(file) || {};
        for (const [k, v] of Object.entries(patch)) obj[k] = v;
        fs.writeFileSync(file, JSON.stringify(obj, null, 4) + '\n', 'utf8');
        return true;
    } catch (e) {
        return false;
    }
}

/* Returns: {settings} = bind this env | null = skip gracefully |
 * undefined = picker cancelled (caller re-shows the wizard). */
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
        vscode.window.showInformationMessage(
            '未检测到 Anaconda/Miniconda，工程将使用默认解释器 / No conda found, keeping the default interpreter'
        );
        return null;
    }
    const items = envs.map((e) => ({
        label: `$(file-binary) ${e.name}`,
        description: e.python,
        settings: { 'python.defaultInterpreterPath': e.python }
    }));
    items.push({ label: '$(close) 不用 conda，用默认解释器 / Skip', skip: true });

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '这个工程用哪个 conda 环境？ / Pick a conda environment for this project',
        ignoreFocusOut: true,
        matchOnDescription: true
    });
    if (!pick) return undefined;
    if (pick.skip) return null;
    return pick.settings;
}

/* Create a project from a template. Returns true when "no choice was made"
 * (input cancelled, missing template...) so the wizard can re-show itself. */
async function createProject(tpl, ctx, mcu) {
    const name = await vscode.window.showInputBox({
        prompt: 'Project name? (letters / digits / _ / -)   请输入工程名称',
        placeHolder: 'e.g. led-demo',
        validateInput: (v) => {
            if (!v) return 'Name cannot be empty  名称不能为空';
            if (!/^[A-Za-z0-9_-]+$/.test(v)) return 'Only letters, digits, _ and -  只能使用字母数字下划线中划线';
            return null;
        }
    });
    if (!name) return true;

    // A5: let the user pick where the project lives (pre-filled from settings).
    const defaultRoot = cfg().get('projectsRoot') || cfg().get('templatesRoot') || '';
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '选择工程存放位置 / Select location',
        title: '工程放在哪？ Where to put the project?',
        defaultUri: defaultRoot ? vscode.Uri.file(defaultRoot) : undefined
    });
    if (!picked || !picked.length) return true; // cancelled -> re-show wizard
    const projectsRoot = picked[0].fsPath;

    // Python templates: ask which conda env to bind (before any file work)
    let pySettings = null;
    if (tpl.pythonEnv) {
        pySettings = await pickCondaEnv();
        if (pySettings === undefined) return true; // cancelled the sub-picker -> re-show wizard
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
            copyTemplate(tpl.dir, dest);

            // EIDE project: keep project name in sync (yml or json)
            if (fs.existsSync(path.join(dest, '.eide'))) {
                patchEideName(dest, name);
            }

            // rename shipped .code-workspace to <name>.code-workspace
            const files = fs.readdirSync(dest);
            const oldWs = files.find((f) => f.endsWith('.code-workspace'));
            if (oldWs) {
                fs.renameSync(path.join(dest, oldWs), path.join(dest, name + '.code-workspace'));
            }

            // manifest-driven text replacements
            for (const r of tpl.replace) {
                if (!r || !r.find) continue;
                for (const f of r.files || []) {
                    replaceInFile(path.join(dest, f), r.find, name);
                }
            }

            // A6: fill the chosen MCU into any "<mcu>" placeholder
            if (mcu) {
                replaceTokenRecursive(dest, '<mcu>', mcu);
            }

            // bind the picked conda env as the project interpreter
            if (pySettings && !writeVscodeSettings(dest, pySettings)) {
                vscode.window.showWarningMessage(
                    '写入 .vscode/settings.json 失败 / Failed to write .vscode/settings.json'
                );
            }

            const target =
                tpl.open === 'workspace' && fs.existsSync(path.join(dest, name + '.code-workspace'))
                    ? path.join(dest, name + '.code-workspace')
                    : dest;
            await openTarget(ctx, target);
        }
    );

    vscode.window.showInformationMessage(`✔ Project created: ${name}` + (mcu ? `  (MCU: ${mcu})` : ''));
    return false;
}

/* Show the wizard once. Returns true when dismissed without a real choice,
 * so the caller can re-show it (the wizard "stays" until a choice is made). */
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
        for (const t of templates) {
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
            description: `在设置 devWizard.templatesRoot 指向的目录下放模板文件夹 / put template folders into devWizard.templatesRoot`
        });
    }

    items.push({ kind: 'skip', label: "$(sign-out) 退下吧，我自己来 / I'll take it from here" });

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: '今天要做什么？ What are we doing today? （不选择会一直停留 / stays until you choose）',
        ignoreFocusOut: true,
        matchOnDescription: true
    });

    if (!pick || !pick.kind || pick.kind === 'sep') return true;
    if (pick.kind === 'skip') return false;
    if (pick.kind === 'notpl') return true;

    if (pick.kind === 'continue') {
        if (!last) {
            vscode.window.showInformationMessage('还没有历史工程记录 / No project history yet');
            return false;
        }
        const cur = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
        if (cur && cur.uri.fsPath.toLowerCase() === String(last).toLowerCase()) {
            vscode.window.showInformationMessage('当前已经在上次的工程里 / Already in the last project');
            return false;
        }
        await openTarget(ctx, last);
        return false;
    }

    // A6: second-level chip picker (only when the template declares mcus)
    let mcu = null;
    if (pick.kind === 'new' && pick.tpl.mcus.length) {
        const m = await vscode.window.showQuickPick(
            pick.tpl.mcus.map((x) => ({ label: x })),
            {
                placeHolder: `选择 ${pick.tpl.label} 的芯片型号 / Pick the chip`,
                ignoreFocusOut: true
            }
        );
        if (!m) return true; // cancelled the sub-picker -> re-show wizard
        mcu = m.label;
    }

    return await createProject(pick.tpl, ctx, mcu);
}

/* Wizard loop: re-show until the user makes a real choice. */
async function showWizard(ctx) {
    let templates = listTemplates(cfg().get('templatesRoot'));
    for (;;) {
        const dismissed = await showWizardOnce(ctx, templates);
        if (!dismissed) return;
        console.log('[dev-wizard] dismissed without choice, re-showing');
        await new Promise((r) => setTimeout(r, 800));
    }
}

/* A1: Environment Doctor — probe the toolchain/extensions/settings and show a
 * ✅/⚠/✗ tree. Pure extension code, no third-party deps. */
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

async function runDoctor(ctx) {
    const root = cfg().get('templatesRoot');
    const items = [];

    const mark = (ok) => (ok ? '$(pass)' : '$(error)');
    const add = (icon, label, detail) => items.push({ label: `${icon} ${label}`, detail });

    // VS Code host
    add('$(pass)', `VS Code  ${vscode.version}`, '编辑器运行正常');

    // Extensions
    const wantExt = [
        ['cl.eide', 'EIDE (嵌入式构建/烧录)'],
        ['marus25.cortex-debug', 'Cortex-Debug (ARM 调试)'],
        ['ms-vscode.cmake-tools', 'CMake Tools (C/C++ 构建)'],
        ['ms-python.python', 'Python']
    ];
    const have = vscode.extensions.all.map((e) => e.id);
    for (const [id, name] of wantExt) {
        const ok = have.includes(id);
        add(mark(ok), `扩展 ${name}`, ok ? `已安装 (${id})` : `未安装 (${id}) —— 运行 setup.ps1 可自动装上`);
    }

    // Toolchains on PATH
    const tools = [
        ['arm-none-eabi-gcc', 'ARM GCC (STM32)'],
        ['sdcc', 'SDCC (STC51)'],
        ['openocd', 'OpenOCD (调试器)'],
        ['python', 'Python'],
        ['stcgal', 'stcgal (STC 烧录)'],
        ['gcc', 'MinGW gcc (C/C++)'],
        ['g++', 'MinGW g++ (C++)'],
        ['cmake', 'CMake (C/C++)']
    ];
    for (const [c, name] of tools) {
        const p = whichCmd(c);
        add(mark(!!p), `工具链 ${name}`, p ? `在 PATH: ${p}` : `未在 PATH 找到 ${c} —— 运行 setup.ps1 或手动安装`);
    }

    // templatesRoot
    let tOk = false;
    let tDetail = '';
    if (!root) {
        tDetail = '未配置 devWizard.templatesRoot —— 在设置里填上你的模板目录';
    } else if (!fs.existsSync(root)) {
        tDetail = `目录不存在: ${root}`;
    } else {
        const ts = listTemplates(root);
        tOk = ts.length > 0;
        tDetail = tOk ? `找到 ${ts.length} 个模板` : '目录存在但为空，没发现模板子文件夹';
    }
    add(tOk ? '$(pass)' : '$(error)', '模板目录 templatesRoot', tDetail);

    // EIDE settings
    const eide = vscode.workspace.getConfiguration('EIDE');
    const armDir = eide.get('ARM.GCC.InstallDirectory');
    const sdccDir = eide.get('SDCC.InstallDirectory');
    add(armDir ? '$(pass)' : '$(warning)', 'EIDE ARM GCC 路径', armDir || '未设置（STM32 编译前需在 EIDE 设置里指向 ARM GCC）');
    add(sdccDir ? '$(pass)' : '$(warning)', 'EIDE SDCC 路径', sdccDir || '未设置（STC51 编译前需在 EIDE 设置里指向 SDCC）');

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Dev Wizard 环境体检 / Environment check（点击一项看详情；按 Esc 退出）',
        ignoreFocusOut: true,
        matchOnDescription: true
    });
}

function activate(ctx) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.show', () => showWizard(ctx))
    );
    ctx.subscriptions.push(
        vscode.commands.registerCommand('sea.devWizard.doctor', () => runDoctor(ctx))
    );

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) {
        ctx.globalState.update(LAST_KEY, folders[0].uri.fsPath);
    }

    if (cfg().get('showOnStartup', true) === false) {
        console.log('[dev-wizard] startup popup disabled by setting');
        return;
    }

    // don't re-pop right after the wizard itself opened a new project
    if (ctx.globalState.get(SKIP_KEY)) {
        console.log('[dev-wizard] skip-once flag set, skip this startup');
        ctx.globalState.update(SKIP_KEY, false);
        return;
    }

    setTimeout(() => showWizard(ctx), 2500);
}

function deactivate() {}

module.exports = { activate, deactivate };
