const fail = code => Object.assign(new Error(code), { code });
const changeOf = intent => ({ mode: intent.mode, ...(intent.mode === 'manual' ? { bid_penny: intent.bid_penny, limit_penny: intent.limit_penny } : intent.mode === 'auto' ? { budget_penny: intent.budget_penny, budget_type: intent.budget_type } : {}) });

// Only instantiated by the service-authenticated worker, never a browser request.
export function registerBidWorker(registry, module, { service, getRow, activeToken, bidding, scope }) {
  if (!registry) return;
  const rpc = (name, payload) => service('rpc/avito_bid_' + name, 'POST', payload);
  registry.register(module, async claim => {
    const lease = { p_job: claim.job_id, p_item: claim.item_id, p_lease: claim.lease };
    let submitted = false;
    try {
      let canonical = await rpc('validate_lease', lease), row = await getRow(canonical.organization_id, canonical.account_id);
      if (!row || String(row.credential_version) !== canonical.credential_version) throw fail('account_changed');
      scope(row, 'apply', module === 'oauth');
      const old = String(row.credential_version), token = await activeToken(row, canonical.organization_id, { user: { id: canonical.actor_id } });
      if (String(row.credential_version) !== old && await rpc('rotate_version', { ...lease, p_old: old, p_next: String(row.credential_version) }) !== true) throw fail('account_changed');
      row = await getRow(canonical.organization_id, canonical.account_id);
      const guard = async () => {
        canonical = await rpc('validate_lease', lease);
        const current = await getRow(canonical.organization_id, canonical.account_id);
        scope(current, 'apply', module === 'oauth');
        if (String(current.credential_version) !== canonical.credential_version || current.avito_user_id !== row.avito_user_id) throw fail('account_changed');
      };
      await guard();
      const context = { row, org: canonical.organization_id, actor: canonical.actor_id, token, guard };
      const preview = await bidding.handle({ context, route: { action: 'preview' }, method: 'POST', body: { item_id: claim.item_id, ...changeOf(canonical.intent) } });
      if (Object.keys(preview.after).length !== Object.keys(canonical.intent).length || Object.keys(preview.after).some(k => preview.after[k] !== canonical.intent[k])) throw fail('bidding_changed');
      if (await rpc('mark_submitting', lease) !== true) throw fail('queue_stopped');
      submitted = true;
      const result = await bidding.handle({ context, route: { action: 'apply' }, method: 'POST', body: { quote: preview.quote, confirmation: 'APPLY_BIDS' } });
      await rpc('finish_item', { ...lease, p_status: result.status, p_error: result.error || null });
    } catch (error) {
      const code = /^[a-z_]{1,80}$/.test(error.code || '') ? error.code : 'queue_worker_failed';
      await rpc('finish_item', { ...lease, p_status: submitted ? 'unknown' : 'rejected', p_error: code });
    }
  });
}
