'use strict';

const { buildStagingPlan } = require('./legacy-import');
const { supabaseUserRequest } = require('./supabase-rest');

function value(item, names) {
  for (const name of names) {
    const current = item && item[name];
    if (current !== undefined && current !== null && String(current).trim()) return String(current).trim();
  }
  return '';
}

function mergeClientRecords(records) {
  const sorted = records.slice().sort((a, b) => Object.values(b.raw_data || {}).filter(Boolean).length - Object.values(a.raw_data || {}).filter(Boolean).length);
  const raws = sorted.map((row) => row.raw_data || {});
  const pick = (names) => raws.map((item) => value(item, names)).find(Boolean) || '';
  return {
    legacy_key: records[0].legacy_key,
    company_name: pick(['company', 'company_name', 'name']) || 'Без названия',
    contact_name: pick(['contact_name', 'contactName', 'person', 'fio']),
    client_type: pick(['clientType', 'client_type', 'type']),
    phone: pick(['phone', 'telephone']), email: pick(['email']), telegram: pick(['telegram', 'tg']),
    avito_url: pick(['avito', 'avito_url', 'avitoUrl']), niche: pick(['niche']),
    geography: pick(['geo', 'geography', 'city']), notes: pick(['notes', 'usp', 'extra']),
    drive_folder_id: pick(['folderId', 'crmClientId']), drive_folder_url: pick(['folderLink']),
    source_record_count: records.length
  };
}

function buildProductionPreview(backup) {
  const importPlan = buildProductionImportPlan(backup);
  const plan = importPlan.stagingPlan;
  const clients = importPlan.clients;
  const projects = importPlan.projects;
  const heldProjects = plan.records.filter((row) => row.entity_type === 'project' && row.resolution_status !== 'ready');
  const coverage = ['contact_name','phone','email','drive_folder_id'].reduce((acc, field) => {
    acc[field] = clients.filter((client) => client[field]).length; return acc;
  }, {});
  return {
    dryRun: true, clientsToUpsert: clients.length, projectsToUpsert: projects.length,
    projectsHeld: heldProjects.length, issuesHeld: plan.issues.length,
    duplicateGroupsMerged: plan.preview.duplicates.clients.length,
    coverage,
    sampleClients: clients.slice(0, 8).map((client) => ({ name: client.company_name, records: client.source_record_count, hasFolder: Boolean(client.drive_folder_id) })),
    heldProjectSamples: heldProjects.slice(0, 15).map((row) => row.normalized_data.label)
  };
}

function buildProductionImportPlan(backup) {
  const plan = buildStagingPlan(backup);
  const clientGroups = new Map();
  plan.records.filter((row) => row.entity_type === 'client').forEach((row) => {
    const rows = clientGroups.get(row.legacy_key) || []; rows.push(row); clientGroups.set(row.legacy_key, rows);
  });
  const clients = Array.from(clientGroups.values()).map(mergeClientRecords);
  const projects = plan.records
    .filter((row) => row.entity_type === 'project' && row.resolution_status === 'ready')
    .map((row) => ({
      legacy_key: row.legacy_key,
      client_legacy_key: row.normalized_data.client_legacy_key,
      name: value(row.raw_data, ['name', 'title', 'projectName']) || row.normalized_data.label,
      details: Object.assign({}, row.raw_data, {
        migration_relation_method: row.normalized_data.relation_method
      })
    }));
  return { source: plan.source, clients, projects, stagingPlan: plan };
}

async function latestSnapshot(authorization) {
  const rows = await supabaseUserRequest(
    'migration_source_snapshots?select=id,migration_run_id,checksum,key_count,created_at,source,raw_backup&order=created_at.desc&limit=20', authorization
  );
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    try {
      const preview = buildProductionPreview(row.raw_backup);
      if (preview.clientsToUpsert === 91 && preview.projectsToUpsert === 48 && preview.projectsHeld === 23) {
        const result = Object.assign({}, row);
        delete result.raw_backup;
        return result;
      }
    } catch (error) {}
  }
  return null;
}

