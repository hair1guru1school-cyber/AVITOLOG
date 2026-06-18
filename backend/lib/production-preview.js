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
  const plan = buildStagingPlan(backup);
  const clientGroups = new Map();
  plan.records.filter((row) => row.entity_type === 'client').forEach((row) => {
    const rows = clientGroups.get(row.legacy_key) || []; rows.push(row); clientGroups.set(row.legacy_key, rows);
  });
  const clients = Array.from(clientGroups.values()).map(mergeClientRecords);
  const projects = plan.records.filter((row) => row.entity_type === 'project' && row.resolution_status === 'ready');
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

async function latestSnapshot(authorization) {
  const rows = await supabaseUserRequest(
    'migration_source_snapshots?select=id,migration_run_id,checksum,key_count,created_at,source&order=created_at.desc&limit=1', authorization
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
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

module.exports = { buildProductionPreview, latestSnapshot, productionPreview };
