// v59 hotfix：補回總覽需要的預算進度清單 helper。
// 這個檔案必須在 script.js 前載入。

function renderBudgetProgressList(limit = 8) {
  const rows = getBudgetCompareRows(limit);
  if (!rows.length) return `<div class="empty">尚無預算項目</div>`;
  return `
    <div class="budget-progress-list">
      ${rows.map(r => {
        const pct = r.planned ? Math.max(0, r.actual / r.planned * 100) : 0;
        return `
          <div class="budget-progress-item">
            <div class="top">
              <strong>${escapeHtml(r.name)}</strong>
              <span class="badge ${pct > 100 ? "expense" : "income"}">${fmtNumber(pct, 1)}%</span>
            </div>
            <div class="${pct > 100 ? "progress danger" : "progress"}"><span style="width:${Math.min(100, pct)}%"></span></div>
            <div class="meta">
              <span>實際 ${fmtMoney(r.actual)}</span>
              <span>預算 ${fmtMoney(r.planned)}</span>
              <span>${Number(r.remaining || 0) >= 0 ? `剩餘 ${fmtMoney(r.remaining)}` : `超支 ${fmtMoney(Math.abs(Number(r.remaining || 0)))}`}</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}
