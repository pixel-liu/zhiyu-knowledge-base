const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("typescript");

module.exports = function loadTypeScript(relativePath, overrides = {}) {
  const cache = new Map();
  const { require: customRequire, ...globals } = overrides;
  function compile(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  cache.set(filename, compiledModule);
  const nativeRequire = createRequire(filename);
  const fallback = (name) => {
    const base = name.startsWith("./") || name.startsWith("../") ? path.resolve(path.dirname(filename), name) : name.startsWith("@/") ? path.resolve(__dirname, "..", name.slice(2)) : null;
    if (base) {
      const target = [base, base + ".ts", base + ".tsx"].find((entry) => /\.tsx?$/.test(entry) && fs.existsSync(entry));
      if (target) return compile(target);
    }
    return nativeRequire(name);
  };
  vm.runInNewContext(source, {
    module: compiledModule, exports: compiledModule.exports, require: customRequire ? (name) => customRequire(name, fallback) : fallback, process, console,
    URL, URLSearchParams, Intl, setTimeout, clearTimeout, crypto: require("node:crypto").webcrypto, ...globals,
  }, { filename });
  return compiledModule.exports;
  }
  return compile(path.resolve(__dirname, "..", relativePath));
};
