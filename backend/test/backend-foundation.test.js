'use strict';

const assert = require('assert');
const { previewLegacyBackup, stableKey, buildStagingPlan } = require('../lib/legacy-import');
const { getSupabaseStatus } = require('../lib/supabase-rest');
const { checksumBackup, backupSummary } = require('../lib/snapshot-import');
const { buildProductionPreview, buildProductionImportPlan } = require('../lib/production-preview');

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

const relationsPreview = previewLegacyBackup({
  clients: [{ company: 'Linked', folderId: 'folder-linked' }, { company: 'Named only' }],
  projects: [
    { name: 'By folder', folderId: 'folder-linked' },
    { name: 'Project by client name', clientName: 'Named only' },
    { name: 'Orphan project' }
  ]
});
assert.strictEqual(relationsPreview.relations.linkedById, 1);
assert.strictEqual(relationsPreview.relations.linkedByName, 1);
assert.strictEqual(relationsPreview.relations.orphaned, 1);
assert.strictEqual(checksumBackup(sample), checksumBackup(sample));
assert.strictEqual(checksumBackup(sample).length, 64);
assert.deepStrictEqual(backupSummary(automaticBackup), {
  format: 'avitolog-fil-backup-v1', profile: 'unknown', keyCount: 2
});
const stagingPlan = buildStagingPlan(relationsPreview.preview ? relationsPreview.preview : {
  clients: [{ company: 'One', folderId: 'folder-one' }],
  projects: [{ name: 'Project', folderId: 'folder-one' }]
});
assert.strictEqual(stagingPlan.records.length, 2);
assert.strictEqual(stagingPlan.records[1].resolution_status, 'ready');
const production = buildProductionPreview({
  clients: [{ company: 'One', folderId: 'folder-one' }, { company: 'One richer', folderId: 'folder-one', phone: '+7' }],
  projects: [{ name: 'Ready', folderId: 'folder-one' }, { name: 'Held' }]
});
assert.strictEqual(production.clientsToUpsert, 1);
assert.strictEqual(production.projectsToUpsert, 1);
assert.strictEqual(production.projectsHeld, 1);
const importPlan = buildProductionImportPlan({
  clients: [{ company: 'One', folderId: 'folder-one' }, { company: 'One richer', folderId: 'folder-one', phone: '+7' }],
  projects: [{ name: 'Ready', folderId: 'folder-one' }, { name: 'Held' }]
});
assert.strictEqual(importPlan.clients.length, 1);
assert.strictEqual(importPlan.projects.length, 1);
assert.strictEqual(importPlan.projects[0].client_legacy_key, 'client:folder-one');
assert.strictEqual(importPlan.projects[0].details.migration_relation_method, 'id_or_folder');
console.log('backend foundation tests: ok');
