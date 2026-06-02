// v59 post-hotfix：覆寫帳戶儲存，避免舊 schema 沒有 accounts.color 時寫入失敗。
// 這個檔案必須在 script.js 後載入。

async function saveAccount(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type,
    currency: d.currency || "TWD",
    initial_balance: numberOrZero(d.initial_balance),
    sort_order: numberOrZero(d.sort_order),
    is_active: boolValue(d.is_active),
    note: applyAccountCoverageMarker(d.note || "", d.coverage_mode || "auto")
  };
  return await upsert("accounts", payload, { expect: { name: payload.name } });
}
