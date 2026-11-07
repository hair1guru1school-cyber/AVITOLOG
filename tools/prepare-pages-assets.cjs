'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PREFIX = 'window.PORTFOLIO_IMAGES = ';
function prepare(site, repository, revision) {
  if (repository !== 'hair1guru1school-cyber/AVITOLOG' || !/^[a-f0-9]{40}$/.test(revision)) throw Error('Unexpected Pages source');
  const root = path.resolve(site), landing = path.join(root, 'AOA-Land');
  if (!fs.statSync(root).isDirectory()) throw Error('Site directory required');
  const base = 'https://raw.githubusercontent.com/' + repository + '/' + revision + '/AOA-Land/';
  const scriptFile = path.join(landing, 'portfolio-manifest.js');
  const original = fs.readFileSync(scriptFile, 'utf8').replace(/^\uFEFF/, '').replace(/^window\.PORTFOLIO_ASSET_BASE = [^\n]*;\n/, '');
  if (!original.startsWith(PREFIX)) throw Error('Unexpected portfolio manifest format');
  const images = JSON.parse(original.slice(PREFIX.length).trim().replace(/;$/, ''));
  let count = 0;
  function external(value) {
    if (typeof value === 'string') {
      if (value.startsWith(base + 'portfolio-images/')) { count++; return value; }
      if (!value.startsWith('portfolio-images/') || value.split('/').some(part => part === '..' || part === '.')) throw Error('Unexpected portfolio path');
      count++;
      return base + value.split('/').map(encodeURIComponent).join('/');
    }
    if (Array.isArray(value)) return value.map(external);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, external(item)]));
    throw Error('Unexpected portfolio value');
  }
  external(images);
  const imageCount = count;
  const jsonFile = path.join(landing, 'portfolio-manifest.json');
  const json = external(JSON.parse(fs.readFileSync(jsonFile, 'utf8').replace(/^\uFEFF/, '')));
  // Keep relative JS paths so existing local thumbnail lookup remains unchanged.
  fs.writeFileSync(scriptFile, 'window.PORTFOLIO_ASSET_BASE = ' + JSON.stringify(base) + ';\n' + original);
  fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2) + '\n');
  let bytes = 0;
  function measure(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('Unexpected site symlink');
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) measure(file); else bytes += fs.statSync(file).size;
    }
  }
  measure(root);
  if (bytes > 1024 * 1024 * 1024) throw Error('Pages artifact still exceeds 1 GiB');
  return { images: imageCount, bytes, base };
}
module.exports = { prepare };
if (require.main === module) {
  try { console.log(JSON.stringify(prepare(process.argv[2], process.argv[3], process.argv[4]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
