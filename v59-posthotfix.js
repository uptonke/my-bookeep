// v59 post-hotfix：覆寫帳戶儲存，避免舊 schema 的 accounts 缺少 color / currency 等欄位時寫入失敗。
// 這個檔案必須在 script.js 後載入。

function missingColumnNameFromError(error) {
  const text = String(error?.message || error || "");
  const match = text.match(/Could not find the '([^']+)' column/);
  return match ? match[1] : "";
}

async function upsertAccountCompat(payload) {
  const clean = normalizeForWrite(payload);
  let attempt = { ...clean };
  const removed = [];

  for (let i = 0; i < 8; i += 1) {
    try {
      return await upsert("accounts", attempt, { expect: { name: attempt.name } });
    } catch (error) {
      const col = missingColumnNameFromError(error);
      if (!col || !(col in attempt)) throw error;
      delete attempt[col];
      removed.push(col);
    }
  }

  throw new Error(`帳戶儲存失敗：accounts schema 欄位不相容。已移除欄位：${removed.join("、")}`);
}

async function saveAccount(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type,
    currency: d.currency || "TWD",
    initial_balance: numberOrZero(d.initial_balance),
    color: d.color || "#64748b",
    sort_order: numberOrZero(d.sort_order),
    is_active: boolValue(d.is_active),
    note: applyAccountCoverageMarker(d.note || "", d.coverage_mode || "auto")
  };
  return await upsertAccountCompat(payload);
}
