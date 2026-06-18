'use strict';

const { supabaseUserRequest } = require('./supabase-rest');
const { buildStagingPlan } = require('./legacy-import');

async function postRows(path, rows, authorization) {
  if (!rows.length) return [];
  const output = [];
  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const result = await supabaseUserRequest(path, authorization, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(chunk)
    });
    if (Array.isArray(result)) output.push(...result);
  }
  return output;
}

async function prepareSnapshot(checksum, authorization) {
  const cleanChecksum = String(checksum || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(cleanChecksum)) {
    const error = new Error('Valid SHA-256 checksum is required'); error.status = 400; throw error;
  }
  const snapshots = await supabaseUserRequest(
    'migration_source_snapshots?select=id,migration_run_id,organization_id,source,raw_backup&checksum=eq.' + cleanChecksum + '&limit=1',
    authorization
  );
  const snapshot = Array.isArray(snapshots) ? snapshots[0] : null;
  if (!snapshot) { const error = new Error('Snapshot was not found'); error.status = 404; throw error; }

  const plan = buildStagingPlan(snapshot.raw_backup);
  const stagingRows = plan.records.map((record) => Object.assign({}, record, {
    migration_run_id: snapshot.migration_run_id,
    organization_id: snapshot.organization_id,
    source: snapshot.source
  }));
  const staged = await postRows(
    'migration_staging_records?on_conflict=migration_run_id,entity_type,record_index', stagingRows, authorization
  );

  await supabaseUserRequest(
    'migration_issues?migration_run_id=eq.' + encodeURIComponent(snapshot.migration_run_id), authorization,
    { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
  );
  const recordMap = new Map(staged.map((row) => [row.entity_type + ':' + row.record_index, row.id]));
  const issueRows = plan.issues.map((issue) => ({
    migration_run_id: snapshot.migration_run_id,
    organization_id: snapshot.organization_id,
    staging_record_id: recordMap.get(issue.entity_type + ':' + issue.record_index) || null,
    issue_code: issue.issue_code,
    severity: 'warning', message: issue.message, candidates: issue.candidates
  }));
  await postRows('migration_issues', issueRows, authorization);

  await supabaseUserRequest(
    'migration_runs?id=eq.' + encodeURIComponent(snapshot.migration_run_id), authorization,
    {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'prepared', summary: plan.preview })
    }
  );
  const statuses = stagingRows.reduce((acc, row) => {
    acc[row.resolution_status] = (acc[row.resolution_status] || 0) + 1; return acc;
  }, {});
  return { snapshotId: snapshot.id, migrationRunId: snapshot.migration_run_id, records: stagingRows.length, issues: issueRows.length, statuses, preview: plan.preview };
}

module.exports = { prepareSnapshot };
