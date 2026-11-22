const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../..');
const shadow = fs.readFileSync(path.join(root, 'js/crm-shadow-storage.js'), 'utf8');
const maintenance = fs.readFileSync(path.join(root, 'js/storage-maintenance.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'storage-maintenance.html'), 'utf8');
let chromium;
try { ({ chromium } = require(process.env.AVITO_PLAYWRIGHT || 'playwright')); } catch {}

test('storage retention and verified cleanup in real IndexedDB', { skip: !chromium }, async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.AVITO_CHROME });
  async function fixture(count = 200, options = {}) {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.route('https://storage-fixture.test/**', route => route.fulfill({ contentType: 'text/html', body: html.replace(/<script[^>]*><\/script>/, '').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '') }));
    await page.goto('https://storage-fixture.test/');
    await page.evaluate(async ({ count, options }) => {
      localStorage.setItem('avitolog_projects', options.current || 'current');
      localStorage.setItem('custom-setting', 'must-remain');
      if (options.bounded) localStorage.setItem('_crm_shadow_bounded_from_v2', '2000-01-01T00:00:00.000Z');
      await new Promise((resolve, reject) => {
        const open = indexedDB.open('avitolog_shadow_v1', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('snapshots', { keyPath: 'savedAt' });
          open.result.createObjectStore('live', { keyPath: 'key' });
          open.result.createObjectStore('unrelated', { keyPath: 'id' });
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['snapshots', 'live', 'unrelated'], 'readwrite');
          for (let i = 0; i < count; i++) {
            const savedAt = new Date(Date.now() - (count - i) * 60000 - (options.old ? 3600000 : 0)).toISOString();
            tx.objectStore('snapshots').put({ savedAt, keyCount: 1, keys: { avitolog_projects: options.previous || 'current' } });
          }
          tx.objectStore('live').put({ key: 'avitolog_projects', value: 'before', updatedAt: 'old' });
          tx.objectStore('unrelated').put({ id: 'image', blob: new Blob(['unique-image']), name: 'cover' });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onabort = () => reject(tx.error);
        };
      });
    }, { count, options });
    await page.addScriptTag({ content: 'window.module={exports:{}};' + maintenance + ';window.maintenance=module.exports;delete window.module;' });
    return { context, page };
  }
  async function state(page) {
    return page.evaluate(async () => {
      const db = await maintenance.openExisting(window);
      try { return await maintenance.readState(db); } finally { db.close(); }
    });
  }
  async function settle(page) {
    await page.waitForFunction(async () => { const db = await maintenance.openExisting(window); try { return !!(await maintenance.readState(db)).boundedFrom; } finally { db.close(); } });
    await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  }
  try {
    await t.test('unchanged data is not snapshotted again; legacy history is retained', async () => {
      const { context, page } = await fixture();
      try {
        await page.addScriptTag({ content: shadow }); await settle(page);
        await page.evaluate(() => __crmShadow.takeSnapshot()); await settle(page);
        assert.equal((await state(page)).count, 200);
        assert.equal((await state(page)).live[0].value, 'current');
      } finally { await context.close(); }
    });
    await t.test('new writes are throttled, but live data is repaired immediately', async () => {
      const { context, page } = await fixture(200, { previous: 'old', current: 'new' });
      try {
        await page.addScriptTag({ content: shadow }); await settle(page);
        assert.equal((await state(page)).count, 200);
        assert.equal((await state(page)).live[0].value, 'new');
        await page.evaluate(() => __crmShadow.takeSnapshot()); await settle(page);
        assert.equal((await state(page)).count, 201);
      } finally { await context.close(); }
    });
    await t.test('managed history is bounded to the newest 96 snapshots', async () => {
      const { context, page } = await fixture(250, { bounded: true, old: true, previous: 'old' });
      try {
        await page.addScriptTag({ content: shadow }); await settle(page);
        assert.equal((await state(page)).count, 96);
        assert.equal((await state(page)).live[0].value, 'current');
      } finally { await context.close(); }
    });
    await t.test('managed history is pruned even when the current data is unchanged', async () => {
      const { context, page } = await fixture(250, { bounded: true });
      try {
        await page.addScriptTag({ content: shadow }); await settle(page);
        assert.equal((await state(page)).count, 96);
        assert.equal((await state(page)).live[0].value, 'current');
      } finally { await context.close(); }
    });
    await t.test('cleanup preserves live records, local settings and unrelated image store', async () => {
      const { context, page } = await fixture();
      try {
        const result = await page.evaluate(async () => {
          const db = await maintenance.openExisting(window);
          try {
            const before = await maintenance.readState(db);
            const result = await maintenance.pruneSnapshots(db, JSON.stringify(before.live));
            const after = await maintenance.readState(db);
            const image = await new Promise((resolve, reject) => {
              const tx = db.transaction('unrelated'); const request = tx.objectStore('unrelated').get('image');
              tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
            });
            return { result, before, after, image: await image.blob.text(), setting: localStorage.getItem('custom-setting') };
          } finally { db.close(); }
        });
        assert.deepEqual(result.result, { removed: 104, retained: 96 });
        assert.deepEqual(result.after.live, result.before.live);
        assert.equal(result.after.count, 96);
        assert.equal(result.image, 'unique-image');
        assert.equal(result.setting, 'must-remain');
      } finally { await context.close(); }
    });
    await t.test('stale backup blocks cleanup without deleting any snapshot', async () => {
      const { context, page } = await fixture();
      try {
        const result = await page.evaluate(async () => {
          const db = await maintenance.openExisting(window);
          let error;
          try { await maintenance.pruneSnapshots(db, '[]'); } catch (e) { error = e.message; }
          const after = await maintenance.readState(db); db.close(); return { error, count: after.count };
        });
        assert.match(result.error, /изменились/); assert.equal(result.count, 200);
      } finally { await context.close(); }
    });
    await t.test('transaction failure rolls all deletions back', async () => {
      const { context, page } = await fixture(500);
      try {
        const result = await page.evaluate(async () => {
          const db = await maintenance.openExisting(window);
          const before = await maintenance.readState(db); let error;
          try { await maintenance.pruneSnapshots(db, JSON.stringify(before.live), () => { throw Error('test abort'); }); } catch (e) { error = e.message; }
          const after = await maintenance.readState(db); db.close(); return { error, count: after.count };
        });
        assert.ok(result.error); assert.equal(result.count, 500);
      } finally { await context.close(); }
    });
    await t.test('missing database is not silently created', async () => {
      const { context, page } = await fixture();
      try {
        await page.evaluate(() => new Promise((resolve, reject) => { const q = indexedDB.deleteDatabase('avitolog_shadow_v1'); q.onsuccess = resolve; q.onerror = reject; }));
        const result = await page.evaluate(async () => {
          let message; try { await maintenance.openExisting(window); } catch (e) { message = e.message; }
          return { message, names: (await indexedDB.databases()).map(x => x.name) };
        });
        assert.match(result.message, /не найдена/); assert.deepEqual(result.names, []);
      } finally { await context.close(); }
    });
    await t.test('download contains exact current data; cleanup requires both backup steps', async () => {
      const { context, page } = await fixture();
      try {
        await page.evaluate(() => maintenance.mount(window));
        await page.waitForSelector('#export:not([disabled])');
        await page.check('#archive-verified'); assert.equal(await page.isDisabled('#clean'), true);
        const downloadPromise = page.waitForEvent('download'); await page.click('#export');
        const download = await downloadPromise;
        const raw = fs.readFileSync(await download.path());
        const saved = JSON.parse(zlib.gunzipSync(raw));
        assert.equal(saved.format, 'avitolog-current-storage-v1');
        assert.ok(saved.localStorage.some(row => row[0] === 'custom-setting' && row[1] === 'must-remain'));
        assert.equal(saved.live[0].value, 'before');
        assert.equal(saved.snapshotCount, 200);
        await page.waitForSelector('#clean:not([disabled])');
        await page.click('#clean'); await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Готово.'));
        assert.equal((await state(page)).count, 96);
        assert.equal(await page.isDisabled('#clean'), true);
        assert.ok((await state(page)).boundedFrom);
      } finally { await context.close(); }
    });
    await t.test('production page runs under its network-blocking security policy', async () => {
      const { context, page } = await fixture();
      try {
        await page.unroute('https://storage-fixture.test/**');
        await page.route('https://storage-fixture.test/**', route => route.fulfill(route.request().url().includes('/js/')
          ? { contentType: 'text/javascript', body: maintenance }
          : { contentType: 'text/html', body: html }));
        await page.reload(); await page.waitForSelector('#export:not([disabled])');
        assert.match(await page.textContent('#summary'), /Снимков: 200/);
        assert.match(html, /connect-src 'none'/);
      } finally { await context.close(); }
    });
    await t.test('changing a backup timestamp or ADS cache metadata does not block cleanup', async () => {
      const { context, page } = await fixture();
      try {
        await page.evaluate(() => maintenance.mount(window));
        await page.waitForSelector('#export:not([disabled])');
        const downloading = page.waitForEvent('download'); await page.click('#export'); await downloading;
        await page.waitForSelector('#export:not([disabled])');
        await page.evaluate(async () => {
          localStorage.setItem('_crm_shadow_last_snap', 'new-time');
          localStorage.setItem('avitolog_ads_snapshot_v1:fixture:cache-meta', 'new-cache-time');
          const db = await maintenance.openExisting(window);
          await new Promise((resolve, reject) => {
            const tx = db.transaction('live', 'readwrite');
            tx.objectStore('live').put({ key: 'avitolog_projects', value: 'before', updatedAt: 'new-time' });
            tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
          }); db.close();
        });
        await page.check('#archive-verified'); await page.click('#clean');
        await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Готово.'));
        assert.equal((await state(page)).count, 96);
      } finally { await context.close(); }
    });
    await t.test('changing a real setting still blocks cleanup', async () => {
      const { context, page } = await fixture();
      try {
        await page.evaluate(() => maintenance.mount(window));
        await page.waitForSelector('#export:not([disabled])');
        const downloading = page.waitForEvent('download'); await page.click('#export'); await downloading;
        await page.waitForSelector('#export:not([disabled])');
        await page.evaluate(() => localStorage.setItem('custom-setting', 'new-value'));
        await page.check('#archive-verified'); await page.click('#clean');
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Настройки изменились'));
        assert.equal((await state(page)).count, 200);
      } finally { await context.close(); }
    });
    await t.test('cleanup and retention policy survive exhausted localStorage without removing settings', async () => {
      const { context, page } = await fixture();
      try {
        await page.evaluate(() => {
          let length = 0;
          for (let step = 4194304; step; step = Math.floor(step / 2)) {
            try { localStorage.setItem('quota-padding', 'x'.repeat(length + step)); length += step; } catch {}
          }
        });
        await page.addScriptTag({ content: shadow }); await settle(page);
        const result = await page.evaluate(async () => {
          const db = await maintenance.openExisting(window);
          const before = await maintenance.readState(db);
          const padding = localStorage.getItem('quota-padding');
          await maintenance.pruneSnapshots(db, JSON.stringify(before.live));
          const after = await maintenance.readState(db); db.close();
          const publicRows = await new Promise(resolve => __crmShadow.readAllLive(resolve));
          return { before, after, settingsKept: localStorage.getItem('quota-padding') === padding, policyLeaked: Object.hasOwn(publicRows, '__crm_shadow_policy_v2') };
        });
        assert.equal(result.after.count, 96); assert.ok(result.after.boundedFrom);
        assert.deepEqual(result.after.live, result.before.live);
        assert.equal(result.settingsKept, true); assert.equal(result.policyLeaked, false);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
});
