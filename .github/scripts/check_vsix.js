#!/usr/bin/env node
// Check that a packaged .vsix carries everything the extension loads.
//
// VS Code runs an installed extension from the unpacked .vsix and from
// nothing else, so a module missing from the package is a `Cannot find
// module` at activation: the writer sees an extension that does nothing. That
// is not hypothetical. The release this repository was split out of packaged
// with `vsce package --no-dependencies`, which leaves `node_modules/` out
// entirely, and its .vsix shipped `out/extension.js` without the
// `vscode-languageclient` that file requires on its first line.
//
// What "everything it loads" means is read from this checkout, not listed
// here, so it cannot drift from the code:
//
//   * `main` from package.json;
//   * an `out/<name>.js` for every `src/<name>.ts` -- `main` requires its
//     siblings (`./templates`), and tsconfig.json maps src/ onto out/;
//   * every package package-lock.json installs for production (anything not
//     marked `dev` or `optional`): `vscode-languageclient` and its tree.
//
// It reads the zip's own directory rather than asking vsce what it would
// package, because the file that is attested and published is the thing
// being checked.
//
// Usage, from the repository root:
//
//   node .github/scripts/check_vsix.js <extension.vsix>
//
// Prints what the package contains, then exits non-zero listing every
// missing entry.
'use strict';

const fs = require('fs');
const path = require('path');

/** The entry names in a zip's central directory. A .vsix is a zip. */
function zipEntries(buf) {
  // The end-of-central-directory record closes the file, followed only by a
  // comment of at most 65535 bytes. It holds the entry count (+10) and the
  // directory's offset (+16).
  const EOCD = 0x06054b50;
  const CDH = 0x02014b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('not a zip archive: no end-of-central-directory record');
  }
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || at === 0xffffffff) {
    throw new Error('a zip64 archive, which this does not read');
  }
  const names = [];
  for (let n = 0; n < count; n++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CDH) {
      throw new Error(`corrupt central directory at byte ${at}`);
    }
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    names.push(buf.toString('utf8', at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/** Package entry -> why it has to be there. */
function requiredEntries() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const required = new Map();

  required.set('extension/package.json', 'the manifest');
  required.set(`extension/${path.posix.normalize(pkg.main)}`, '`main` in package.json');

  for (const file of fs.readdirSync('src', { recursive: true })) {
    const rel = String(file).split(path.sep).join('/');
    if (rel.endsWith('.ts') && !rel.endsWith('.d.ts')) {
      required.set(`extension/out/${rel.slice(0, -3)}.js`, `compiled from src/${rel}`);
    }
  }

  for (const [where, meta] of Object.entries(lock.packages || {})) {
    if (!where.startsWith('node_modules/') || meta.dev || meta.devOptional || meta.optional) {
      continue;
    }
    const name = where.slice(where.lastIndexOf('node_modules/') + 'node_modules/'.length);
    required.set(`extension/${where}/package.json`, `production dependency ${name} ${meta.version}`);
  }
  return required;
}

function main(argv) {
  if (argv.length !== 3) {
    console.error('usage: node .github/scripts/check_vsix.js <extension.vsix>');
    return 2;
  }
  const vsix = argv[2];

  let entries;
  let required;
  try {
    entries = zipEntries(fs.readFileSync(vsix));
    required = requiredEntries();
  } catch (err) {
    console.error(`error: ${vsix}: ${err.message}`);
    return 1;
  }

  console.log(`--- ${vsix}: ${entries.length} entries`);
  for (const name of entries) {
    console.log(`  ${name}`);
  }

  const present = new Set(entries);
  const missing = [...required].filter(([entry]) => !present.has(entry));
  if (missing.length > 0) {
    for (const [entry, why] of missing) {
      console.error(`error: ${vsix} has no ${entry} (${why})`);
    }
    return 1;
  }
  console.log(`ok: all ${required.size} entries the extension loads are in ${vsix}`);
  return 0;
}

process.exitCode = main(process.argv);
