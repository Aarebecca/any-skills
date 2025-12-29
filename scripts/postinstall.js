'use strict';

const fs = require('fs');
const path = require('path');

function getInstallRoot() {
  const initCwd = process.env.INIT_CWD;
  if (initCwd) {
    return path.resolve(initCwd);
  }

  const npmPrefix = process.env.npm_config_local_prefix;
  if (npmPrefix) {
    return path.resolve(npmPrefix);
  }

  return process.cwd();
}

const rootDir = getInstallRoot();
const targetName = '.skills';
const configFileName = '.skillsrc';
const defaultLinkTargets = ['.claude/skills', '.codex/skills'];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureTarget(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  }

  const stat = fs.lstatSync(dirPath);
  if (stat.isSymbolicLink()) {
    return true;
  }

  if (!stat.isDirectory()) {
    console.error(`[any-skills] ${dirPath} exists and is not a directory.`);
    return false;
  }

  return true;
}

function getSymlinkType() {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

function resolveSymlinkTarget(linkPath) {
  const linkParent = path.dirname(linkPath);
  const currentTarget = fs.readlinkSync(linkPath);
  return path.resolve(linkParent, currentTarget);
}

function ensureSymlink(linkPath, targetPath) {
  const linkParent = path.dirname(linkPath);
  ensureDir(linkParent);

  const resolvedLinkPath = path.resolve(linkPath);
  const expectedTarget = path.resolve(targetPath);
  if (resolvedLinkPath === expectedTarget) {
    console.warn(`[any-skills] ${linkPath} resolves to the target; skipping.`);
    return false;
  }

  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const resolvedTarget = resolveSymlinkTarget(linkPath);
      if (resolvedTarget === expectedTarget) {
        return true;
      }
      fs.unlinkSync(linkPath);
    } else {
      console.warn(
        `[any-skills] ${linkPath} exists and is not a symlink; skipping.`
      );
      return false;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const relativeTarget = path.relative(linkParent, targetPath) || '.';
  fs.symlinkSync(relativeTarget, linkPath, getSymlinkType());
  return true;
}

function readSkillsConfig(configRoot) {
  const configPath = path.join(configRoot, configFileName);
  let rawConfig = null;

  try {
    rawConfig = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { config: null, configPath, exists: false, error: null };
    }
    throw err;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(rawConfig);
  } catch (err) {
    return { config: null, configPath, exists: true, error: err };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      config: null,
      configPath,
      exists: true,
      error: new Error('Config must be a JSON object.'),
    };
  }

  return { config: parsed, configPath, exists: true, error: null };
}

function resolveRootPath(value, baseDir) {
  return path.isAbsolute(value) ? value : path.join(baseDir, value);
}

function resolveTarget(config) {
  if (
    config &&
    typeof config.target === 'string' &&
    config.target.trim() !== ''
  ) {
    return resolveRootPath(config.target, rootDir);
  }

  return path.join(rootDir, targetName);
}

function normalizeLinkEntry(entry, target, configPath) {
  if (typeof entry === 'string') {
    return { link: entry, error: false };
  }

  if (entry && typeof entry === 'object') {
    const link = entry.link;
    if (typeof link !== 'string' || link.trim() === '') {
      console.warn(
        `[any-skills] Invalid link entry in ${configPath}; skipping.`
      );
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(entry, 'target')) {
      const targetValue = entry.target;
      if (typeof targetValue !== 'string' || targetValue.trim() === '') {
        console.error(
          `[any-skills] Invalid target for ${link} in ${configPath}.`
        );
        return { error: true };
      }

      const resolvedTarget = resolveRootPath(targetValue, rootDir);
      if (resolvedTarget !== target) {
        console.error(
          `[any-skills] Link entry in ${configPath} must not set a different target.`
        );
        return { error: true };
      }

      console.warn(
        `[any-skills] Ignoring redundant target for ${link} in ${configPath}.`
      );
    }

    return { link, error: false };
  }

  console.warn(
    `[any-skills] Unsupported link entry in ${configPath}; skipping.`
  );
  return null;
}

function getConfigEntries(config) {
  if (!config) {
    return null;
  }

  if (Array.isArray(config.links)) {
    return config.links;
  }

  if (Array.isArray(config.linkTargets)) {
    return config.linkTargets;
  }

  return null;
}

function buildLinkMappings({ config, configPath, exists, target }) {
  const entries = getConfigEntries(config);
  if (!entries) {
    if (exists) {
      console.warn(
        `[any-skills] No link configuration found in ${configPath}; using defaults.`
      );
    }
    return {
      mappings: defaultLinkTargets.map((linkTarget) => ({
        linkPath: resolveRootPath(linkTarget, rootDir),
        targetPath: target,
      })),
      error: false,
    };
  }

  if (entries.length === 0) {
    return { mappings: [], error: false };
  }

  const mappings = [];
  for (const entry of entries) {
    const normalized = normalizeLinkEntry(entry, target, configPath);
    if (!normalized) {
      continue;
    }
    if (normalized.error) {
      return { mappings: [], error: true };
    }
    mappings.push({
      linkPath: resolveRootPath(normalized.link, rootDir),
      targetPath: target,
    });
  }

  return { mappings, error: false };
}

function linkSkills() {
  const { config, configPath, exists, error } = readSkillsConfig(rootDir);
  if (error) {
    console.error(
      `[any-skills] Failed to parse ${configPath}: ${error.message}`
    );
    return 1;
  }

  const target = resolveTarget(config);
  if (!ensureTarget(target)) {
    return 1;
  }

  const { mappings, error: mappingError } = buildLinkMappings({
    config,
    configPath,
    exists,
    target,
  });
  if (mappingError) {
    return 1;
  }

  for (const mapping of mappings) {
    ensureSymlink(mapping.linkPath, mapping.targetPath);
  }

  return 0;
}

const exitCode = linkSkills();
if (exitCode) {
  process.exit(exitCode);
}