async function productionPreview(checksum, authorization) {
  const clean = String(checksum || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) { const error = new Error('Valid SHA-256 checksum is required'); error.status = 400; throw error; }
  const rows = await supabaseUserRequest(
    'migration_source_snapshots?select=raw_backup,checksum&checksum=eq.' + clean + '&limit=1', authorization
  );
  const snapshot = Array.isArray(rows) ? rows[0] : null;
  if (!snapshot) { const error = new Error('Snapshot was not found'); error.status = 404; throw error; }
  return buildProductionPreview(snapshot.raw_backup);
}

function safePreviewBackup(backup) {
  const root = backup && typeof backup === 'object' ? backup : {};
  const keys = root.keys && typeof root.keys === 'object' ? root.keys : {};
  const safeKeys = {};
  const omittedKeys = [];
  const sensitive = /(auth|token|secret|password|api[_-]?key|client[_-]?id|drive_email|backup_(folder|file)|latest_file)/i;
  Object.keys(keys).forEach((key) => {
    if (sensitive.test(key)) omittedKeys.push(key);
    else safeKeys[key] = keys[key];
  });
  return {
    format: root.format || 'avitolog-fil-backup-v1',
    createdAt: root.createdAt || null,
    profile: root.profile || 'fil',
    keys: safeKeys,
    originalKeyCount: Object.keys(keys).length,
    previewKeyCount: Object.keys(safeKeys).length,
    omittedKeys
  };
}

async function getPreviewSnapshot(checksum, authorization) {
  let clean = String(checksum || '').trim().toLowerCase();
  if (!clean) {
    const latest = await latestSnapshot(authorization);
    clean = latest ? latest.checksum : '';
  }
  if (!/^[a-f0-9]{64}$/.test(clean)) { const error = new Error('Approved snapshot was not found'); error.status = 404; throw error; }
  const rows = await supabaseUserRequest(
    'migration_source_snapshots?select=id,migration_run_id,checksum,raw_backup,created_at&checksum=eq.' + clean + '&limit=1', authorization
  );
  const snapshot = Array.isArray(rows) ? rows[0] : null;
  if (!snapshot) { const error = new Error('Snapshot was not found'); error.status = 404; throw error; }
  return {
    id: snapshot.id,
    migrationRunId: snapshot.migration_run_id,
    checksum: snapshot.checksum,
    savedAt: snapshot.created_at,
    backup: safePreviewBackup(snapshot.raw_backup)
  };
}

async function executeProductionImport(checksum, confirmation, authorization) {
  const clean = String(checksum || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) { const error = new Error('Valid SHA-256 checksum is required'); error.status = 400; throw error; }
  if (confirmation !== 'IMPORT_91_CLIENTS_48_PROJECTS') {
    const error = new Error('Exact production import confirmation is required'); error.status = 400; throw error;
  }
  const rows = await supabaseUserRequest(
    'migration_source_snapshots?select=raw_backup,checksum&checksum=eq.' + clean + '&limit=1', authorization
  );
  const snapshot = Array.isArray(rows) ? rows[0] : null;
  if (!snapshot) { const error = new Error('Snapshot was not found'); error.status = 404; throw error; }
  const importPlan = buildProductionImportPlan(snapshot.raw_backup);
  if (importPlan.clients.length !== 91 || importPlan.projects.length !== 48) {
    const error = new Error('Import counts changed. Run final preview again before importing'); error.status = 409; throw error;
  }
  return supabaseUserRequest('rpc/import_legacy_clients_projects', authorization, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ p_checksum: clean, p_clients: importPlan.clients, p_projects: importPlan.projects })
  });
}

module.exports = { buildProductionPreview, buildProductionImportPlan, latestSnapshot, productionPreview, executeProductionImport, safePreviewBackup, getPreviewSnapshot };
