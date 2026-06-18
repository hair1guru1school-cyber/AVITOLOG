'use strict';

const assert = require('assert');
const { previewLegacyBackup, stableKey } = require('../lib/legacy-import');
const { getSupabaseStatus } = require('../lib/supabase-rest');

const sample = {
  clients: [{ company: 'Test', folderId: 'drive-1' }],
  projectData: { projects: [{ name: 'Launch', projectId: 'project-1' }] }
};
const preview = previewLegacyBackup(sample);
assert.deepStrictEqual(preview.counts, { clients: 1, projects: 1 });
assert.strictEqual(preview.dryRun, true);
assert.strictEqual(stableKey('client', sample.clients[0], 0), 'client:drive-1');
assert.strictEqual(getSupabaseStatus().mode, 'parallel-migration');

const automaticBackup = {
  format: 'avitolog-fil-backup-v1',
  keys: {
    avitolog_clients: JSON.stringify([{ company: 'Auto', folderId: 'drive-auto' }]),
    avitolog_projects: JSON.stringify({ projects: [{ name: 'Auto project', projectId: 'auto-1' }] })
  }
};
const automaticPreview = previewLegacyBackup(automaticBackup);
assert.deepStrictEqual(automaticPreview.counts, { clients: 1, projects: 1 });
assert.strictEqual(automaticPreview.source, 'avitolog-fil-backup-v1');
console.log('backend foundation tests: ok');
