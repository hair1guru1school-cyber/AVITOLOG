'use strict';

const crypto = require('crypto');

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch (e) { return null; }
}

function unwrapKeyBackup(root) {
  const keys = object(root.keys);
  if (!Object.keys(keys).length) return root;
  const clients = parseJson(keys.avitolog_clients);
  const projects = parseJson(keys.avitolog_projects);
  return {
    source: root.format || root.source || 'avitolog-key-backup',
    clients: Array.isArray(clients) ? clients : [],
    projects: projects
  };
}

function stableKey(kind, item, index) {
  const explicit = text(item.id || item.clientId || item.projectId || item.folderId || item.crmClientId);
  if (explicit) return kind + ':' + explicit;
  const fingerprint = JSON.stringify([
    text(item.company || item.company_name || item.name || item.title),
    text(item.contact_name || item.contactName || item.phone),
    Number(index) || 0
  ]);
  return kind + ':sha256:' + crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
}

function itemLabel(item, index) {
  return text(item.company || item.company_name || item.name || item.title || item.contact_name || item.contactName) || ('Запись #' + (index + 1));
}

function duplicateGroups(items, keys) {
  const grouped = new Map();
  keys.forEach((key, index) => {
    const group = grouped.get(key) || [];
    group.push({ index, label: itemLabel(object(items[index]), index) });
    grouped.set(key, group);
  });
  return Array.from(grouped.entries())
    .filter((entry) => entry[1].length > 1)
    .slice(0, 20)
    .map((entry) => ({ legacyKey: entry[0], records: entry[1] }));
}

