'use strict';

const { buildCashImportPlan } = require('./cash-preview');
const { getPreviewSnapshot } = require('./production-preview');
const { supabaseUserRequest } = require('./supabase-rest');

async function executeCashImport(checksum, confirmation, authorization) {
  if (confirmation !== 'IMPORT_108_CASH_92_EVENTS') {
    const error = new Error('Exact cash import confirmation is required'); error.status = 400; throw error;
  }
  const snapshot = await getPreviewSnapshot(checksum, authorization);
  const plan = buildCashImportPlan(snapshot.backup);
  if (plan.entries.length !== 108 || plan.events.length !== 92) {
    const error = new Error('Cash import counts changed. Run preview again'); error.status = 409; throw error;
  }
  return supabaseUserRequest('rpc/import_cash_ledger', authorization, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ p_checksum: snapshot.checksum, p_entries: plan.entries, p_events: plan.events })
  });
}

async function cashImportStatus(authorization) {
  const entries = await supabaseUserRequest('cash_ledger_entries?select=id,ledger_month,owner_scope,received_amount,expected_amount,sold_for_amount,to_agent_amount', authorization);
  const events = await supabaseUserRequest('cash_payment_events?select=id,synthesized,amount', authorization);
  const rows = Array.isArray(entries) ? entries : [];
  const payments = Array.isArray(events) ? events : [];
  return {
    entries: rows.length,
    events: payments.length,
    realEvents: payments.filter((item) => !item.synthesized).length,
    balanceEvents: payments.filter((item) => item.synthesized).length,
    months: Array.from(new Set(rows.map((item) => String(item.ledger_month || '').slice(0, 7)).filter(Boolean))).sort()
  };
}

module.exports = { executeCashImport, cashImportStatus };
