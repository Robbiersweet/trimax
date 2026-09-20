/* eslint-disable @typescript-eslint/no-require-imports -- Pinned, read-only production baseline, independent of dirty working files. */
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), ts = require('typescript');
module.exports = function (revision) {
    const commit = cp.execFileSync('git', ['rev-parse', '--verify', revision + '^{commit}'], { encoding: 'utf8' }).trim();
    const cache = new Map();
    function load(file) {
        if (cache.has(file))
            return cache.get(file).exports;
        const loaded = { exports: {} };
        cache.set(file, loaded);
        const relative = path.relative(process.cwd(), file).replaceAll('\\', '/');
        const source = cp.execFileSync('git', ['show', commit + ':' + relative], { encoding: 'utf8', maxBuffer: 8e6 });
        const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
        const localRequire = spec => {
            if (!spec.startsWith('.') && !spec.startsWith('@/'))
                return require(spec);
            const base = spec.startsWith('@/') ? path.resolve('src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
            return load([base, base + '.ts', base + '.tsx'].find(p => fs.existsSync(p)));
        };
        new Function('require', 'module', 'exports', js)(localRequire, loaded, loaded.exports);
        return loaded.exports;
    }
    return { commit, route: load(path.resolve('src/app/api/payments/extract-check-stub/route.ts')) };
};
