/* Budget pool accounting override: keep the global pool and rollover envelopes on one reconciliation basis. */

budgetAllocationSummary = function() {
  const current = getCurrentYearSummary();
  const items = budgetItemSummariesForSelectedYear();

  // "項目待用"只計入目前各 envelope 尚未消耗、仍可花的正餘額。
  // 已結帳的舊週期支出已反映在年度 actual_expense，不應因結帳而重新釋放成「尚未分配」。
  const itemRemaining = items.reduce(
    (sum, i) => sum + Math.max(0, Number(i.remaining_amount || 0)),
    0
  );

  const poolRemaining = Number(current.remaining_budget || 0);
  const unallocated = poolRemaining - itemRemaining;

  return {
    itemRemaining,
    poolRemaining,
    unallocated,
    current
  };
};

renderBudgetAllocationCards = function() {
  const s = budgetAllocationSummary();
  const balanceIsPositive = s.unallocated >= 0;
  const balanceLabel = balanceIsPositive ? "尚未分配" : "超額承諾";
  const balanceAmount = Math.abs(s.unallocated);
  const balanceNote = balanceIsPositive
    ? "母池扣除全年已支出與項目待用後仍有空間"
    : "目前項目待用額度已超過母池剩餘";

  return `
    <div class="grid cols-3">
      ${metricCard("項目待用", fmtMoney(s.itemRemaining), "各預算項目目前尚未使用的正餘額加總")}
      ${metricCard(balanceLabel, fmtMoney(balanceAmount), balanceNote, balanceIsPositive ? "good" : "bad")}
      ${metricCard("年度結轉型項目", `${annualRolloverRows().length} 項`, "每年 + 餘額結轉")}
    </div>
  `;
};