function folderIdFromUrl(value) {
  const match = text(value).match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

function entityRefs(item) {
  const crm = object(item.crmData);
  return [
    item.folderId, item.crmClientId, item.clientId, item.clientFolderId,
    crm.folderId, crm.crmClientId,
    folderIdFromUrl(item.folderLink), folderIdFromUrl(crm.folderLink)
  ].map(text).filter(Boolean);
}

function normalizedClientName(item) {
  const crm = object(item.crmData);
  return text(item.company || item.company_name || item.clientName || item.client_name || crm.company || crm.name)
    .toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
}

function analyzeRelations(clients, clientKeys, projects) {
  const refToKeys = new Map();
  const nameToKeys = new Map();
  clients.forEach((client, index) => {
    entityRefs(object(client)).forEach((ref) => {
      const keys = refToKeys.get(ref) || new Set();
      keys.add(clientKeys[index]); refToKeys.set(ref, keys);
    });
    const name = normalizedClientName(object(client));
    if (name) {
      const keys = nameToKeys.get(name) || new Set();
      keys.add(clientKeys[index]); nameToKeys.set(name, keys);
    }
  });

  const result = { linked: 0, linkedById: 0, linkedByName: 0, orphaned: 0, ambiguous: 0, orphanSamples: [], ambiguousSamples: [] };
  projects.forEach((project, index) => {
    const item = object(project);
    const matches = new Set();
    entityRefs(item).forEach((ref) => (refToKeys.get(ref) || []).forEach((key) => matches.add(key)));
    if (matches.size === 1) {
      result.linked++; result.linkedById++; return;
    }
    if (matches.size > 1) {
      result.ambiguous++;
      if (result.ambiguousSamples.length < 15) result.ambiguousSamples.push(itemLabel(item, index));
      return;
    }
    const name = normalizedClientName(item);
    const nameMatches = name ? (nameToKeys.get(name) || new Set()) : new Set();
    if (nameMatches.size === 1) {
      result.linked++; result.linkedByName++; return;
    }
    if (nameMatches.size > 1) {
      result.ambiguous++;
      if (result.ambiguousSamples.length < 15) result.ambiguousSamples.push(itemLabel(item, index));
      return;
    }
    result.orphaned++;
    if (result.orphanSamples.length < 15) result.orphanSamples.push(itemLabel(item, index));
  });
  return result;
}

function findClients(root) {
  const candidates = [root.clients, root.crmClients, root.clientData, object(root.data).clients];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function findProjects(root) {
  const candidates = [root.projects, object(root.projects).projects, object(root.projectData).projects, object(root.projectsData).projects, object(root.data).projects];
  for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
  return [];
}

function previewLegacyBackup(payload) {
  const original = object(payload);
  const root = unwrapKeyBackup(original);
  if (!Object.keys(root).length) throw new Error('Backup must be a JSON object');
  const clients = findClients(root);
  const projects = findProjects(root);
  const clientKeys = clients.map((item, index) => stableKey('client', object(item), index));
  const projectKeys = projects.map((item, index) => stableKey('project', object(item), index));
  const warnings = [];
  if (!clients.length) warnings.push('No client array was recognized');
  if (!projects.length) warnings.push('No project array was recognized');
  const duplicateClientKeys = clientKeys.filter((key, index) => clientKeys.indexOf(key) !== index);
  const duplicateProjectKeys = projectKeys.filter((key, index) => projectKeys.indexOf(key) !== index);
  if (duplicateClientKeys.length) warnings.push('Duplicate client legacy keys: ' + new Set(duplicateClientKeys).size);
  if (duplicateProjectKeys.length) warnings.push('Duplicate project legacy keys: ' + new Set(duplicateProjectKeys).size);
  return {
    dryRun: true,
    source: text(root.source) || text(original.format) || 'avitolog-local-backup',
    counts: { clients: clients.length, projects: projects.length },
    uniqueCounts: { clients: new Set(clientKeys).size, projects: new Set(projectKeys).size },
    duplicates: {
      clients: duplicateGroups(clients, clientKeys),
      projects: duplicateGroups(projects, projectKeys)
    },
    relations: analyzeRelations(clients, clientKeys, projects),
    sampleKeys: { clients: clientKeys.slice(0, 3), projects: projectKeys.slice(0, 3) },
    warnings
  };
}

function buildStagingPlan(payload) {
  const original = object(payload);
  const root = unwrapKeyBackup(original);
  const source = text(root.source) || text(original.format) || 'avitolog-local-backup';
  const clients = findClients(root).map(object);
  const projects = findProjects(root).map(object);
  const clientKeys = clients.map((item, index) => stableKey('client', item, index));
  const projectKeys = projects.map((item, index) => stableKey('project', item, index));
  const keyCounts = new Map();
  clientKeys.forEach((key) => keyCounts.set(key, (keyCounts.get(key) || 0) + 1));

  const refToKeys = new Map();
  const nameToKeys = new Map();
  clients.forEach((client, index) => {
    entityRefs(client).forEach((ref) => {
      const keys = refToKeys.get(ref) || new Set(); keys.add(clientKeys[index]); refToKeys.set(ref, keys);
    });
    const name = normalizedClientName(client);
    if (name) { const keys = nameToKeys.get(name) || new Set(); keys.add(clientKeys[index]); nameToKeys.set(name, keys); }
  });

  const records = clients.map((client, index) => ({
    entity_type: 'client', legacy_key: clientKeys[index], record_index: index, raw_data: client,
    normalized_data: { label: itemLabel(client, index) },
    resolution_status: keyCounts.get(clientKeys[index]) > 1 ? 'duplicate' : 'ready',
    resolution_note: keyCounts.get(clientKeys[index]) > 1 ? 'Same stable client key appears more than once' : null
  }));
  const issues = duplicateGroups(clients, clientKeys).map((group) => ({
    entity_type: 'client', record_index: group.records[0].index, issue_code: 'duplicate_client_key',
    message: group.records.map((item) => item.label).join(' / '),
    candidates: group.records
  }));

  projects.forEach((project, index) => {
    const idMatches = new Set();
    entityRefs(project).forEach((ref) => (refToKeys.get(ref) || []).forEach((key) => idMatches.add(key)));
    const name = normalizedClientName(project);
    const nameMatches = name ? (nameToKeys.get(name) || new Set()) : new Set();
    const matches = idMatches.size ? idMatches : nameMatches;
    const method = idMatches.size ? 'id_or_folder' : (nameMatches.size ? 'unique_name' : null);
    const status = matches.size === 1 ? 'ready' : (matches.size > 1 ? 'ambiguous' : 'unlinked');
    const matchedKeys = Array.from(matches);
    records.push({
      entity_type: 'project', legacy_key: projectKeys[index], record_index: index, raw_data: project,
      normalized_data: {
        label: itemLabel(project, index), relation_method: method,
        client_legacy_key: matchedKeys.length === 1 ? matchedKeys[0] : null,
        candidate_client_keys: matchedKeys
      },
      resolution_status: status,
      resolution_note: status === 'ready' ? null : (status === 'ambiguous' ? 'Multiple client candidates' : 'No client candidate')
    });
    if (status !== 'ready') issues.push({
      entity_type: 'project', record_index: index,
      issue_code: status === 'ambiguous' ? 'ambiguous_project_client' : 'unlinked_project_client',
      message: itemLabel(project, index), candidates: matchedKeys
    });
  });

  return { source, preview: previewLegacyBackup(payload), records, issues };
}

module.exports = { previewLegacyBackup, stableKey, buildStagingPlan };
