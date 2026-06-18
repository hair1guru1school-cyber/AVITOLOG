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

const duplicatesPreview = previewLegacyBackup({
  clients: [
    { company: 'First', folderId: 'same-folder' },
    { company: 'Second', folderId: 'same-folder' }
  ],
  projects: []
});
assert.strictEqual(duplicatesPreview.uniqueCounts.clients, 1);
assert.strictEqual(duplicatesPreview.duplicates.clients.length, 1);
assert.deepStrictEqual(duplicatesPreview.duplicates.clients[0].records.map(x => x.label), ['First', 'Second']);
console.log('backend foundation tests: ok');
