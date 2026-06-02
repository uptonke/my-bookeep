/* global supabase, APP_CONFIG */

const APP_VERSION = "v59";
const RECENT_TRANSACTION_LIMIT = 20;
const chartInstances = {};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  client: null,
  activeTab: "overview",
  loading: false,
  alertTimer: null,
  selectedYearId: null,
  selectedBudgetYear: new Date().getFullYear(),
  draftTxType: "expense",
  draftRecurringType: "expense",
  budgetOperationMode: "globalContribution",
  reportChartMode: "categoryExpense",
  reportChartKind: "bar",
  reportChartExpanded: false,
  reportTableMode: "pnl",
  reportAuditMode: "tAccount",
  data: {
    years: [],
    accounts: [],
    categories: [],
    tags: [],
    budgetItems: [],
    budgetContributions: [],
    budgetMovements: [],
    transactionEntries: [],
    transactionSplits: [],
    transactions: [],
    transactionView: [],
    accountBalances: [],
    yearSummary: [],
    budgetSummary: [],
    categorySpending: [],
    monthlyCashflow: [],
    recurring: [],
    quickTemplates: [],
    creditCards: [],
    creditStatements: [],
    loans: [],
    goals: []
  },
  editing: {
    transaction: null,
    budgetItem: null,
    budgetContribution: null,
    budgetMovement: null,
    account: null,
    category: null,
    tag: null,
    recurring: null,
    quickTemplate: null,
    creditCard: null,
    loan: null,
    goal: null,
    year: null
  },
  filters: {
    txSearch: "",
    txType: "",
    txCategory: "",
    txAccount: "",
    txStart: "",
    txEnd: "",
    chartScope: "year",
    chartCategory: ""
  },
  loadErrors: [],
  dbStatus: {
    connected: false,
    connectionText: "尚未連線",
    lastReadAt: null,
    lastReadOk: null,
    lastReadError: "",
    lastWriteAt: null,
    lastWriteOk: null,
    lastWriteAction: "",
    lastWriteTable: "",
    lastWriteError: ""
  }
};

const pageMeta = {
  overview: ["總覽", "年度預算、現金流與近期交易"],
  transactions: ["記一筆", "支出 / 收入 / 轉帳 / 退款，各自顯示不同欄位"],
  budget: ["年度預算", "年度預算項目、結轉與預算使用率"],
  accounts: ["帳戶", "現金、銀行、電子支付、信用卡與其他帳戶"],
  categories: ["分類 / 標籤", "收支分類與交易標籤管理"],
  recurring: ["訂閱管理", `管理訂閱、固定扣款、下次扣款日與取消狀態｜系統版本 ${APP_VERSION}`],
  creditLoans: ["信用卡 / 貸款", "信用卡帳單與債務追蹤"],
  goals: ["目標", "儲蓄、還債、旅遊與大額購買目標"],
  reports: ["報表", "月現金流、分類支出、借貸帳與表格匯出"],
  templates: ["模板管理", "自訂快速記一筆模板"],
  settings: ["設定", "連線狀態、資料匯出與操作提示"],
  mobileMore: ["更多", "帳戶、分類、訂閱、模板與設定"]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtMoney(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(n);
}

function fmtNumber(value, digits = 0) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}



const labelMaps = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  refund: "退款",
  saving: "儲蓄",
  other: "其他",

  survival: "生存必要",
  quality: "生活品質",
  luxury: "奢侈娛樂",
  investment: "自我投資",

  fixed: "固定",
  variable: "變動",
  one_time: "一次性",

  cleared: "已入帳",
  pending: "待確認",
  cancelled: "已取消",

  annual: "每年",
  monthly: "每月",
  weekly: "每週",
  daily: "每天",
  quarterly: "每季",
  yearly: "每年",
  custom: "自訂",

  annual_total: "年度總額",
  monthly_contribution: "月提撥",
  record_start: "記帳開始月",
  calendar_year: "1 月開始",

  none: "無",
  carryover: "餘額結轉",
  overspend_to_next: "超支帶入下期",
  manual: "手動",
  month_close: "月底關帳",

  cash: "現金",
  bank: "銀行",
  e_wallet: "電子支付",
  credit_card: "信用卡",
  loan: "貸款",
  asset: "資產",
  asset_adjustment: "資產調整",

  cashback: "現金回饋",
  points: "點數",
  miles: "哩程",

  student_loan: "學貸",
  personal_loan: "信貸",
  mortgage: "房貸",
  car_loan: "車貸",
  credit_card_debt: "信用卡債",
  installment: "分期付款",

  active: "啟用",
  paused: "暫停",
  completed: "已完成",
  paid_off: "已還清",

  debt_reduction: "還債",
  travel: "旅行",
  emergency_fund: "緊急預備金",
  purchase: "大額購買"
};

const tableLabelMap = {
  years: "年度",
  accounts: "帳戶",
  categories: "分類",
  tags: "標籤",
  budget_items: "預算項目",
  budget_contributions: "預算提撥",
  budget_movements: "預算移轉",
  transactions: "交易",
  transaction_entries: "分錄",
  transaction_splits: "拆帳",
  recurring_transactions: "訂閱",
  quick_templates: "快速模板",
  credit_cards: "信用卡",
  loans: "貸款",
  goals: "目標"
};

const colorPalette = [
  ["#64748b", "石板灰"],
  ["#2563eb", "穩重藍"],
  ["#0284c7", "湖水藍"],
  ["#0f766e", "深青綠"],
  ["#16a34a", "成長綠"],
  ["#ca8a04", "琥珀黃"],
  ["#f97316", "活力橘"],
  ["#dc2626", "警示紅"],
  ["#7c3aed", "紫色"],
  ["#db2777", "桃紅"],
  ["#334155", "深灰"],
  ["#000000", "黑色"]
];

function labelOf(value) {
  if (value === null || value === undefined || value === "") return "";
  return labelMaps[String(value)] || String(value);
}

function tableLabel(value) {
  return tableLabelMap[String(value)] || "資料";
}

function colorName(value) {
  const found = colorPalette.find(([hex]) => hex.toLowerCase() === String(value || "").toLowerCase());
  return found ? found[1] : "自訂顏色";
}

function colorOptions(selected = "#64748b") {
  const current = selected || "#64748b";
  const hasCurrent = colorPalette.some(([hex]) => hex.toLowerCase() === String(current).toLowerCase());
  const opts = colorPalette.map(([hex, name]) => {
    const isSelected = String(hex).toLowerCase() === String(current).toLowerCase() ? "selected" : "";
    return `<option value="${escapeHtml(hex)}" ${isSelected}>${escapeHtml(name)}</option>`;
  });
  if (!hasCurrent) {
    opts.unshift(`<option value="${escapeHtml(current)}" selected>目前顏色</option>`);
  }
  return opts.join("");
}

function colorDot(value) {
  const color = value || "#64748b";
  return `<span class="color-dot" style="background:${escapeHtml(color)}"></span>${escapeHtml(colorName(color))}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}


function appPreference(key, fallback = "") {
  try { return localStorage.getItem(`accounting_${key}`) || fallback; } catch (error) { return fallback; }
}

function setAppPreference(key, value) {
  try { localStorage.setItem(`accounting_${key}`, value || ""); } catch (error) { console.warn(error); }
}


function accountCoverageMode(note = "") {
  const m = String(note || "").match(/\[coverage:(auto|cash|liability|exclude)\]/);
  return m ? m[1] : "auto";
}

function stripAccountCoverageMarker(note = "") {
  return String(note || "").replace(/\s*\[coverage:(auto|cash|liability|exclude)\]\s*/g, "").trim();
}

function applyAccountCoverageMarker(note = "", mode = "auto") {
  const cleaned = stripAccountCoverageMarker(note);
  if (!mode || mode === "auto") return cleaned;
  return `${cleaned}${cleaned ? "\n" : ""}[coverage:${mode}]`;
}

function accountCoverageLabel(mode = "auto") {
  const map = {
    auto: "自動判斷",
    cash: "列入現金覆蓋",
    liability: "列為負債扣項",
    exclude: "不列入"
  };
  return map[mode] || "自動判斷";
}

function accountCoverageSelect(selected = "auto") {
  return `
    <select class="input" name="coverage_mode">
      <option value="auto" ${selected === "auto" ? "selected" : ""}>自動判斷</option>
      <option value="cash" ${selected === "cash" ? "selected" : ""}>列入現金覆蓋</option>
      <option value="liability" ${selected === "liability" ? "selected" : ""}>列為負債扣項</option>
      <option value="exclude" ${selected === "exclude" ? "selected" : ""}>不列入</option>
    </select>
  `;
}

function defaultAccountIdFor(type = "expense") {
  return appPreference(`default_account_${type}`, appPreference("default_account_expense", ""));
}

function showAlert(message, type = "warn", options = {}) {
  const box = $("#alertBox");
  if (state.alertTimer) {
    clearTimeout(state.alertTimer);
    state.alertTimer = null;
  }

  box.className = `alert ${type === "bad" ? "bad" : type === "good" ? "good" : ""}`;
  box.innerHTML = message;

  if (!message) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");

  // 成功提示不要永久黏在頁面上；錯誤提示保留，避免漏看。
  if (type === "good" && options.sticky !== true) {
    state.alertTimer = setTimeout(() => {
      box.classList.add("hidden");
      box.innerHTML = "";
      state.alertTimer = null;
    }, options.timeout || 3500);
  }
}

function syncPageChrome() {
  const tab = pageMeta[state.activeTab] ? state.activeTab : "overview";
  state.activeTab = tab;
  $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  const [title, subtitle] = pageMeta[tab] || pageMeta.overview;
  $("#pageTitle").textContent = title;
  $("#pageSubtitle").textContent = subtitle;
}

function setConnection(ok, text) {
  state.dbStatus.connected = Boolean(ok);
  state.dbStatus.connectionText = text || (ok ? "已連線" : "未連線");

  const dot = $("#connectionDot");
  const status = $("#connectionStatus");
  if (!dot || !status) return;

  const write = state.dbStatus.lastWriteOk === true
    ? "｜最後寫入成功"
    : state.dbStatus.lastWriteOk === false
      ? "｜最後寫入失敗"
      : "";
  dot.className = `status-dot ${ok ? "ok" : "bad"}`;
  status.textContent = ok ? `資料庫：已連線${write}` : `資料庫：${text || "未連線"}`;
}

function shortDateTime(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function markReadStatus(ok, error = "") {
  state.dbStatus.lastReadAt = new Date().toISOString();
  state.dbStatus.lastReadOk = Boolean(ok);
  state.dbStatus.lastReadError = error || "";
  setConnection(Boolean(ok), ok ? "已連線" : "讀取失敗");
}

function markWriteStatus(ok, { action = "", table = "", error = "" } = {}) {
  state.dbStatus.lastWriteAt = new Date().toISOString();
  state.dbStatus.lastWriteOk = Boolean(ok);
  state.dbStatus.lastWriteAction = action || "";
  state.dbStatus.lastWriteTable = table || "";
  state.dbStatus.lastWriteError = error || "";
  setConnection(state.dbStatus.connected, state.dbStatus.connectionText || "已連線");
}

function renderDatabaseStatusCard() {
  const s = state.dbStatus;
  const connectedText = s.connected ? "已連線" : s.connectionText || "未連線";
  const readText = s.lastReadOk === true
    ? `成功｜${shortDateTime(s.lastReadAt)}`
    : s.lastReadOk === false
      ? `失敗｜${shortDateTime(s.lastReadAt)}`
      : "N/A";
  const writeText = s.lastWriteOk === true
    ? `成功｜${shortDateTime(s.lastWriteAt)}${s.lastWriteTable ? `｜${tableLabel(s.lastWriteTable)}` : ""}`
    : s.lastWriteOk === false
      ? `失敗｜${shortDateTime(s.lastWriteAt)}${s.lastWriteTable ? `｜${tableLabel(s.lastWriteTable)}` : ""}`
      : "N/A";

  return `
    <div class="card database-status-card">
      <div class="card-title-row">
        <h3>資料庫狀態</h3>
        <span class="badge ${s.connected ? "good" : "bad"}">${escapeHtml(connectedText)}</span>
      </div>
      <div class="grid cols-3">
        ${metricCard("連線", escapeHtml(connectedText), "資料庫連線狀態", s.connected ? "good" : "bad")}
        ${metricCard("最後讀取", escapeHtml(readText), s.lastReadError ? escapeHtml(s.lastReadError) : "讀取資料表 / 檢視表")}
        ${metricCard("最後寫入", escapeHtml(writeText), s.lastWriteError ? escapeHtml(s.lastWriteError) : "新增 / 修改 / 刪除驗證")}
      </div>
      <p class="metric-sub">已整合連線與寫入狀態；錯誤時才顯示資料表與錯誤細節。</p>
    </div>
  `;
}

function optionList(rows, selected, label = "name", value = "id", placeholder = "請選擇") {
  return `<option value="">${escapeHtml(placeholder)}</option>` + rows.map(row => {
    const val = row[value];
    const lab = row[label];
    return `<option value="${escapeHtml(val)}" ${val === selected ? "selected" : ""}>${escapeHtml(lab)}</option>`;
  }).join("");
}

function accountOptions(selected = "", placeholder = "請選擇帳戶") {
  return optionList(state.data.accounts.filter(a => a.is_active !== false), selected, "name", "id", placeholder);
}

function categoryOptions(type = "", selected = "") {
  const rows = state.data.categories.filter(c => c.is_active !== false && (!type || c.type === type || c.type === "other"));
  return optionList(rows, selected, "name", "id", "未分類");
}

function budgetOptions(selected = "") {
  const rows = state.data.budgetItems.filter(b => b.is_active !== false && b.year_id === state.selectedYearId);
  return `<option value="">不綁定預算項目</option>` + rows.map(b => `<option value="${escapeHtml(b.id)}" ${b.id === selected ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("");
}

function yearBudgetModeLabel(summary) {
  return `全局提撥 ${summary.contribution_count || 0} 筆｜提撥累積 ${fmtMoney(summary.current_period_budget || 0)}`;
}

function getRecordStartMonthForYear(year) {
  const months = state.data.transactionView
    .filter(t => Number(t.tx_year) === Number(year) && t.status !== "cancelled")
    .map(t => Number(t.tx_month))
    .filter(Boolean);
  if (!months.length) return 1;
  return Math.min(...months);
}

function getBudgetContributionCountActualForYear(yearRecord = {}) {
  const year = Number(yearRecord.budget_year || state.selectedBudgetYear);
  const rows = (state.data.budgetContributions || []).filter(c => contributionYear(c.contribution_date) === year);
  if (rows.length) {
    const months = new Set(rows.map(c => String(c.contribution_date || "").slice(0, 7)).filter(Boolean));
    return months.size || rows.length;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const startMode = yearRecord.budget_start_mode || "record_start";
  const startMonth = startMode === "calendar_year" ? 1 : getRecordStartMonthForYear(year);

  if (year < currentYear) return 12 - startMonth + 1;
  if (year > currentYear) return 0;
  return Math.max(0, currentMonth - startMonth + 1);
}

function selectedYearRecord() {
  return state.data.years.find(y => y.id === state.selectedYearId)
    || state.data.years.find(y => Number(y.budget_year) === Number(state.selectedBudgetYear))
    || {};
}

function globalBudgetContributionRowsFromNote(note = "") {
  const match = String(note || "").match(/\[global_budget_contributions:([^\]]*)\]/);
  if (!match) return [];
  try {
    const rows = JSON.parse(decodeURIComponent(match[1]));
    if (!Array.isArray(rows)) return [];
    return rows
      .map(r => ({
        id: String(r.id || ""),
        contribution_date: String(r.contribution_date || ""),
        amount: Number(r.amount || 0),
        note: String(r.note || "")
      }))
      .filter(r => r.id && r.contribution_date && Number.isFinite(r.amount));
  } catch (error) {
    console.warn("global budget contributions parse failed", error);
    return [];
  }
}

function stripGlobalBudgetContributionsMarker(note = "") {
  return String(note || "").replace(/\s*\[global_budget_contributions:[^\]]*\]\s*/g, "").trim();
}

function applyGlobalBudgetContributionsMarker(note = "", rows = []) {
  const cleaned = stripGlobalBudgetContributionsMarker(note);
  const normalized = (rows || [])
    .map(r => ({
      id: String(r.id || ""),
      contribution_date: String(r.contribution_date || ""),
      amount: Number(r.amount || 0),
      note: String(r.note || "")
    }))
    .filter(r => r.id && r.contribution_date && Number.isFinite(r.amount));
  if (!normalized.length) return cleaned;
  const marker = `[global_budget_contributions:${encodeURIComponent(JSON.stringify(normalized))}]`;
  return `${cleaned}${cleaned ? "\n" : ""}${marker}`;
}

function globalBudgetContributionRowsForYear(year = selectedYearRecord()) {
  return globalBudgetContributionRowsFromNote(year?.note || "")
    .filter(r => contributionYear(r.contribution_date) === Number(year?.budget_year || state.selectedBudgetYear))
    .sort((a, b) => String(b.contribution_date || "").localeCompare(String(a.contribution_date || "")));
}

function globalBudgetContributionRowsForSelectedYear() {
  return globalBudgetContributionRowsForYear(selectedYearRecord());
}

function globalBudgetContributionTotalForYear(year = selectedYearRecord()) {
  return globalBudgetContributionRowsForYear(year).reduce((sum, r) => sum + Number(r.amount || 0), 0);
}

function globalBudgetContributionCountForYear(year = selectedYearRecord()) {
  return globalBudgetContributionRowsForYear(year).length;
}

function makeClientId(prefix = "gcontrib") {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function updateSelectedYearGlobalContributions(rows, userNote = null) {
  const year = selectedYearRecord();
  if (!year?.id) throw new Error("找不到目前年度，請先儲存年度設定。");
  const baseNote = userNote === null ? stripGlobalBudgetContributionsMarker(year.note || "") : userNote;
  const cleanRows = (rows || []).sort((a, b) => String(a.contribution_date || "").localeCompare(String(b.contribution_date || "")));
  const note = applyGlobalBudgetContributionsMarker(baseNote, cleanRows);
  const total = cleanRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const saved = await upsert("years", {
    ...year,
    budget_mode: "monthly_contribution",
    monthly_budget: 0,
    annual_budget: total,
    note
  }, { expect: { budget_year: Number(year.budget_year || state.selectedBudgetYear) } });
  return saved;
}

function getCurrentYearSummary() {
  const year = selectedYearRecord();
  const txRows = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  const actual_income = txRows.reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount || 0) : 0), 0);
  const gross_expense = txRows.reduce((sum, t) => sum + (t.type === "expense" ? Number(t.amount || 0) : 0), 0);
  const refund = txRows.reduce((sum, t) => sum + (t.type === "refund" ? Number(t.amount || 0) : 0), 0);
  const actual_expense = gross_expense - refund;

  // v50：全局年度預算改用實際提撥紀錄制，不再使用「每次提撥金額 × 次數」。
  const budget_mode = "monthly_contribution";
  const monthly_budget = 0;
  const contribution_count = globalBudgetContributionCountForYear(year);
  const annual_budget = globalBudgetContributionTotalForYear(year);
  const current_period_budget = annual_budget;

  const carryover_from_previous = Number(year.carryover_from_previous || 0);
  const available_budget = current_period_budget + carryover_from_previous;
  const remaining_budget = available_budget - actual_expense;

  return {
    year_id: year.id,
    budget_year: year.budget_year || state.selectedBudgetYear,
    name: year.name || `${state.selectedBudgetYear} 年度預算`,
    budget_mode,
    monthly_budget,
    contribution_count,
    annual_budget,
    current_period_budget,
    carryover_from_previous,
    available_budget,
    actual_income,
    actual_expense,
    net_cashflow: actual_income - actual_expense,
    remaining_budget,
    budget_used_pct: available_budget ? Math.round(actual_expense / available_budget * 10000) / 100 : 0,
    is_closed: year.is_closed,
    note: stripGlobalBudgetContributionsMarker(year.note || "")
  };
}

function budgetIsAnnualRolloverMode(item) {
  return String(item?.period_type || "annual") === "annual" && String(item?.rollover_mode || "none") === "carryover";
}

function budgetItemNoteRowsFromNote(note = "") {
  const match = String(note || "").match(/\[budget_item_notes:([^\]]*)\]/);
  if (!match) return [];
  try {
    const rows = JSON.parse(decodeURIComponent(match[1]));
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn("budget item notes parse failed", error);
    return [];
  }
}

function stripBudgetItemNotesMarker(note = "") {
  return String(note || "").replace(/\s*\[budget_item_notes:[^\]]*\]\s*/g, "").trim();
}

function applyBudgetItemNotesMarker(note = "", rows = []) {
  const cleaned = stripBudgetItemNotesMarker(note);
  if (!rows.length) return cleaned;
  const marker = `[budget_item_notes:${encodeURIComponent(JSON.stringify(rows))}]`;
  return `${cleaned}${cleaned ? "\n" : ""}${marker}`;
}

function budgetItemHistoryRows(item) {
  const notes = budgetItemNoteRowsFromNote(item?.note || "");
  const contributions = (state.data.budgetContributions || [])
    .filter(c => c.budget_item_id === item.id)
    .map(c => ({
      date: c.contribution_date,
      type: "提撥",
      amount: Number(c.amount || 0),
      note: c.note || ""
    }));
  const txRows = transactionsForSelectedYear()
    .filter(t => t.budget_item_id === item.id && t.status !== "cancelled" && ["expense", "refund"].includes(t.type))
    .map(t => ({
      date: t.transaction_date,
      type: t.type === "refund" ? "退款" : "支出",
      amount: t.type === "refund" ? Number(t.amount || 0) : -Number(t.amount || 0),
      note: t.merchant || t.note || t.category_name || ""
    }));
  const movementRows = (state.data.budgetMovements || [])
    .filter(m => m.from_budget_item_id === item.id || m.to_budget_item_id === item.id)
    .map(m => ({
      date: m.movement_date,
      type: m.to_budget_item_id === item.id ? "移入" : "移出",
      amount: m.to_budget_item_id === item.id ? Number(m.amount || 0) : -Number(m.amount || 0),
      note: m.note || ""
    }));
  return [...notes, ...contributions, ...txRows, ...movementRows]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

async function closeBudgetItemCycle(itemId) {
  const item = state.data.budgetItems.find(x => x.id === itemId);
  if (!item) throw new Error("找不到預算項目。");
  const summary = budgetItemSummary(item);
  const cycleRows = budgetItemHistoryRows(item);
  const closeDate = today();
  const noteRow = {
    date: closeDate,
    type: "結帳",
    amount: Number(summary.remaining_amount || 0),
    note: `結帳前：可用 ${Math.round(Number(summary.current_budget_amount || 0))}、實際 ${Math.round(Number(summary.actual_amount || 0))}、剩餘 ${Math.round(Number(summary.remaining_amount || 0))}`
  };
  const existingNoteRows = budgetItemNoteRowsFromNote(item.note || "");
  const nextNoteRows = [...existingNoteRows, noteRow];

  const payload = {
    ...item,
    planned_amount: Math.max(0, Number(summary.remaining_amount || 0)),
    start_date: closeDate,
    note: applyBudgetItemNotesMarker(stripBudgetItemNotesMarker(item.note || ""), nextNoteRows)
  };
  return await upsert("budget_items", payload, { expect: { id: item.id } });
}

function actualForBudgetItem(item) {
  const start = item.start_date || `${state.selectedBudgetYear}-01-01`;
  const end = item.end_date || `${state.selectedBudgetYear}-12-31`;
  return transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .filter(t => t.budget_item_id === item.id)
    .filter(t => !start || t.transaction_date >= start)
    .filter(t => !end || t.transaction_date <= end)
    .reduce((sum, t) => {
      if (t.type === "expense") return sum + Number(t.amount || 0);
      if (t.type === "refund") return sum - Number(t.amount || 0);
      return sum;
    }, 0);
}

function contributionYear(date) {
  return Number(String(date || "").slice(0, 4));
}

function contributionMonthIndex(date) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear() * 12 + d.getMonth();
}

function contributionCountForItem(item) {
  const period = item.period_type || "annual";
  const rows = (state.data.budgetContributions || []).filter(c => c.budget_item_id === item.id);
  if (rows.length) return rows.length;
  if (!["monthly", "weekly"].includes(period) || item.rollover_mode !== "carryover") return 1;

  const now = new Date();
  const currentYear = Number(state.selectedBudgetYear);
  const startDate = item.start_date || `${currentYear}-01-01`;
  const endDate = item.end_date || today();
  const start = new Date(`${startDate}T00:00:00`);
  const endRaw = new Date(`${endDate}T00:00:00`);
  const end = now.getFullYear() === currentYear ? new Date(Math.min(now.getTime(), endRaw.getTime())) : endRaw;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  if (period === "weekly") {
    return Math.floor((end - start) / (7 * 86400000)) + 1;
  }
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function contributionAmountForItem(item) {
  const rows = (state.data.budgetContributions || []).filter(c => c.budget_item_id === item.id);
  if (rows.length) return rows.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  if (["monthly", "weekly"].includes(item.period_type || "annual") && item.rollover_mode === "carryover") {
    return Number(item.planned_amount || 0) * contributionCountForItem(item);
  }
  return Number(item.planned_amount || 0);
}

function movementNetForItem(itemId) {
  return (state.data.budgetMovements || [])
    .filter(m => contributionYear(m.movement_date) === Number(state.selectedBudgetYear))
    .reduce((sum, m) => {
      if (m.to_budget_item_id === itemId) return sum + Number(m.amount || 0);
      if (m.from_budget_item_id === itemId) return sum - Number(m.amount || 0);
      return sum;
    }, 0);
}

function budgetItemSummary(item) {
  const actual_amount = actualForBudgetItem(item);
  const current_budget_amount = contributionAmountForItem(item) + movementNetForItem(item.id);
  const remaining_amount = current_budget_amount - actual_amount;
  return {
    ...item,
    category_name: state.data.categories.find(c => c.id === item.category_id)?.name || "",
    actual_amount,
    current_budget_amount,
    remaining_amount,
    usage_pct: current_budget_amount ? Math.round(actual_amount / current_budget_amount * 10000) / 100 : 0,
    budget_formula: ["monthly", "weekly"].includes(item.period_type || "annual") && item.rollover_mode === "carryover"
      ? `實際提撥 ${contributionCountForItem(item)} 筆，累積 ${fmtMoney(current_budget_amount)}`
      : budgetIsAnnualRolloverMode(item)
        ? `年度結轉型：目前可用 ${fmtMoney(current_budget_amount)}`
        : `固定預算 ${fmtMoney(item.planned_amount)}`
  };
}

function budgetItemSummariesForSelectedYear() {
  return state.data.budgetItems
    .filter(item => item.year_id === state.selectedYearId && item.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map(budgetItemSummary);
}

function transactionsForSelectedYear() {
  return state.data.transactionView
    .filter(t => Number(t.tx_year) === Number(state.selectedBudgetYear))
    .sort((a, b) => String(b.transaction_date).localeCompare(String(a.transaction_date)) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function allTransactionsEnriched() {
  return [...state.data.transactionView]
    .sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

async function loadTable(table, columns = "*") {
  const { data, error } = await state.client.from(table).select(columns);
  if (error) {
    throw new Error(`${tableLabel(table)}讀取失敗：${formatSupabaseError(error)}`);
  }
  return data || [];
}

async function loadTableSafe(table, columns = "*") {
  try {
    return await loadTable(table, columns);
  } catch (error) {
    state.loadErrors.push(error.message);
    console.warn(error.message);
    return [];
  }
}

async function loadRecurringOnly() {
  const rows = await loadTableSafe("recurring_transactions");
  state.data.recurring = rows.sort((a, b) => String(a.next_due_date || "").localeCompare(String(b.next_due_date || "")));
  return state.data.recurring;
}

async function loadAll() {
  state.loading = true;
  state.loadErrors = [];
  try {
    const [
      years,
      accounts,
      categories,
      tags,
      budgetItems,
      budgetContributions,
      budgetMovements,
      transactions,
      transactionView,
      accountBalances,
      yearSummary,
      budgetSummary,
      categorySpending,
      monthlyCashflow,
      recurring,
      quickTemplates,
      creditCards,
      loans,
      goals,
      transactionEntries,
      transactionSplits
    ] = await Promise.all([
      loadTableSafe("years"),
      loadTableSafe("accounts"),
      loadTableSafe("categories"),
      loadTableSafe("tags"),
      loadTableSafe("budget_items"),
      loadTableSafe("budget_contributions"),
      loadTableSafe("budget_movements"),
      loadTableSafe("transactions"),
      loadTableSafe("v_transaction_details"),
      loadTableSafe("v_account_balances"),
      loadTableSafe("v_year_summary"),
      loadTableSafe("v_budget_summary"),
      loadTableSafe("v_category_spending"),
      loadTableSafe("v_monthly_cashflow"),
      loadTableSafe("recurring_transactions"),
      loadTableSafe("quick_templates"),
      loadTableSafe("credit_cards"),
      loadTableSafe("loans"),
      loadTableSafe("goals"),
      loadTableSafe("transaction_entries"),
      loadTableSafe("transaction_splits")
    ]);

    state.data.years = years.sort((a, b) => Number(a.budget_year) - Number(b.budget_year));
    state.data.accounts = accounts.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    state.data.categories = categories.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    state.data.tags = tags.sort((a, b) => a.name.localeCompare(b.name));
    state.data.budgetItems = budgetItems;
    state.data.budgetContributions = budgetContributions;
    state.data.budgetMovements = budgetMovements;
    state.data.transactions = transactions;
    state.data.transactionView = transactionView;
    state.data.accountBalances = accountBalances;
    state.data.yearSummary = yearSummary;
    state.data.budgetSummary = budgetSummary;
    state.data.categorySpending = categorySpending;
    state.data.monthlyCashflow = monthlyCashflow;
    state.data.recurring = recurring.sort((a, b) => String(a.next_due_date || "").localeCompare(String(b.next_due_date || "")));
    state.data.quickTemplates = quickTemplates.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    state.data.creditCards = creditCards;
    state.data.loans = loans;
    state.data.goals = goals;
    state.data.transactionEntries = transactionEntries;
    state.data.transactionSplits = transactionSplits;

    if (!state.data.years.length) {
      const currentYear = new Date().getFullYear();
      await upsert("years", { budget_year: currentYear, name: `${currentYear} 年度預算`, annual_budget: 0 }, { expect: { budget_year: currentYear } });
      return await loadAll();
    }

    const existing = state.selectedYearId && state.data.years.find(y => y.id === state.selectedYearId);
    const byCurrentYear = state.data.years.find(y => Number(y.budget_year) === new Date().getFullYear());
    const selected = existing || byCurrentYear || state.data.years[state.data.years.length - 1];
    state.selectedYearId = selected.id;
    state.selectedBudgetYear = selected.budget_year;

    const errors = state.loadErrors;
    if (errors.length) {
      console.warn("部分資料讀取失敗", errors);
      markReadStatus(false, errors.slice(0, 3).join("；"));
      showAlert(`部分資料讀取失敗：${escapeHtml(errors.slice(0, 3).join("；"))}${errors.length > 3 ? "……" : ""}`, "warn");
    } else {
      markReadStatus(true);
    }

    renderYearSelect();
  } catch (error) {
    console.error(error);
    state.loadErrors = [error.message];
    setConnection(false, "連線或資料庫結構異常");
    showAlert(`資料庫讀取失敗：${escapeHtml(error.message)}。請確認已執行資料庫結構檔，且設定檔的專案網址與公開金鑰正確。`, "bad");
  } finally {
    state.loading = false;
  }
}

function renderYearSelect() {
  const select = $("#yearSelect");
  select.innerHTML = state.data.years
    .map(y => `<option value="${escapeHtml(y.id)}" ${y.id === state.selectedYearId ? "selected" : ""}>${escapeHtml(y.budget_year)}</option>`)
    .join("");
}

function setPage(tab) {
  state.activeTab = pageMeta[tab] ? tab : "overview";
  showAlert("");
  syncPageChrome();
  render();
}

function render() {
  const app = $("#app");
  syncPageChrome();
  destroyCharts();
  if (state.loading) {
    app.innerHTML = `<div class="empty">讀取中...</div>`;
    return;
  }

  const renderers = {
    overview: renderOverview,
    transactions: renderTransactions,
    budget: renderBudget,
    accounts: renderAccounts,
    categories: renderCategories,
    recurring: renderRecurring,
    templates: renderTemplates,
    creditLoans: renderCreditLoans,
    goals: renderGoals,
    reports: renderReports,
    settings: renderSettings,
    mobileMore: renderMobileMore
  };

  try {
    app.innerHTML = (renderers[state.activeTab] || renderOverview)();
    bindRenderedEvents();
    initCharts();
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <div class="card">
        <h3>頁面載入失敗</h3>
        <p class="metric-sub">目前頁面：${escapeHtml(pageMeta[state.activeTab]?.[0] || state.activeTab)}</p>
        <p class="metric-sub">錯誤：${escapeHtml(error.message || String(error))}</p>
        <div class="btn-row">
          <button class="btn secondary" type="button" data-go="overview">回總覽</button>
          <button class="btn secondary" type="button" id="refreshBtnInline">重新整理資料</button>
        </div>
      </div>
    `;
    $("#refreshBtnInline")?.addEventListener("click", async () => {
      await loadAll();
      render();
    });
    $$("[data-report-mode]").forEach(btn => btn.addEventListener("click", () => {
    const group = btn.dataset.reportGroup;
    const mode = btn.dataset.reportMode;
    if (!group || !mode) return;
    state[group] = mode;
    if (group === "reportChartMode") {
      state.reportChartExpanded = false;
      state.reportChartKind = "bar";
    }
    render();
  }));

  $$("[data-report-chart-kind]").forEach(btn => btn.addEventListener("click", () => {
    state.reportChartKind = btn.dataset.reportChartKind || "bar";
    render();
  }));

  $$("[data-report-chart-expand]").forEach(btn => btn.addEventListener("click", () => {
    state.reportChartExpanded = btn.dataset.reportChartExpand === "true";
    render();
  }));

  $$("[data-budget-operation]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.budgetOperationMode = btn.dataset.budgetOperation || "globalContribution";
    render();
  }));

  $$("[data-go]").forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.go)));
    showAlert(`頁面載入失敗：${escapeHtml(error.message || String(error))}`, "bad");
  }
}

function renderOverview() {
  const s = getCurrentYearSummary();
  const tx = transactionsForSelectedYear().slice(0, 8);
  const expense = Number(s.actual_expense || 0);
  const available = Number(s.available_budget || 0);
  const remaining = Number(s.remaining_budget || 0);
  const pct = available ? Math.min(100, Math.max(0, expense / available * 100)) : 0;
  const progressClass = pct > 90 ? "progress danger" : "progress";

  return `
    <div class="grid cols-4">
      ${metricCard("可用預算", fmtMoney(s.available_budget), `年度 ${state.selectedBudgetYear}`)}
      ${metricCard("實際支出", fmtMoney(s.actual_expense), `使用率 ${fmtNumber(s.budget_used_pct, 1)}%`, "bad")}
      ${metricCard("剩餘預算", fmtMoney(remaining), remaining >= 0 ? "仍在預算內" : "已超支", remaining >= 0 ? "good" : "bad")}
      ${metricCard("實際收入", fmtMoney(s.actual_income), `淨現金流 ${fmtMoney(s.net_cashflow)}`, Number(s.net_cashflow || 0) >= 0 ? "good" : "warn")}
    </div>

    <div class="mobile-action-grid">
      <button type="button" data-go="transactions" class="mobile-action-card primary">
        <strong>＋ 記一筆</strong>
        <span>花錢、收入、退款、轉帳</span>
      </button>
      <button type="button" data-go="budget" class="mobile-action-card">
        <strong>看預算</strong>
        <span>剩多少、哪裡快爆</span>
      </button>
      <button type="button" data-go="reports" class="mobile-action-card">
        <strong>看圖表</strong>
        <span>分類支出與 T 字帳</span>
      </button>
    </div>

    <div class="card">
      <div class="card-title-row">
        <h3>預算使用進度</h3>
        <span class="badge">${fmtNumber(pct, 1)}%</span>
      </div>
      <div class="${progressClass}"><span style="width:${pct}%"></span></div>
      <p class="metric-sub">可用預算 = 前期結轉 + 全局提撥紀錄合計。支出會扣除退款，只計入狀態不是「已取消」的交易。</p>
    </div>

    ${renderChartToolbar()}

    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row"><h3>預算使用圖</h3><span class="badge">圓環圖</span></div>
        <div class="chart-canvas-wrap tall"><canvas id="overviewBudgetChart"></canvas></div>
        <p class="chart-note">這張固定看年度總預算，不受「本月 / 分類」篩選影響。</p>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>分類淨支出排行</h3><span class="badge">長條圖</span></div>
        <div class="chart-canvas-wrap tall"><canvas id="overviewCategoryChart"></canvas></div>
        <p class="chart-note">${escapeHtml(chartScopeText())}。退款會從原分類扣回。</p>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row"><h3>${state.filters.chartScope === "month" ? "本月日度收支趨勢" : "月度收支趨勢"}</h3><span class="badge">折線圖</span></div>
        <div class="chart-canvas-wrap"><canvas id="overviewMonthlyChart"></canvas></div>
        <p class="chart-note">${escapeHtml(chartScopeText())}。用來看節奏是否失控。</p>
      </div>
      <div class="card chart-card">
        <div class="card-title-row"><h3>分類預算進度</h3><span class="badge">進度條</span></div>
        ${renderBudgetProgressList(8)}
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row">
          <h3>帳戶餘額</h3>
          <button class="btn small secondary" data-go="accounts">管理帳戶</button>
        </div>
        ${renderAccountBalanceList()}
      </div>
      <div class="card">
        <div class="card-title-row">
          <h3>近期交易</h3>
          <button class="btn small secondary" data-go="transactions">查看全部</button>
        </div>
        ${renderSmallTxTable(tx)}
      </div>
    </div>
  `;
}

function metricCard(label, value, sub, color = "") {
  return `
    <div class="card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value ${color}">${escapeHtml(value)}</div>
      <div class="metric-sub">${escapeHtml(sub || "")}</div>
    </div>
  `;
}

function renderAccountBalanceList() {
  const rows = state.data.accountBalances.filter(a => a.is_active !== false);
  if (!rows.length) return `<div class="empty">尚無帳戶</div>`;
  return `
    <div class="chart-list">
      ${rows.map(a => `
        <div class="card-title-row">
          <span>${escapeHtml(a.name)} <span class="badge">${escapeHtml(labelOf(a.type))}</span></span>
          <strong class="mono">${fmtMoney(a.current_balance)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSmallTxTable(rows) {
  if (!rows.length) return `<div class="empty">尚無交易</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>日期</th><th>類型</th><th>分類</th><th>金額</th><th>商家</th></tr></thead>
        <tbody>
          ${rows.map(t => `
            <tr>
              <td>${escapeHtml(t.transaction_date)}</td>
              <td>${typeBadge(t.type)}</td>
              <td>${escapeHtml(t.category_name || "未分類")}</td>
              <td class="mono ${(t.type === "income" || t.type === "refund") ? "good" : t.type === "expense" ? "bad" : ""}">${fmtMoney(t.amount)}</td>
              <td>${escapeHtml(t.merchant || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


const fallbackQuickTemplates = [
  { key: "builtin-breakfast", name: "早餐", type: "expense", categoryNames: ["日常餐飲", "餐飲"], budgetNames: ["日常餐飲", "餐飲"], merchant: "早餐", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-lunch", name: "午餐", type: "expense", categoryNames: ["日常餐飲", "餐飲"], budgetNames: ["日常餐飲", "餐飲"], merchant: "午餐", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-dinner", name: "晚餐", type: "expense", categoryNames: ["日常餐飲", "餐飲"], budgetNames: ["日常餐飲", "餐飲"], merchant: "晚餐", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-coffee", name: "咖啡", type: "expense", categoryNames: ["咖啡", "飲料", "日常餐飲"], budgetNames: ["日常花費", "日常餐飲"], merchant: "咖啡", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-transport", name: "交通", type: "expense", categoryNames: ["交通"], budgetNames: ["日常花費", "交通"], merchant: "交通", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "e_wallet", "cash"], is_builtin: true },
  { key: "builtin-parking", name: "停車費", type: "expense", categoryNames: ["交通", "停車"], budgetNames: ["日常花費", "交通"], merchant: "停車場", cashflow_nature: "variable", necessity_level: "quality", accountTypes: ["credit_card", "cash", "e_wallet"], is_builtin: true },
  { key: "builtin-subscription", name: "訂閱", type: "expense", categoryNames: ["訂閱", "娛樂"], budgetNames: ["娛樂", "日常花費"], merchant: "訂閱", cashflow_nature: "fixed", necessity_level: "quality", accountTypes: ["credit_card", "bank"], is_builtin: true },
  { key: "builtin-openai", name: "OpenAI", type: "expense", categoryNames: ["訂閱", "自我投資"], budgetNames: ["日常花費", "自我投資"], merchant: "OpenAI", cashflow_nature: "fixed", necessity_level: "investment", accountTypes: ["credit_card"], is_builtin: true },
  { key: "builtin-live-music", name: "Live Music", type: "expense", categoryNames: ["Live Music", "娛樂"], budgetNames: ["Live Music", "娛樂"], merchant: "Live Music", cashflow_nature: "one_time", necessity_level: "luxury", accountTypes: ["credit_card", "cash"], is_builtin: true },
  { key: "builtin-comedy", name: "單口喜劇", type: "expense", categoryNames: ["單口喜劇", "娛樂"], budgetNames: ["單口喜劇", "娛樂"], merchant: "單口喜劇", cashflow_nature: "one_time", necessity_level: "luxury", accountTypes: ["credit_card", "cash"], is_builtin: true },
  { key: "builtin-fine-dining", name: "高端餐飲", type: "expense", categoryNames: ["高端餐飲", "餐飲"], budgetNames: ["高端餐飲"], merchant: "餐廳", cashflow_nature: "one_time", necessity_level: "luxury", accountTypes: ["credit_card"], is_builtin: true },
  { key: "builtin-travel", name: "出國 / 旅行", type: "expense", categoryNames: ["旅行", "出國"], budgetNames: ["出國", "旅行"], merchant: "旅行", cashflow_nature: "one_time", necessity_level: "luxury", accountTypes: ["credit_card", "bank", "cash"], is_builtin: true },
  { key: "builtin-income", name: "收入", type: "income", categoryNames: ["薪資", "其他收入"], budgetNames: [], merchant: "收入", cashflow_nature: "variable", necessity_level: "other", accountTypes: ["bank", "cash"], is_builtin: true },
  { key: "builtin-refund", name: "退款", type: "refund", categoryNames: ["退款", "其他"], budgetNames: [], merchant: "退款", cashflow_nature: "one_time", necessity_level: "other", accountTypes: ["credit_card", "bank", "cash"], is_builtin: true }
];

function resolveTemplateAccount(type, accountTypes = []) {
  const preferred = defaultAccountIdFor(type);
  if (preferred) return preferred;
  const rows = state.data.accounts.filter(a => a.is_active !== false);
  const found = rows.find(a => accountTypes.includes(a.type)) || rows[0];
  return found?.id || "";
}

function findByNames(rows, names = []) {
  const normalized = names.map(n => String(n).toLowerCase());
  return rows.find(row => normalized.includes(String(row.name || "").toLowerCase()));
}

function templateToDraft(template) {
  const type = template.type || "expense";
  const category = template.category_id
    ? state.data.categories.find(c => c.id === template.category_id)
    : findByNames(state.data.categories, template.categoryNames || []);
  const budget = template.budget_item_id
    ? state.data.budgetItems.find(b => b.id === template.budget_item_id)
    : findByNames(state.data.budgetItems.filter(b => b.year_id === state.selectedYearId), template.budgetNames || []);
  return {
    transaction_date: today(),
    type,
    account_id: template.default_account_id || resolveTemplateAccount(type, template.accountTypes || []),
    to_account_id: template.default_to_account_id || "",
    category_id: category?.id || "",
    budget_item_id: budget?.id || "",
    merchant: template.merchant || template.name || "",
    payment_method: template.payment_method || "",
    necessity_level: template.necessity_level || defaultNecessityByType(type),
    cashflow_nature: template.cashflow_nature || defaultCashflowByType(type),
    control_level: template.control_level || "controllable",
    amount: template.default_amount || "",
    note: template.note || ""
  };
}

function quickTemplateRows(type) {
  const custom = state.data.quickTemplates
    .filter(t => t.is_active !== false && t.type === type)
    .map(t => ({ ...t, is_builtin: false }));
  const builtins = fallbackQuickTemplates.filter(t => t.type === type);
  return [...custom, ...builtins];
}

function renderQuickTxTemplates(type) {
  const rows = quickTemplateRows(type).slice(0, 14);
  if (!rows.length) return "";
  return `
    <div class="quick-template-bar">
      ${rows.map(t => `
        <button class="chip ${t.is_builtin ? "muted-chip" : ""}" type="button" data-quick-template="${escapeHtml(t.id || t.key)}" data-template-kind="${t.is_builtin ? "builtin" : "custom"}">
          ${escapeHtml(t.name)}
        </button>
      `).join("")}
    </div>
  `;
}

function transactionDraftFromTemplate(id, kind) {
  const row = kind === "builtin"
    ? fallbackQuickTemplates.find(t => t.key === id)
    : state.data.quickTemplates.find(t => t.id === id);
  return row ? templateToDraft(row) : null;
}

function txDraftValue(field, edit = {}) {
  if (edit && Object.prototype.hasOwnProperty.call(edit, field)) return edit[field] ?? "";
  if (state.transactionDraft && Object.prototype.hasOwnProperty.call(state.transactionDraft, field)) return state.transactionDraft[field] ?? "";
  return "";
}

function defaultNecessityByType(type) {
  if (type === "income" || type === "transfer") return "other";
  return "quality";
}

function defaultCashflowByType(type) {
  if (type === "income") return "variable";
  if (type === "transfer") return "variable";
  return "variable";
}

function renderTxModePicker(type) {
  const modes = ["expense", "income", "transfer", "refund", "asset_adjustment"];
  return `<div class="segmented">${modes.map(m => `<button type="button" class="seg-btn ${m === type ? "active" : ""}" data-tx-mode="${m}">${escapeHtml(labelOf(m))}</button>`).join("")}</div>`;
}

function renderTxPrimaryFields(type, edit = {}) {
  const transactionDate = txDraftValue("transaction_date", edit) || today();
  const amount = txDraftValue("amount", edit);
  const account = txDraftValue("account_id", edit) || defaultAccountIdFor(type);
  const toAccount = txDraftValue("to_account_id", edit) || defaultAccountIdFor("transfer");
  const category = txDraftValue("category_id", edit);
  const budget = txDraftValue("budget_item_id", edit);
  const merchant = txDraftValue("merchant", edit);
  const adjustmentDirection = txDraftValue("adjustment_direction", edit) || "increase";

  const fields = [
    field("日期", `<input class="input" type="date" name="transaction_date" value="${escapeHtml(transactionDate)}" required>`),
    field("金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(amount)}" placeholder="輸入金額" required>`)
  ];

  if (type === "transfer") {
    fields.push(field("轉出帳戶", `<select class="input" name="account_id" required>${accountOptions(account)}</select>`));
    fields.push(field("轉入帳戶", `<select class="input" name="to_account_id" required>${accountOptions(toAccount)}</select>`));
  } else if (type === "income") {
    fields.push(field("入帳帳戶", `<select class="input" name="account_id" required>${accountOptions(account)}</select>`));
    fields.push(field("分類", `<select class="input" name="category_id">${categoryOptions("income", category)}</select>`));
  } else if (type === "refund") {
    fields.push(field("退款帳戶", `<select class="input" name="account_id" required>${accountOptions(account)}</select>`));
    fields.push(field("分類", `<select class="input" name="category_id">${categoryOptions("expense", category)}</select>`));
    fields.push(field("預算項目", `<select class="input" name="budget_item_id">${budgetOptions(budget)}</select>`));
  } else if (type === "asset_adjustment") {
    fields.push(field("調整帳戶", `<select class="input" name="account_id" required>${accountOptions(account)}</select>`));
    fields.push(field("調整方向", `<select class="input" name="adjustment_direction">
      <option value="increase" ${adjustmentDirection !== "decrease" ? "selected" : ""}>增加資產</option>
      <option value="decrease" ${adjustmentDirection === "decrease" ? "selected" : ""}>減少資產</option>
    </select>`));
  } else {
    fields.push(field("付款帳戶", `<select class="input" name="account_id" required>${accountOptions(account)}</select>`));
    fields.push(field("分類", `<select class="input" name="category_id">${categoryOptions("expense", category)}</select>`));
    fields.push(field("預算項目", `<select class="input" name="budget_item_id">${budgetOptions(budget)}</select>`));
  }

  fields.push(field("商家 / 對象", `<input class="input" name="merchant" value="${escapeHtml(merchant)}" placeholder="例：早餐、威秀、Blue Note">`));
  return fields.join("");
}

function renderTxAdvancedFields(type, edit = {}) {
  const necessity = txDraftValue("necessity_level", edit) || defaultNecessityByType(type);
  const cashflow = txDraftValue("cashflow_nature", edit) || defaultCashflowByType(type);
  const payment = txDraftValue("payment_method", edit);
  const note = txDraftValue("note", edit);
  const status = txDraftValue("status", edit) || "cleared";
  const splitLines = txDraftValue("split_lines", edit);

  return `
    <details class="advanced-fields wide">
      <summary>進階欄位</summary>
      <div class="form-grid two">
        ${field("付款方式", `<input class="input" name="payment_method" value="${escapeHtml(payment)}" placeholder="Apple Pay / 現金 / 分期">`)}
        ${field("狀態", `<select class="input" name="status">${selectOpts(["cleared","pending","cancelled"], status)}</select>`)}
        ${field("必要程度", `<select class="input" name="necessity_level">${selectOpts(["survival","quality","luxury","investment","other"], necessity)}</select>`)}
        ${field("現金流性質", `<select class="input" name="cashflow_nature">${selectOpts(["fixed","variable","one_time"], cashflow)}</select>`)}
        <div class="field wide">
          <label>拆帳</label>
          <textarea class="input" name="split_lines" placeholder="每行格式：金額 | 分類名稱 | 預算項目｜例：100 | 餐飲 | 日常花費">${escapeHtml(splitLines || "")}</textarea>
        </div>
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note">${escapeHtml(note || "")}</textarea>
        </div>
      </div>
    </details>
  `;
}

function renderTransactions() {
  const edit = state.editing.transaction;
  const type = edit?.type || state.draftTxType || "expense";
  const rows = applyTxFilters(transactionsForSelectedYear());
  const previewRows = rows.slice(0, RECENT_TRANSACTION_LIMIT);
  const previewLabel = previewRows.length ? `最近 ${previewRows.length} 筆` : "0 筆";
  const hasMoreRows = rows.length > RECENT_TRANSACTION_LIMIT;

  return `
    <div class="card">
      <h3>${edit ? `編輯${labelOf(type)}` : "記一筆"}</h3>
      ${edit ? "" : renderTxModePicker(type)}
      ${edit ? "" : renderQuickTxTemplates(type)}
      <form id="txForm" class="form-grid tx-type-form" data-current-type="${escapeHtml(type)}">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        <input type="hidden" name="type" value="${escapeHtml(type)}">
        ${renderTxPrimaryFields(type, edit || {})}
        ${renderTxAdvancedFields(type, edit || {})}

        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : `新增${labelOf(type)}`}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="transaction">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>最近交易（點擊展開 / 收合）</span>
        <span class="badge">${previewLabel}</span>
      </summary>
      <div class="collapsible-body">
        ${renderTxFilters()}
        <p class="metric-sub">此區只顯示最近 ${RECENT_TRANSACTION_LIMIT} 筆預覽，避免資料累積後畫面爆量；要找舊資料請用日期、搜尋、分類或帳戶篩選縮小範圍。</p>
        ${hasMoreRows ? `<p class="metric-sub">目前篩選結果超過 ${RECENT_TRANSACTION_LIMIT} 筆，以下僅顯示最前面的 ${RECENT_TRANSACTION_LIMIT} 筆。</p>` : ""}
        ${renderTxTable(previewRows)}
      </div>
    </details>
  `;
}

function applyTxFilters(rows) {
  return rows.filter(t => {
    const q = state.filters.txSearch.trim().toLowerCase();
    const text = [t.merchant, t.note, t.category_name, t.account_name, t.tags].join(" ").toLowerCase();
    if (q && !text.includes(q)) return false;
    if (state.filters.txType && t.type !== state.filters.txType) return false;
    if (state.filters.txCategory && t.category_id !== state.filters.txCategory) return false;
    if (state.filters.txAccount && t.account_id !== state.filters.txAccount && t.to_account_id !== state.filters.txAccount) return false;
    if (state.filters.txStart && t.transaction_date < state.filters.txStart) return false;
    if (state.filters.txEnd && t.transaction_date > state.filters.txEnd) return false;
    return true;
  });
}

function renderTxFilters() {
  return `
    <div class="filters" style="margin-bottom:14px">
      <input class="input" id="filterTxSearch" value="${escapeHtml(state.filters.txSearch)}" placeholder="搜尋商家 / 備註 / 分類">
      <select class="input" id="filterTxType">
        <option value="">全部類型</option>
        <option value="income" ${state.filters.txType === "income" ? "selected" : ""}>收入</option>
        <option value="expense" ${state.filters.txType === "expense" ? "selected" : ""}>支出</option>
        <option value="refund" ${state.filters.txType === "refund" ? "selected" : ""}>退款</option>
        <option value="transfer" ${state.filters.txType === "transfer" ? "selected" : ""}>轉帳</option>
      </select>
      <select class="input" id="filterTxCategory">${categoryOptions("", state.filters.txCategory)}</select>
      <select class="input" id="filterTxAccount">${accountOptions(state.filters.txAccount)}</select>
      <input class="input" type="date" id="filterTxStart" value="${escapeHtml(state.filters.txStart)}">
      <input class="input" type="date" id="filterTxEnd" value="${escapeHtml(state.filters.txEnd)}">
    </div>
  `;
}

function renderTxTable(rows) {
  if (!rows.length) return `<div class="empty">沒有符合條件的交易</div>`;

  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.map(t => `
        <div class="mobile-data-card">
          <div class="mobile-data-head">
            <div>
              <strong>${escapeHtml(t.merchant || t.category_name || labelOf(t.type))}</strong>
              <span>${escapeHtml(t.transaction_date)}｜${escapeHtml(t.account_name || "")}</span>
            </div>
            <div class="mobile-amount ${(t.type === "income" || t.type === "refund") ? "good" : t.type === "expense" ? "bad" : ""}">${fmtMoney(t.amount)}</div>
          </div>
          <div class="mobile-data-meta">
            <span>${escapeHtml(labelOf(t.type))}</span>
            <span>${escapeHtml(t.category_name || "未分類")}</span>
            ${t.budget_item_name ? `<span>${escapeHtml(t.budget_item_name)}</span>` : ""}
            ${t.status ? `<span>${escapeHtml(labelOf(t.status))}</span>` : ""}
          </div>
          <div class="mobile-card-actions">
            <button type="button" class="btn small secondary" data-edit-tx="${escapeHtml(t.id)}">編輯</button>
            <button type="button" class="btn small danger" data-delete="transactions:${escapeHtml(t.id)}">刪除</button>
          </div>
        </div>
      `).join("")}
    </div>`;

  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead><tr><th>日期</th><th>類型</th><th>帳戶</th><th>分類</th><th>預算項目</th><th>金額</th><th>商家</th><th>備註</th><th>狀態</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.map(t => `
            <tr>
              <td>${escapeHtml(t.transaction_date)}</td>
              <td>${typeBadge(t.type)}</td>
              <td>${escapeHtml(t.account_name || "")}${t.to_account_name ? ` → ${escapeHtml(t.to_account_name)}` : ""}</td>
              <td>${escapeHtml(t.category_name || "未分類")}</td>
              <td>${escapeHtml(t.budget_item_name || "")}</td>
              <td class="mono ${(t.type === "income" || t.type === "refund") ? "good" : t.type === "expense" ? "bad" : ""}">${fmtMoney(t.amount)}</td>
              <td>${escapeHtml(t.merchant || "")}</td>
              <td>${escapeHtml(t.note || "")}</td>
              <td>${escapeHtml(labelOf(t.status))}</td>
              <td class="actions">
                <button class="btn small secondary" data-edit-tx="${escapeHtml(t.id)}">編輯</button>
                <button class="btn small danger" data-delete="transactions:${escapeHtml(t.id)}">刪除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
  return `${mobileCards}${tableView}`;
}

function typeBadge(type) {
  const cls = type === "income" ? "good" : type === "refund" ? "warn" : type === "expense" ? "bad" : "";
  return `<span class="badge ${cls}">${escapeHtml(labelOf(type))}</span>`;
}

function parseSplitLines(text = "", type = "expense") {
  const lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    const parts = line.split("|").map(p => p.trim());
    if (parts.length < 2) throw new Error(`拆帳第 ${idx + 1} 行格式錯誤，請用：金額 | 分類 | 預算項目`);
    const amount = Number(parts[0]);
    if (!amount) throw new Error(`拆帳第 ${idx + 1} 行金額錯誤`);
    const categoryName = parts[1] || "";
    const budgetName = parts[2] || "";
    const category = state.data.categories.find(c => c.name === categoryName && (c.type === type || c.type === "expense" || c.type === "other"));
    const budget = state.data.budgetItems.find(b => b.name === budgetName && b.year_id === state.selectedYearId);
    return {
      amount: Math.abs(amount),
      category_id: category?.id || null,
      budget_item_id: budget?.id || null,
      note: line
    };
  });
}

function renderBudget() {
  const editYear = state.editing.year;
  const editItem = state.editing.budgetItem;
  const current = getCurrentYearSummary();
  const items = budgetItemSummariesForSelectedYear();

  return `
    <div class="grid cols-4">
      ${metricCard("目前可用預算", fmtMoney(current.available_budget), yearBudgetModeLabel(current))}
      ${metricCard("年度提撥合計", fmtMoney(current.annual_budget), "全局提撥紀錄合計")}
      ${metricCard("已用預算", fmtMoney(current.actual_expense), `${fmtNumber(current.budget_used_pct, 1)}%`, "bad")}
      ${metricCard("剩餘預算", fmtMoney(current.remaining_budget), Number(current.remaining_budget || 0) >= 0 ? "預算內" : "超支", Number(current.remaining_budget || 0) >= 0 ? "good" : "bad")}
    </div>

    ${renderBudgetAllocationCards()}

    ${renderBudgetRealityCheck()}

    <div class="card budget-focus-card">
      <div class="card-title-row">
        <h3>預算項目</h3>
        <span class="badge">${items.length} 項</span>
      </div>
      <p class="metric-sub">每月項目主表看本月；每年 + 餘額結轉 = 年度結轉型。也可直接按「結帳」重開週期：主畫面實際歸 0、剩餘銀彈承接，累積資訊仍保留歷史。</p>
      ${renderBudgetItemTable(items)}
    </div>

    ${renderBudgetOperationsCard(editYear, editItem, current)}

    ${renderMonthCloseAdvisor()}

    ${renderAnnualRolloverCard()}

    ${renderGlobalBudgetContributionRecords()}

    ${renderBudgetContributionRecords()}

    ${renderBudgetMovementRecords()}
  `;
}

function renderBudgetItemTable(items) {
  if (!items.length) return `<div class="empty">尚無預算項目</div>`;
  const mobileCards = `
    <div class="mobile-card-list">
      ${items.map(i => `
        <div class="mobile-data-card">
          <div class="mobile-data-head">
            <div>
              <strong>${escapeHtml(i.name)}</strong>
              <span>${escapeHtml(i.category_name || "未分類")}｜${escapeHtml(labelOf(i.item_type))}</span>
            </div>
            <div class="mobile-amount ${Number(i.remaining_amount || 0) >= 0 ? "good" : "bad"}">${fmtMoney(i.remaining_amount)}</div>
          </div>
          <div class="mobile-data-meta">
            <span>可用 ${fmtMoney(i.current_budget_amount)}</span>
            <span>實際 ${fmtMoney(i.actual_amount)}</span>
            <span>使用率 ${fmtNumber(i.usage_pct, 1)}%</span>
          </div>
          <div class="progress"><span style="width:${Math.min(100, Math.max(0, i.usage_pct || 0))}%"></span></div>
          <div class="mobile-card-actions">
            <button type="button" class="btn small secondary" data-edit-budget="${escapeHtml(i.id)}">編輯</button>
            <button type="button" class="btn small secondary" data-close-budget-item="${escapeHtml(i.id)}">結帳</button>
            <button type="button" class="btn small danger" data-delete="budget_items:${escapeHtml(i.id)}">刪除</button>
          </div>
        </div>
      `).join("")}
    </div>`;

  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead><tr><th>名稱</th><th>類型</th><th>分類</th><th>計算方式</th><th>目前可用</th><th>實際</th><th>剩餘</th><th>使用率</th><th>操作</th></tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td><strong>${escapeHtml(i.name)}</strong></td>
              <td><span class="badge">${escapeHtml(labelOf(i.item_type))}</span></td>
              <td>${escapeHtml(i.category_name || "")}</td>
              <td><span class="badge">${["monthly","weekly"].includes(i.period_type || "annual") && i.rollover_mode === "carryover" ? "提撥型" : budgetIsAnnualRolloverMode(i) ? "年度結轉型" : "固定型"}</span><br><small>${escapeHtml(i.budget_formula)}</small></td>
              <td class="mono">${fmtMoney(i.current_budget_amount)}</td>
              <td class="mono bad">${fmtMoney(i.actual_amount)}</td>
              <td class="mono ${Number(i.remaining_amount || 0) >= 0 ? "good" : "bad"}">${fmtMoney(i.remaining_amount)}</td>
              <td><div class="mini-progress"><span style="width:${Math.min(100, Math.max(0, i.usage_pct || 0))}%"></span></div><small>${fmtNumber(i.usage_pct, 1)}%</small></td>
              <td class="actions">
                <button class="btn small secondary" data-edit-budget="${escapeHtml(i.id)}">編輯</button>
                <button class="btn small secondary" data-close-budget-item="${escapeHtml(i.id)}">結帳</button>
                <button class="btn small danger" data-delete="budget_items:${escapeHtml(i.id)}">刪除</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
  return `${mobileCards}${tableView}`;
}

function renderBudgetAllocationCards() {
  const current = getCurrentYearSummary();
  const items = budgetItemSummariesForSelectedYear();
  const allocated = items.reduce((sum, i) => sum + Number(i.current_budget_amount || 0), 0);
  const unallocated = Number(current.available_budget || 0) - allocated;
  return `
    <div class="grid cols-3">
      ${metricCard("項目已分配", fmtMoney(allocated), "各項目目前可用額度加總")}
      ${metricCard(unallocated >= 0 ? "尚未分配" : "超額分配", fmtMoney(unallocated), unallocated >= 0 ? "母池尚有空間" : "項目額度已超過母池", unallocated >= 0 ? "good" : "bad")}
      ${metricCard("年度結轉型項目", fmtNumber(items.filter(budgetIsAnnualRolloverMode).length, 0) + " 項", "每年 + 餘額結轉")}
    </div>
  `;
}

function budgetRealityAccounts() {
  const rows = state.data.accountBalances.filter(a => a.is_active !== false);
  const cashTypes = new Set(["cash", "bank", "e_wallet", "asset"]);
  const liabilityTypes = new Set(["credit_card", "loan"]);
  let cash = 0;
  let liabilities = 0;
  const details = [];

  rows.forEach(a => {
    const balance = Number(a.current_balance || 0);
    const mode = accountCoverageMode(a.note || "");
    let role = "exclude";

    if (mode === "cash") role = "cash";
    else if (mode === "liability") role = "liability";
    else if (mode === "exclude") role = "exclude";
    else if (cashTypes.has(a.type)) role = "cash";
    else if (liabilityTypes.has(a.type)) role = "liability";

    if (role === "cash") cash += balance;
    if (role === "liability") liabilities += Math.abs(Math.min(balance, 0) || balance);
    details.push({ ...a, role, balance });
  });

  return { cash, liabilities, details };
}

function renderBudgetRealityCheck() {
  const account = budgetRealityAccounts();
  const budgetRemaining = budgetItemSummariesForSelectedYear().reduce((sum, i) => sum + Math.max(0, Number(i.remaining_amount || 0)), 0);
  const buffer = account.cash - account.liabilities - budgetRemaining;
  const ok = buffer >= 0;
  return `
    <div class="card reality-card ${ok ? "ok" : "danger"}">
      <div class="card-title-row">
        <h3>預算真實性驗算</h3>
        <span class="badge ${ok ? "good" : "bad"}">${ok ? "現金覆蓋足夠" : "預算缺口"}</span>
      </div>
      <p class="metric-sub">公式：你指定列入的現金類帳戶 − 你指定的負債扣項 − 預算項目剩餘總額 = 預算安全墊。可在「帳戶 → 編輯帳戶 → 預算驗算」自行決定每個帳戶是否列入。</p>
      <div class="grid cols-4">
        ${metricCard("現金類資金", fmtMoney(account.cash), "現金 / 銀行 / 電支 / 證券戶現金", "good")}
        ${metricCard("信用卡 / 貸款扣項", fmtMoney(account.liabilities), "負債扣除", account.liabilities ? "bad" : "")}
        ${metricCard("預算剩餘銀彈", fmtMoney(budgetRemaining), "各預算項目剩餘加總")}
        ${metricCard("預算安全墊", fmtMoney(buffer), ok ? "現金足以覆蓋預算" : "現金不足以覆蓋預算", ok ? "good" : "bad")}
      </div>
      <details>
        <summary>查看驗算明細</summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>帳戶</th><th>類型</th><th>餘額</th><th>預算驗算</th></tr></thead>
            <tbody>${account.details.map(a => `
              <tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(labelOf(a.type))}</td><td class="mono">${fmtMoney(a.balance)}</td><td>${escapeHtml(accountCoverageLabel(accountCoverageMode(a.note || "")))}</td></tr>
            `).join("")}</tbody>
          </table>
        </div>
      </details>
    </div>
  `;
}

function reportTable(headers, rows, options = {}) {
  if (!rows.length) return `<div class="empty">${escapeHtml(options.empty || "尚無資料")}</div>`;
  return `
    <div class="table-wrap report-table-wrap">
      <table class="report-table">
        <thead><tr>${headers.map(h => `<th>${escapeHtml(h.label)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>${headers.map(h => {
              const value = typeof h.value === "function" ? h.value(row) : row[h.key];
              const cls = h.className ? ` class="${h.className}"` : "";
              return `<td${cls}>${h.raw ? value : escapeHtml(value ?? "")}</td>`;
            }).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function selectedYearActiveTransactions() {
  return transactionsForSelectedYear().filter(t => t.status !== "cancelled");
}

function categoryExpenseReportRows() {
  const rows = new Map();
  const expenses = selectedYearActiveTransactions().filter(t => ["expense", "refund"].includes(t.type));
  expenses.forEach(t => {
    const key = t.category_name || "未分類";
    if (!rows.has(key)) rows.set(key, { category: key, amount: 0, count: 0, max: 0 });
    const row = rows.get(key);
    const amount = Number(t.amount || 0);
    if (t.type === "expense") {
      row.amount += amount;
      row.count += 1;
      row.max = Math.max(row.max, amount);
    } else if (t.type === "refund") {
      row.amount -= amount;
    }
  });
  const total = Array.from(rows.values()).reduce((sum, r) => sum + Math.max(0, r.amount), 0) || 1;
  return Array.from(rows.values())
    .filter(r => Math.abs(r.amount) > 0 || r.count > 0)
    .map(r => ({
      ...r,
      share: Math.max(0, r.amount) / total,
      avg: r.count ? r.amount / r.count : 0
    }))
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
}

function recurringAnnualizedAmount(r) {
  const amount = Number(r.amount || 0);
  const interval = Math.max(1, Number(r.interval_count || 1));
  const frequency = r.frequency || "monthly";
  if (frequency === "daily") return amount * 365 / interval;
  if (frequency === "weekly") return amount * 52 / interval;
  if (frequency === "monthly") return amount * 12 / interval;
  if (frequency === "quarterly") return amount * 4 / interval;
  if (frequency === "yearly" || frequency === "annual") return amount / interval;
  return amount;
}

function recurringMonthlyAmount(r) {
  return recurringAnnualizedAmount(r) / 12;
}

function recurringReportRows() {
  const accountMap = Object.fromEntries((state.data.accounts || []).map(a => [a.id, a.name]));
  const catMap = Object.fromEntries((state.data.categories || []).map(c => [c.id, c.name]));
  return (state.data.recurring || [])
    .map(r => ({
      name: r.name || "",
      amount: Number(r.amount || 0),
      account: accountMap[r.account_id] || "",
      category: catMap[r.category_id] || "",
      frequency: `${labelOf(r.frequency)} / ${r.interval_count || 1}`,
      monthly: recurringMonthlyAmount(r),
      annual: recurringAnnualizedAmount(r),
      next_due_date: r.next_due_date || "",
      status: r.is_active === false ? "已取消 / 停用" : "使用中",
      merchant: r.merchant || ""
    }))
    .sort((a, b) => Number(b.annual || 0) - Number(a.annual || 0));
}

function monthlyComparisonReportRows() {
  return getMonthlyAnalyticsRows().map(r => {
    const budgetUsed = Number(getCurrentYearSummary().available_budget || 0)
      ? Number(r.expense || 0) / Number(getCurrentYearSummary().available_budget || 1)
      : 0;
    return {
      month: r.label,
      income: r.income,
      expense: r.expense,
      net: r.income - r.expense,
      savingsRate: r.savingsRate === null ? "N/A" : `${fmtNumber(r.savingsRate, 1)}%`,
      budgetShare: `${fmtNumber(budgetUsed * 100, 1)}%`
    };
  });
}

function necessityReportRows() {
  const rows = getHealthRows();
  const total = rows.reduce((sum, r) => sum + Math.max(0, Number(r.amount || 0)), 0) || 1;
  const countMap = new Map();
  expenseRowsForSelectedYear().forEach(t => {
    const key = ["survival", "quality", "luxury", "investment"].includes(t.necessity_level) ? t.necessity_level : "other";
    if (t.type === "expense") countMap.set(key, Number(countMap.get(key) || 0) + 1);
  });
  return rows.map(r => ({
    ...r,
    share: Number(r.amount || 0) / total,
    count: Number(countMap.get(r.key) || 0)
  }));
}

function pnlStatementRows() {
  const tx = selectedYearActiveTransactions();
  const incomeMap = new Map();
  const expenseNatureMap = new Map([
    ["fixed", 0],
    ["variable", 0],
    ["one_time", 0],
    ["other", 0]
  ]);

  tx.forEach(t => {
    const amount = Number(t.amount || 0);
    if (t.type === "income") addAmount(incomeMap, t.category_name || "收入", amount);
    if (t.type === "expense") {
      const key = ["fixed", "variable", "one_time"].includes(t.cashflow_nature) ? t.cashflow_nature : "other";
      expenseNatureMap.set(key, Number(expenseNatureMap.get(key) || 0) + amount);
    }
    if (t.type === "refund") {
      const key = ["fixed", "variable", "one_time"].includes(t.cashflow_nature) ? t.cashflow_nature : "other";
      expenseNatureMap.set(key, Number(expenseNatureMap.get(key) || 0) - amount);
    }
  });

  const incomeRows = mapToSortedRows(incomeMap);
  const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount, 0);
  const fixed = Number(expenseNatureMap.get("fixed") || 0);
  const variable = Number(expenseNatureMap.get("variable") || 0);
  const oneTime = Number(expenseNatureMap.get("one_time") || 0);
  const other = Number(expenseNatureMap.get("other") || 0);
  const totalExpense = fixed + variable + oneTime + other;
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome ? net / totalIncome : null;

  const out = [];
  out.push({ section: "收入", item: "收入合計", amount: totalIncome, ratio: totalIncome ? "100%" : "N/A", note: "" });
  incomeRows.forEach(r => out.push({ section: "收入明細", item: r.name, amount: r.amount, ratio: totalIncome ? `${fmtNumber(r.amount / totalIncome * 100, 1)}%` : "N/A", note: "" }));
  out.push({ section: "支出", item: "固定支出", amount: -fixed, ratio: totalIncome ? `${fmtNumber(fixed / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "支出", item: "變動支出", amount: -variable, ratio: totalIncome ? `${fmtNumber(variable / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "支出", item: "一次性支出", amount: -oneTime, ratio: totalIncome ? `${fmtNumber(oneTime / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "支出", item: "其他 / 未標記", amount: -other, ratio: totalIncome ? `${fmtNumber(other / totalIncome * 100, 1)}% of income` : "N/A", note: "" });
  out.push({ section: "淨額", item: "淨收支", amount: net, ratio: totalIncome ? `${fmtNumber(net / totalIncome * 100, 1)}%` : "N/A", note: "" });
  out.push({ section: "淨額", item: "儲蓄率", amount: savingsRate === null ? "N/A" : `${fmtNumber(savingsRate * 100, 1)}%`, ratio: "", note: "(收入 − 淨支出) / 收入" });
  return out;
}

function balanceSheetReportRows() {
  const rows = accountBalanceRowsMerged ? accountBalanceRowsMerged() : (state.data.accountBalances || []);
  const assetTypes = ["cash", "bank", "e_wallet", "asset", "other"];
  const liabilityTypes = ["credit_card", "loan"];
  const out = [];

  rows.filter(a => a.is_active !== false).forEach(a => {
    const balance = Number(a.current_balance ?? a.initial_balance ?? 0);
    const type = a.type || "other";
    if (liabilityTypes.includes(type) || balance < 0) {
      out.push({
        section: "負債",
        account: a.name || "",
        type: labelOf(type),
        amount: -Math.abs(balance),
        note: type === "asset" ? "負值資產帳戶列為負債" : ""
      });
    } else if (assetTypes.includes(type)) {
      out.push({
        section: "資產",
        account: a.name || "",
        type: labelOf(type),
        amount: balance,
        note: type === "asset" ? "僅採 App 內維護的帳戶餘額；未納入外部股票 / ETF 即時市值" : ""
      });
    }
  });

  const assets = out.filter(r => r.section === "資產").reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const liabilities = out.filter(r => r.section === "負債").reduce((sum, r) => sum + Math.abs(Number(r.amount || 0)), 0);
  out.push({ section: "摘要", account: "資產合計", type: "", amount: assets, note: "" });
  out.push({ section: "摘要", account: "負債合計", type: "", amount: -liabilities, note: "" });
  out.push({ section: "摘要", account: "淨資產", type: "", amount: assets - liabilities, note: "股票 / ETF 市值若不在本 App 管理，未納入" });
  return out;
}

function renderCategoryExpenseReport() {
  const rows = categoryExpenseReportRows();
  return `
    <details class="card collapsible-card" open>
      <summary class="collapsible-summary"><span>分類支出表</span><span class="badge">${rows.length} 類</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "分類", key: "category" },
          { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
          { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
          { label: "筆數", key: "count" },
          { label: "平均單筆", value: r => fmtMoney(r.avg), className: "mono" },
          { label: "最大單筆", value: r => fmtMoney(r.max), className: "mono" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderRecurringReport() {
  const rows = recurringReportRows();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary"><span>固定支出 / 訂閱表</span><span class="badge">${rows.length} 項</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "服務名稱", key: "name" },
          { label: "月化成本", value: r => fmtMoney(r.monthly), className: "mono" },
          { label: "年化成本", value: r => fmtMoney(r.annual), className: "mono" },
          { label: "付款帳戶", key: "account" },
          { label: "分類", key: "category" },
          { label: "週期", key: "frequency" },
          { label: "下次扣款", key: "next_due_date" },
          { label: "狀態", key: "status" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderMonthlyComparisonReport() {
  const rows = monthlyComparisonReportRows();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary"><span>月度比較表</span><span class="badge">${rows.length} 月</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "月份", key: "month" },
          { label: "收入", value: r => fmtMoney(r.income), className: "mono" },
          { label: "支出", value: r => fmtMoney(r.expense), className: "mono" },
          { label: "淨收支", value: r => fmtMoney(r.net), className: "mono" },
          { label: "儲蓄率", key: "savingsRate" },
          { label: "占目前可用預算", key: "budgetShare" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderNecessityReport() {
  const rows = necessityReportRows();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary"><span>必要程度分析</span><span class="badge">necessity_level</span></summary>
      <div class="collapsible-body">
        <p class="metric-sub">若大量交易停留在「其他」，這張表會失真；快速模板最好自動帶入必要程度。</p>
        ${reportTable([
          { label: "必要程度", key: "name" },
          { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
          { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
          { label: "筆數", key: "count" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderPnlReport() {
  const rows = pnlStatementRows();
  return `
    <details class="card collapsible-card" open>
      <summary class="collapsible-summary"><span>收支損益表 / 個人損益表</span><span class="badge">${state.selectedBudgetYear}</span></summary>
      <div class="collapsible-body">
        ${reportTable([
          { label: "區塊", key: "section" },
          { label: "項目", key: "item" },
          { label: "金額", value: r => typeof r.amount === "number" ? fmtMoney(r.amount) : r.amount, className: "mono" },
          { label: "比例", key: "ratio" },
          { label: "備註", key: "note" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderBalanceSheetReport() {
  const rows = balanceSheetReportRows();
  return `
    <details class="card collapsible-card" open>
      <summary class="collapsible-summary"><span>資產負債表</span><span class="badge">App 內帳戶</span></summary>
      <div class="collapsible-body">
        <p class="metric-sub">只採本 App 內帳戶餘額；股票 / ETF 市值如果不在本 App 管理，這張表不會納入外部即時市值。</p>
        ${reportTable([
          { label: "區塊", key: "section" },
          { label: "帳戶 / 項目", key: "account" },
          { label: "類型", key: "type" },
          { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
          { label: "備註", key: "note" }
        ], rows)}
      </div>
    </details>
  `;
}

function renderAddedStatementReports() {
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>新增表格式報表</h3>
        <span class="badge">v54</span>
      </div>
      <p class="metric-sub">這些是可讀、可匯出的表格式報表；比單純圖表更適合對帳與檢查口徑。v54 另外把分類支出表、固定支出 / 訂閱表、必要程度分析做成圖表。</p>
    </div>

    ${renderAdditionalReportCharts()}

    <div class="grid cols-2">
      ${renderPnlReport()}
      ${renderBalanceSheetReport()}
    </div>
    <div class="grid cols-2">
      ${renderCategoryExpenseReport()}
      ${renderRecurringReport()}
      ${renderMonthlyComparisonReport()}
      ${renderNecessityReport()}
    </div>
  `;
}

function renderAdditionalReportCharts() {
  return `
    <div class="grid cols-2">
      <div class="card chart-card">
        <div class="card-title-row">
          <h3>分類支出圖表</h3>
          <span class="badge">長條圖</span>
        </div>
        <div class="chart-canvas-wrap"><canvas id="reportsCategoryExpenseTableChart"></canvas></div>
        <p class="chart-note">依分類支出表繪製。看哪幾類最吃預算。</p>
      </div>

      <div class="card chart-card">
        <div class="card-title-row">
          <h3>固定支出 / 訂閱圖表</h3>
          <span class="badge">長條圖</span>
        </div>
        <div class="chart-canvas-wrap"><canvas id="reportsRecurringChart"></canvas></div>
        <p class="chart-note">依固定支出 / 訂閱表繪製，使用年化成本排序。小月費容易被低估，所以用年化看更清楚。</p>
      </div>

      <div class="card chart-card">
        <div class="card-title-row">
          <h3>必要程度分析圖表</h3>
          <span class="badge">圓環圖</span>
        </div>
        <div class="chart-canvas-wrap"><canvas id="reportsNecessityAnalysisChart"></canvas></div>
        <p class="chart-note">依必要程度分析表繪製。若很多交易是「其他」，這張圖會失真。</p>
      </div>
    </div>
  `;
}

function reportModeTab(group, mode, label) {
  const active = state[group] === mode ? "active" : "";
  return `<button class="seg-btn ${active}" type="button" data-report-group="${escapeHtml(group)}" data-report-mode="${escapeHtml(mode)}">${escapeHtml(label)}</button>`;
}

function reportTabs(group, tabs) {
  return `<div class="segmented report-mode-tabs">${tabs.map(t => reportModeTab(group, t.mode, t.label)).join("")}</div>`;
}

function renderSelectedChartReport() {
  const mode = state.reportChartMode || "categoryExpense";
  const supportsKindToggle = ["categoryExpense", "recurring"].includes(mode);
  const chartKind = supportsKindToggle ? (state.reportChartKind || "bar") : "bar";

  const map = {
    categoryExpense: chartKind === "pie" ? {
      title: "分類支出圖表",
      badge: "圓環圖",
      canvas: "reportsCategoryExpensePieChart",
      note: "Top 5 分類 + 其他。用來看支出比例，不適合看精準排名。"
    } : {
      title: "分類支出圖表",
      badge: "長條圖",
      canvas: "reportsCategoryExpenseTableChart",
      note: "依分類支出表繪製。看哪幾類最吃預算；長條圖仍是預設主視角。"
    },
    recurring: chartKind === "pie" ? {
      title: "固定支出 / 訂閱圖表",
      badge: "圓環圖",
      canvas: "reportsRecurringPieChart",
      note: "Top 5 訂閱 + 其他。用來看固定成本占比；精準比較仍看橫向長條圖。"
    } : {
      title: "固定支出 / 訂閱圖表",
      badge: "橫向長條圖",
      canvas: "reportsRecurringChart",
      note: "依固定支出 / 訂閱表繪製，使用年化成本排序。小月費容易被低估，所以用年化看更清楚。"
    },
    necessity: {
      title: "必要程度分析圖表",
      badge: "圓環圖",
      canvas: "reportsNecessityAnalysisChart",
      note: "依必要程度分析表繪製。若很多交易是「其他」，這張圖會失真。"
    },
    necessityTrend: {
      title: "必要程度月度趨勢",
      badge: "折線圖",
      canvas: "reportsHealthTrend",
      note: "看奢侈娛樂、生活品質、自我投資等必要程度是否逐月膨脹。"
    },
    monthly: {
      title: state.filters.chartScope === "month" ? "本月日度收支趨勢" : "月度收支趨勢",
      badge: "折線圖",
      canvas: "reportsMonthlyChart",
      note: `${chartScopeText()}。用來看收支節奏是否失控。`
    },
    savingsRate: {
      title: "儲蓄率",
      badge: "每月",
      canvas: "reportsSavingsRateChart",
      note: "公式：(收入 − 淨支出) / 收入。轉帳不計入收入或支出。"
    },
    netWorth: {
      title: "帳面淨資產",
      badge: "帳戶餘額",
      canvas: "reportsNetWorthChart",
      note: "依帳戶期初餘額 + 累積收支估算；不等於外部股票 / ETF 即時市值。"
    },
    pareto: {
      title: "帕累托分析：哪幾類吃掉大部分支出",
      badge: "80/20",
      canvas: "reportsParetoChart",
      note: renderParetoSummary(),
      rawNote: true
    },
    budgetUsage: {
      title: "預算使用圖",
      badge: "圓環圖",
      canvas: "reportsBudgetChart",
      note: "看年度可用預算被使用掉多少。"
    },
    categoryNet: {
      title: "分類淨支出排行",
      badge: "長條圖",
      canvas: "reportsCategoryChart",
      note: `${chartScopeText()}。退款會從原分類扣回。`
    },
    budgetCompare: {
      title: "預算 vs 實際",
      badge: "橫向長條圖",
      canvas: "reportsBudgetCompareChart",
      note: "依預算項目比較目前可用額度與實際支出。"
    }
  };

  const c = map[mode] || map.categoryExpense;
  const isExpanded = Boolean(state.reportChartExpanded);
  const chartSizeClass = isExpanded ? "expanded" : "compact";
  const kindToggle = supportsKindToggle ? `
    <div class="segmented chart-kind-tabs">
      <button class="seg-btn ${chartKind === "bar" ? "active" : ""}" type="button" data-report-chart-kind="bar">長條圖</button>
      <button class="seg-btn ${chartKind === "pie" ? "active" : ""}" type="button" data-report-chart-kind="pie">圓環圖</button>
    </div>
  ` : "";

  return `
    <div class="chart-report-body">
      <div class="card-title-row">
        <h3>${escapeHtml(c.title)}</h3>
        <div class="btn-row compact-actions">
          <span class="badge">${escapeHtml(c.badge)}</span>
          <button class="btn small secondary" type="button" data-report-chart-expand="${isExpanded ? "false" : "true"}">${isExpanded ? "收合" : "放大查看"}</button>
        </div>
      </div>
      ${kindToggle}
      <div class="chart-canvas-wrap ${chartSizeClass}"><canvas id="${escapeHtml(c.canvas)}"></canvas></div>
      ${c.rawNote ? c.note : `<p class="chart-note">${escapeHtml(c.note || "")}</p>`}
    </div>
  `;
}

function renderChartReportCenter() {
  return `
    <div class="card chart-card report-center-card">
      <div class="card-title-row">
        <h3>圖表報表</h3>
        <span class="badge">模式切換</span>
      </div>
      ${reportTabs("reportChartMode", [
        { mode: "categoryExpense", label: "分類支出" },
        { mode: "recurring", label: "固定支出 / 訂閱" },
        { mode: "necessity", label: "必要程度" },
        { mode: "necessityTrend", label: "必要程度趨勢" },
        { mode: "monthly", label: "月度比較" },
        { mode: "savingsRate", label: "儲蓄率" },
        { mode: "netWorth", label: "帳面淨資產" },
        { mode: "pareto", label: "帕累托" },
        { mode: "budgetUsage", label: "預算使用" },
        { mode: "categoryNet", label: "分類淨支出" },
        { mode: "budgetCompare", label: "預算 vs 實際" }
      ])}
      ${renderSelectedChartReport()}
    </div>
  `;
}

function renderSelectedTableReport() {
  const mode = state.reportTableMode || "pnl";

  if (mode === "cashflow") {
    return reportTable([
      { label: "區塊", key: "section" },
      { label: "項目", key: "item" },
      { label: "金額", value: r => typeof r.amount === "number" ? fmtMoney(r.amount) : r.amount, className: "mono" },
      { label: "比例", key: "ratio" },
      { label: "備註", key: "note" }
    ], cashflowStatementRows());
  }

  if (mode === "pnl") {
    return reportTable([
      { label: "區塊", key: "section" },
      { label: "項目", key: "item" },
      { label: "金額", value: r => typeof r.amount === "number" ? fmtMoney(r.amount) : r.amount, className: "mono" },
      { label: "比例", key: "ratio" },
      { label: "備註", key: "note" }
    ], pnlStatementRows());
  }

  if (mode === "balance") {
    return `
      <p class="metric-sub">只採本 App 內帳戶餘額；股票 / ETF 市值如果不在本 App 管理，這張表不會納入外部即時市值。</p>
      ${reportTable([
        { label: "區塊", key: "section" },
        { label: "帳戶 / 項目", key: "account" },
        { label: "類型", key: "type" },
        { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
        { label: "備註", key: "note" }
      ], balanceSheetReportRows())}
    `;
  }

  if (mode === "category") {
    return reportTable([
      { label: "分類", key: "category" },
      { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
      { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
      { label: "筆數", key: "count" },
      { label: "平均單筆", value: r => fmtMoney(r.avg), className: "mono" },
      { label: "最大單筆", value: r => fmtMoney(r.max), className: "mono" }
    ], categoryExpenseReportRows());
  }

  if (mode === "recurring") {
    return reportTable([
      { label: "服務名稱", key: "name" },
      { label: "月化成本", value: r => fmtMoney(r.monthly), className: "mono" },
      { label: "年化成本", value: r => fmtMoney(r.annual), className: "mono" },
      { label: "付款帳戶", key: "account" },
      { label: "分類", key: "category" },
      { label: "週期", key: "frequency" },
      { label: "下次扣款", key: "next_due_date" },
      { label: "狀態", key: "status" }
    ], recurringReportRows());
  }

  if (mode === "monthly") {
    return reportTable([
      { label: "月份", key: "month" },
      { label: "收入", value: r => fmtMoney(r.income), className: "mono" },
      { label: "支出", value: r => fmtMoney(r.expense), className: "mono" },
      { label: "淨收支", value: r => fmtMoney(r.net), className: "mono" },
      { label: "儲蓄率", key: "savingsRate" },
      { label: "占目前可用預算", key: "budgetShare" }
    ], monthlyComparisonReportRows());
  }

  if (mode === "necessity") {
    return `
      <p class="metric-sub">若大量交易停留在「其他」，這張表會失真；快速模板最好自動帶入必要程度。</p>
      ${reportTable([
        { label: "必要程度", key: "name" },
        { label: "金額", value: r => fmtMoney(r.amount), className: "mono" },
        { label: "占比", value: r => `${fmtNumber(r.share * 100, 1)}%` },
        { label: "筆數", key: "count" }
      ], necessityReportRows())}
    `;
  }

  return `<div class="empty">未知報表模式。</div>`;
}

function renderTableReportCenter() {
  const labels = {
    cashflow: "現金流量表",
    pnl: "個人損益表",
    balance: "資產負債表",
    category: "分類支出表",
    recurring: "固定支出 / 訂閱表",
    monthly: "月度比較表",
    necessity: "必要程度分析表"
  };
  return `
    <div class="card report-center-card">
      <div class="card-title-row">
        <h3>表格式報表</h3>
        <span class="badge">${escapeHtml(labels[state.reportTableMode] || labels.pnl)}</span>
      </div>
      ${reportTabs("reportTableMode", [
        { mode: "cashflow", label: "現金流量表" },
        { mode: "pnl", label: "個人損益表" },
        { mode: "balance", label: "資產負債表" },
        { mode: "category", label: "分類支出表" },
        { mode: "recurring", label: "固定支出 / 訂閱表" },
        { mode: "monthly", label: "月度比較表" },
        { mode: "necessity", label: "必要程度分析表" }
      ])}
      <div class="report-table-mode-body">
        ${renderSelectedTableReport()}
      </div>
    </div>
  `;
}

function renderSelectedAuditReport() {
  const mode = state.reportAuditMode || "tAccount";

  if (mode === "tAccount") {
    return `
      <div class="card inner-report-card">
        <div class="card-title-row">
          <h3>T 字帳</h3>
          <span class="badge">依科目分組</span>
        </div>
        <p class="metric-sub">支出：借記費用、貸記資產；收入：借記資產、貸記收入；轉帳：借記轉入資產、貸記轉出資產。</p>
        ${renderTAccountCards()}
      </div>
    `;
  }

  if (mode === "entries") {
    return `
      <div class="card inner-report-card">
        <div class="card-title-row">
          <h3>分錄明細</h3>
          <span class="badge">雙分錄</span>
        </div>
        ${renderTAccountTable()}
      </div>
    `;
  }

  return `<div class="empty">未知驗算模式。</div>`;
}

function renderAuditReportCenter() {
  return `
    <div class="card report-center-card audit-report-card">
      <div class="card-title-row">
        <h3>會計 / 底層驗算</h3>
        <span class="badge">雙分錄</span>
      </div>
      <p class="metric-sub">預算項目與預算真實性驗算已保留在年度預算頁；報表頁只留會計底層檢查。</p>
      ${reportTabs("reportAuditMode", [
        { mode: "tAccount", label: "T 字帳" },
        { mode: "entries", label: "分錄明細" }
      ])}
      ${renderSelectedAuditReport()}
    </div>
  `;
}

function renderReports() {
  return `
    ${renderChartToolbar()}
    ${renderAnalyticsSummaryCards()}

    ${renderTableReportCenter()}

    ${renderChartReportCenter()}

    ${renderAuditReportCenter()}

    <details class="card wrapped-card">
      <summary class="collapsible-summary">
        <span>年度財務 Wrapped</span>
        <span class="badge">${state.selectedBudgetYear}</span>
      </summary>
      <div class="collapsible-body">
        ${renderFinancialWrapped()}
      </div>
    </details>
  `;
}

function expenseRowsForSelectedYear() {
  return transactionsForSelectedYear().filter(t => t.status !== "cancelled" && ["expense", "refund"].includes(t.type));
}

function netExpenseForRows(rows) {
  return rows.reduce((sum, t) => {
    if (t.type === "expense") return sum + Number(t.amount || 0);
    if (t.type === "refund") return sum - Number(t.amount || 0);
    return sum;
  }, 0);
}

function healthLevelName(level) {
  return {
    survival: "生存必要",
    quality: "生活品質",
    luxury: "奢侈娛樂",
    investment: "自我投資",
    other: "其他"
  }[level || "other"] || "其他";
}

function getHealthRows() {
  const order = ["survival", "quality", "luxury", "investment", "other"];
  const map = new Map(order.map(k => [k, { key: k, name: healthLevelName(k), amount: 0 }]));
  expenseRowsForSelectedYear().forEach(t => {
    const key = map.has(t.necessity_level) ? t.necessity_level : "other";
    const row = map.get(key);
    row.amount += t.type === "refund" ? -Number(t.amount || 0) : Number(t.amount || 0);
  });
  return order.map(k => map.get(k)).filter(r => Math.abs(Number(r.amount || 0)) > 0);
}

function getHealthTrendRows() {
  const rows = activeMonthBuckets(month => ({
    label: `${month}月`,
    month,
    survival: 0,
    quality: 0,
    luxury: 0,
    investment: 0,
    other: 0
  }));
  const map = new Map(rows.map(r => [r.month, r]));
  expenseRowsForSelectedYear().forEach(t => {
    const month = Number(t.tx_month || 0);
    const row = map.get(month);
    if (!row) return;
    const key = ["survival", "quality", "luxury", "investment"].includes(t.necessity_level) ? t.necessity_level : "other";
    row[key] += t.type === "refund" ? -Number(t.amount || 0) : Number(t.amount || 0);
  });
  return rows;
}


function selectedYearTransactionMonths() {
  return transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .map(t => Number(t.tx_month || 0))
    .filter(m => m >= 1 && m <= 12);
}

function activeMonthRange() {
  const year = Number(state.selectedBudgetYear);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const months = selectedYearTransactionMonths();
  const firstTxMonth = months.length ? Math.min(...months) : (year === currentYear ? currentMonth : 1);
  const lastTxMonth = months.length ? Math.max(...months) : firstTxMonth;

  const endMonth = year === currentYear ? Math.max(currentMonth, lastTxMonth) : lastTxMonth;
  return {
    startMonth: firstTxMonth,
    endMonth: Math.min(12, Math.max(firstTxMonth, endMonth))
  };
}

function activeMonthBuckets(factory) {
  const { startMonth, endMonth } = activeMonthRange();
  const rows = [];
  for (let month = startMonth; month <= endMonth; month += 1) {
    rows.push(factory(month));
  }
  return rows;
}

function getMonthlyAnalyticsRows() {
  const rows = activeMonthBuckets(month => ({
    label: `${month}月`,
    month,
    income: 0,
    expense: 0,
    saving: 0,
    savingsRate: null
  }));

  const map = new Map(rows.map(r => [r.month, r]));
  transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .forEach(t => {
      const month = Number(t.tx_month || 0);
      const row = map.get(month);
      if (!row) return;
      if (t.type === "income") row.income += Number(t.amount || 0);
      if (t.type === "expense") row.expense += Number(t.amount || 0);
      if (t.type === "refund") row.expense -= Number(t.amount || 0);
    });

  rows.forEach(r => {
    r.saving = r.income - r.expense;
    r.savingsRate = r.income > 0 ? Math.round((r.saving / r.income) * 1000) / 10 : null;
  });
  return rows;
}

function getNetWorthRows() {
  const initial = (state.data.accounts || []).reduce((sum, a) => sum + Number(a.initial_balance || 0), 0);
  const allTx = allTransactionsEnriched()
    .filter(t => t.status !== "cancelled")
    .sort((a, b) => String(a.transaction_date || "").localeCompare(String(b.transaction_date || "")));

  let cumulativeBeforeYear = 0;
  allTx.forEach(t => {
    const year = Number(t.tx_year || 0);
    if (year >= Number(state.selectedBudgetYear)) return;
    if (t.type === "income") cumulativeBeforeYear += Number(t.amount || 0);
    if (t.type === "expense") cumulativeBeforeYear -= Number(t.amount || 0);
    if (t.type === "refund") cumulativeBeforeYear += Number(t.amount || 0);
  });

  let cumulative = cumulativeBeforeYear;
  const monthRows = activeMonthBuckets(month => ({ label: `${month}月`, month, netWorth: null }));

  return monthRows.map(row => {
    allTx
      .filter(t => Number(t.tx_year) === Number(state.selectedBudgetYear) && Number(t.tx_month) === row.month)
      .forEach(t => {
        if (t.type === "income") cumulative += Number(t.amount || 0);
        if (t.type === "expense") cumulative -= Number(t.amount || 0);
        if (t.type === "refund") cumulative += Number(t.amount || 0);
      });
    return { ...row, netWorth: initial + cumulative };
  });
}

function getParetoRows(limit = 12) {
  const totalRows = getCategoryNetExpenseRows(999);
  const total = totalRows.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 1;
  let cumulative = 0;
  return totalRows.slice(0, limit).map((r, index) => {
    cumulative += Number(r.amount || 0);
    return {
      rank: index + 1,
      name: r.name,
      amount: Number(r.amount || 0),
      cumulativePct: Math.round(cumulative / total * 1000) / 10
    };
  });
}

function renderParetoSummary() {
  const rows = getParetoRows(999);
  if (!rows.length) return `<p class="chart-note">尚無支出資料。</p>`;
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const threshold = total * 0.8;
  let cumulative = 0;
  let count = 0;
  for (const row of rows) {
    cumulative += row.amount;
    count += 1;
    if (cumulative >= threshold) break;
  }
  const categoryShare = rows.length ? count / rows.length * 100 : 0;
  return `<p class="chart-note">前 ${count} 個分類約吃掉 80% 支出，約占全部支出分類的 ${fmtNumber(categoryShare, 1)}%。若這些分類不是你真正重視的項目，就該優先砍。</p>`;
}

function getFinancialWrappedData() {
  const txRows = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  const expenseRows = txRows.filter(t => t.type === "expense");
  const netExpense = netExpenseForRows(txRows.filter(t => ["expense", "refund"].includes(t.type)));
  const income = txRows.filter(t => t.type === "income").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const saving = income - netExpense;
  const topCategory = getCategoryNetExpenseRows(1)[0];
  const topMerchant = getMerchantRows(1)[0];
  const biggestExpense = [...expenseRows].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const monthly = getMonthlyAnalyticsRows();
  const bestMonth = [...monthly].filter(m => m.income || m.expense).sort((a, b) => Number(b.saving || 0) - Number(a.saving || 0))[0];
  const worstMonth = [...monthly].filter(m => m.income || m.expense).sort((a, b) => Number(a.saving || 0) - Number(b.saving || 0))[0];
  return { income, netExpense, saving, topCategory, topMerchant, biggestExpense, bestMonth, worstMonth, txCount: txRows.length };
}

function renderFinancialWrapped() {
  const w = getFinancialWrappedData();
  return `
    <div class="wrapped-grid">
      <div class="wrapped-tile"><span>今年收入</span><strong>${fmtMoney(w.income)}</strong></div>
      <div class="wrapped-tile"><span>今年淨支出</span><strong>${fmtMoney(w.netExpense)}</strong></div>
      <div class="wrapped-tile"><span>今年淨收支</span><strong class="${w.saving >= 0 ? "good" : "bad"}">${fmtMoney(w.saving)}</strong></div>
      <div class="wrapped-tile"><span>交易筆數</span><strong>${fmtNumber(w.txCount)}</strong></div>
      <div class="wrapped-tile"><span>最大支出分類</span><strong>${escapeHtml(w.topCategory?.name || "N/A")}</strong><em>${fmtMoney(w.topCategory?.amount || 0)}</em></div>
      <div class="wrapped-tile"><span>最大商家</span><strong>${escapeHtml(w.topMerchant?.name || "N/A")}</strong><em>${fmtMoney(w.topMerchant?.amount || 0)}</em></div>
      <div class="wrapped-tile"><span>最大單筆支出</span><strong>${escapeHtml(w.biggestExpense?.merchant || w.biggestExpense?.category_name || "N/A")}</strong><em>${fmtMoney(w.biggestExpense?.amount || 0)}</em></div>
      <div class="wrapped-tile"><span>最佳月份</span><strong>${escapeHtml(w.bestMonth?.label || "N/A")}</strong><em>${fmtMoney(w.bestMonth?.saving || 0)}</em></div>
    </div>
  `;
}

function renderChartToolbar() {
  const cats = state.data.categories.filter(c => c.is_active !== false);
  return `
    <div class="card filters-card">
      <div class="filters">
        <label>圖表篩選</label>
        <div class="segmented inline">
          <button class="seg-btn ${state.filters.chartScope === "year" ? "active" : ""}" type="button" data-chart-scope="year">本年</button>
          <button class="seg-btn ${state.filters.chartScope === "month" ? "active" : ""}" type="button" data-chart-scope="month">本月</button>
        </div>
        <div>
          <label>分類</label>
          <select class="input" id="chartCategoryFilter">
            <option value="">全部分類</option>
            ${cats.map(c => `<option value="${escapeHtml(c.id)}" ${state.filters.chartCategory === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
          <p class="metric-sub">${escapeHtml(chartScopeText())}</p>
        </div>
      </div>
    </div>
  `;
}

function chartScopeText() {
  const scope = state.filters.chartScope === "month" ? "本月" : `${state.selectedBudgetYear} 年`;
  const cat = state.filters.chartCategory ? state.data.categories.find(c => c.id === state.filters.chartCategory)?.name : "全部分類";
  return `${scope}｜${cat || "全部分類"}`;
}

function chartTransactions() {
  const now = new Date();
  return transactionsForSelectedYear()
    .filter(t => t.status !== "cancelled")
    .filter(t => {
      if (state.filters.chartScope !== "month") return true;
      return Number(t.tx_month) === now.getMonth() + 1 && Number(t.tx_year) === Number(state.selectedBudgetYear);
    })
    .filter(t => !state.filters.chartCategory || t.category_id === state.filters.chartCategory);
}

function getBudgetUsageChartData() {
  const s = getCurrentYearSummary();
  const used = Math.max(0, Number(s.actual_expense || 0));
  const remaining = Math.max(0, Number(s.remaining_budget || 0));
  if (!used && !remaining) return null;
  return {
    labels: ["已使用", "剩餘"],
    data: [used, remaining],
    colors: ["rgba(10, 132, 255, 0.85)", "rgba(48, 209, 88, 0.85)"]
  };
}

function getCategoryNetExpenseRows(limit = 8) {
  const map = new Map();
  chartTransactions().forEach(t => {
    if (!["expense", "refund"].includes(t.type)) return;
    const name = t.category_name || "未分類";
    const current = map.get(name) || 0;
    const delta = t.type === "expense" ? Number(t.amount || 0) : -Number(t.amount || 0);
    map.set(name, current + delta);
  });
  return Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount: Math.max(0, amount) }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function getMerchantRows(limit = 10) {
  const map = new Map();
  chartTransactions().forEach(t => {
    if (t.type !== "expense") return;
    const name = t.merchant || t.category_name || "未命名";
    map.set(name, (map.get(name) || 0) + Number(t.amount || 0));
  });
  return Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function getTrendRows() {
  const rows = chartTransactions();
  if (state.filters.chartScope === "month") {
    const now = new Date();
    const year = Number(state.selectedBudgetYear);
    const month = now.getMonth() + 1;
    const days = new Date(year, month, 0).getDate();
    const buckets = Array.from({ length: days }, (_, i) => ({ label: String(i + 1), day: i + 1, income: 0, expense: 0, net: 0 }));
    rows.forEach(t => {
      const d = new Date(`${t.transaction_date}T00:00:00`).getDate();
      const bucket = buckets[d - 1];
      if (!bucket) return;
      if (t.type === "income") bucket.income += Number(t.amount || 0);
      if (t.type === "expense") bucket.expense += Number(t.amount || 0);
      if (t.type === "refund") bucket.expense -= Number(t.amount || 0);
    });
    buckets.forEach(b => { b.net = b.income - b.expense; });
    return buckets;
  }

  const buckets = activeMonthBuckets(month => ({ label: `${month}月`, month, income: 0, expense: 0, net: 0 }));
  const map = new Map(buckets.map(b => [b.month, b]));
  rows.forEach(t => {
    const month = Number(t.tx_month || 0);
    const bucket = map.get(month);
    if (!bucket) return;
    if (t.type === "income") bucket.income += Number(t.amount || 0);
    if (t.type === "expense") bucket.expense += Number(t.amount || 0);
    if (t.type === "refund") bucket.expense -= Number(t.amount || 0);
  });
  buckets.forEach(b => { b.net = b.income - b.expense; });
  return buckets;
}

function getBudgetCompareRows(limit = 8) {
  let rows = budgetItemSummariesForSelectedYear()
    .filter(r => Number(r.current_budget_amount || r.planned_amount || 0) > 0);

  if (state.filters.chartCategory) {
    rows = rows.filter(r => r.category_id === state.filters.chartCategory);
  }

  return rows
    .sort((a, b) => Number(b.current_budget_amount || 0) - Number(a.current_budget_amount || 0))
    .slice(0, limit)
    .map(r => ({
      name: r.name,
      planned: Number(r.current_budget_amount || 0),
      actual: Number(r.actual_amount || 0),
      remaining: Number(r.remaining_amount || 0)
    }));
}

function shortMoney(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  if (abs >= 10000) return `${fmtNumber(n / 10000, abs >= 100000 ? 0 : 1)}萬`;
  return fmtNumber(n, 0);
}

function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  return {
    text: css.getPropertyValue("--text").trim() || "#f8fafc",
    muted: css.getPropertyValue("--muted").trim() || "#94a3b8",
    grid: "rgba(148, 163, 184, 0.15)",
    blue: "rgba(10, 132, 255, 0.92)",
    green: "rgba(48, 209, 88, 0.88)",
    red: "rgba(255, 69, 58, 0.88)",
    purple: "rgba(94, 92, 230, 0.92)",
    orange: "rgba(255, 159, 10, 0.88)"
  };
}

function destroyCharts() {
  Object.keys(chartInstances).forEach(key => {
    try { chartInstances[key]?.destroy?.(); } catch (error) { console.warn(error); }
    delete chartInstances[key];
  });
}

function initCharts() {
  if (!window.Chart) return;
  if (!["overview", "reports"].includes(state.activeTab)) return;
  const theme = chartTheme();
  const moneyTick = value => shortMoney(value);
  const moneyTooltip = value => fmtMoney(value);

  Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Segoe UI", sans-serif';

  const tooltipValue = ctx => {
    // v34：修正 line chart tooltip。
    // Chart.js 線圖 parsed.x 是資料點索引，不能拿來當金額；金額應取 parsed.y。
    if (ctx.chart?.config?.type === "line") return ctx.parsed?.y;
    if (ctx.chart?.config?.type === "bar") return ctx.parsed?.x ?? ctx.parsed?.y;
    if (typeof ctx.parsed === "number") return ctx.parsed;
    return ctx.parsed?.y ?? ctx.parsed?.x ?? 0;
  };

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 240 },
    plugins: {
      legend: { labels: { color: theme.text, usePointStyle: true, pointStyle: "circle", boxWidth: 8, boxHeight: 8 } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset?.label || ctx.label}：${moneyTooltip(tooltipValue(ctx))}` } }
    }
  };

  const makeDoughnut = id => {
    const el = document.getElementById(id);
    const chartData = getBudgetUsageChartData();
    if (!el || !chartData) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: { labels: chartData.labels, datasets: [{ data: chartData.data, backgroundColor: chartData.colors, borderWidth: 0, hoverOffset: 4 }] },
      options: {
        ...baseOptions,
        cutout: "70%",
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.label}：${moneyTooltip(ctx.parsed)}` } }
        }
      }
    });
  };

  const makeCategoryBar = id => {
    const el = document.getElementById(id);
    const rows = getCategoryNetExpenseRows(8);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{ label: "淨支出", data: rows.map(r => r.amount), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false }]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        plugins: { ...baseOptions.plugins, legend: { display: false } },
        scales: {
          x: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.text }, grid: { display: false } }
        }
      }
    });
  };

  const makeTrendLine = id => {
    const el = document.getElementById(id);
    const rows = getTrendRows();
    const hasData = rows.some(r => r.income || r.expense || r.net);
    if (!el || !hasData) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: "收入", data: rows.map(r => r.income), borderColor: theme.green, backgroundColor: "rgba(48, 209, 88, 0.12)", tension: 0.32, pointRadius: 2, fill: false },
          { label: "淨支出", data: rows.map(r => r.expense), borderColor: theme.red, backgroundColor: "rgba(255, 69, 58, 0.12)", tension: 0.32, pointRadius: 2, fill: false },
          { label: "淨現金流", data: rows.map(r => r.net), borderColor: theme.purple, backgroundColor: "rgba(94, 92, 230, 0.12)", tension: 0.32, pointRadius: 2, fill: false }
        ]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { ticks: { color: theme.muted, maxTicksLimit: state.filters.chartScope === "month" ? 8 : 12 }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } }
        }
      }
    });
  };

  const makeBudgetCompare = id => {
    const el = document.getElementById(id);
    const rows = getBudgetCompareRows(8);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [
          { label: "預算", data: rows.map(r => r.planned), backgroundColor: theme.green, borderRadius: 10, borderSkipped: false },
          { label: "實際", data: rows.map(r => r.actual), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false }
        ]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        scales: {
          x: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.text }, grid: { display: false } }
        }
      }
    });
  };


  const makeHealthDoughnut = id => {
    const el = document.getElementById(id);
    const rows = getHealthRows();
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{
          data: rows.map(r => Math.max(0, r.amount)),
          backgroundColor: [theme.green, theme.blue, theme.red, theme.purple, theme.orange],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        ...baseOptions,
        cutout: "68%",
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.label}：${moneyTooltip(ctx.parsed)}` } }
        }
      }
    });
  };

  const makeHealthTrend = id => {
    const el = document.getElementById(id);
    const rows = getHealthTrendRows();
    const hasData = rows.some(r => r.survival || r.quality || r.luxury || r.investment || r.other);
    if (!el || !hasData) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: "生存必要", data: rows.map(r => r.survival), borderColor: theme.green, tension: 0.3, pointRadius: 2 },
          { label: "生活品質", data: rows.map(r => r.quality), borderColor: theme.blue, tension: 0.3, pointRadius: 2 },
          { label: "奢侈娛樂", data: rows.map(r => r.luxury), borderColor: theme.red, tension: 0.3, pointRadius: 2 },
          { label: "自我投資", data: rows.map(r => r.investment), borderColor: theme.purple, tension: 0.3, pointRadius: 2 }
        ]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { ticks: { color: theme.muted }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } }
        }
      }
    });
  };

  const makeSavingsRate = id => {
    const el = document.getElementById(id);
    const rows = getMonthlyAnalyticsRows();
    const hasData = rows.some(r => r.income || r.expense);
    if (!el || !hasData) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [
          { label: "儲蓄率 %", data: rows.map(r => r.savingsRate), borderColor: theme.purple, backgroundColor: "rgba(94, 92, 230, 0.12)", tension: 0.32, yAxisID: "y1", pointRadius: 2 },
          { label: "收入", data: rows.map(r => r.income), borderColor: theme.green, backgroundColor: "rgba(48, 209, 88, 0.10)", tension: 0.32, yAxisID: "y", pointRadius: 2 },
          { label: "淨支出", data: rows.map(r => r.expense), borderColor: theme.red, backgroundColor: "rgba(255, 69, 58, 0.10)", tension: 0.32, yAxisID: "y", pointRadius: 2 }
        ]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => ctx.dataset.yAxisID === "y1" ? `${ctx.dataset.label}：${fmtNumber(ctx.parsed.y, 1)}%` : `${ctx.dataset.label}：${moneyTooltip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted }, grid: { color: theme.grid } },
          y: { position: "left", ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y1: { position: "right", ticks: { color: theme.muted, callback: v => `${v}%` }, grid: { drawOnChartArea: false } }
        }
      }
    });
  };

  const makeNetWorth = id => {
    const el = document.getElementById(id);
    const rows = getNetWorthRows();
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "line",
      data: {
        labels: rows.map(r => r.label),
        datasets: [{ label: "帳面淨資產", data: rows.map(r => r.netWorth), borderColor: theme.green, backgroundColor: "rgba(48, 209, 88, 0.12)", tension: 0.32, pointRadius: 2, fill: false }]
      },
      options: {
        ...baseOptions,
        scales: {
          x: { ticks: { color: theme.muted }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } }
        }
      }
    });
  };

  const makePareto = id => {
    const el = document.getElementById(id);
    const rows = getParetoRows(12);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [
          { label: "分類淨支出", data: rows.map(r => r.amount), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false, yAxisID: "y" },
          { label: "累積占比 %", data: rows.map(r => r.cumulativePct), type: "line", borderColor: theme.orange, backgroundColor: "rgba(255, 159, 10, 0.16)", tension: 0.25, yAxisID: "y1", pointRadius: 3 }
        ]
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => ctx.dataset.yAxisID === "y1" ? `${ctx.dataset.label}：${fmtNumber(ctx.parsed.y, 1)}%` : `${ctx.dataset.label}：${moneyTooltip(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted, maxRotation: 0, autoSkip: false }, grid: { display: false } },
          y: { position: "left", ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y1: { position: "right", min: 0, max: 100, ticks: { color: theme.muted, callback: v => `${v}%` }, grid: { drawOnChartArea: false } }
        }
      }
    });
  };

  const makeCategoryExpenseReportBar = id => {
    const el = document.getElementById(id);
    const rows = categoryExpenseReportRows().slice(0, 10);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.category),
        datasets: [
          { label: "分類支出", data: rows.map(r => r.amount), backgroundColor: theme.blue, borderRadius: 10, borderSkipped: false }
        ]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.label}：${moneyTooltip(ctx.parsed.x)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.muted }, grid: { display: false } }
        }
      }
    });
  };

  const makeRecurringReportBar = id => {
    const el = document.getElementById(id);
    const rows = recurringReportRows().slice(0, 10);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "bar",
      data: {
        labels: rows.map(r => r.name),
        datasets: [
          { label: "年化成本", data: rows.map(r => r.annual), backgroundColor: theme.purple, borderRadius: 10, borderSkipped: false },
          { label: "月化成本", data: rows.map(r => r.monthly), backgroundColor: "rgba(96, 165, 250, 0.35)", borderRadius: 10, borderSkipped: false }
        ]
      },
      options: {
        ...baseOptions,
        indexAxis: "y",
        plugins: {
          ...baseOptions.plugins,
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}：${moneyTooltip(ctx.parsed.x)}` } }
        },
        scales: {
          x: { ticks: { color: theme.muted, callback: moneyTick }, grid: { color: theme.grid } },
          y: { ticks: { color: theme.text }, grid: { display: false } }
        }
      }
    });
  };

  const topFivePlusOther = (rows, nameKey, valueKey) => {
    const clean = rows
      .map(r => ({ name: String(r[nameKey] || "未命名"), amount: Math.max(0, Number(r[valueKey] || 0)) }))
      .filter(r => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const top = clean.slice(0, 5);
    const otherAmount = clean.slice(5).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    if (otherAmount > 0) top.push({ name: "其他", amount: otherAmount });
    return top;
  };

  const makeCategoryExpensePie = id => {
    const el = document.getElementById(id);
    const rows = topFivePlusOther(categoryExpenseReportRows(), "category", "amount");
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{
          data: rows.map(r => r.amount),
          backgroundColor: [theme.blue, theme.purple, theme.green, theme.orange, theme.red, "rgba(148, 163, 184, 0.55)"],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        ...baseOptions,
        cutout: "70%",
        plugins: {
          ...baseOptions.plugins,
          legend: { ...baseOptions.plugins.legend, position: "bottom" },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 1;
                const value = Number(ctx.parsed || 0);
                return `${ctx.label}：${moneyTooltip(value)}（${fmtNumber(value / total * 100, 1)}%）`;
              }
            }
          }
        }
      }
    });
  };

  const makeRecurringPie = id => {
    const el = document.getElementById(id);
    const rows = topFivePlusOther(recurringReportRows(), "name", "annual");
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{
          data: rows.map(r => r.amount),
          backgroundColor: [theme.purple, theme.blue, theme.green, theme.orange, theme.red, "rgba(148, 163, 184, 0.55)"],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        ...baseOptions,
        cutout: "70%",
        plugins: {
          ...baseOptions.plugins,
          legend: { ...baseOptions.plugins.legend, position: "bottom" },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 1;
                const value = Number(ctx.parsed || 0);
                return `${ctx.label}：${moneyTooltip(value)}（${fmtNumber(value / total * 100, 1)}%）`;
              }
            }
          }
        }
      }
    });
  };

  const makeNecessityAnalysisDoughnut = id => {
    const el = document.getElementById(id);
    const rows = necessityReportRows().filter(r => Number(r.amount || 0) > 0);
    if (!el || !rows.length) return;
    chartInstances[id] = new Chart(el, {
      type: "doughnut",
      data: {
        labels: rows.map(r => r.name),
        datasets: [{
          data: rows.map(r => r.amount),
          backgroundColor: [theme.green, theme.blue, theme.orange, theme.purple, theme.red].slice(0, rows.length),
          borderWidth: 0
        }]
      },
      options: {
        ...baseOptions,
        cutout: "70%",
        plugins: {
          ...baseOptions.plugins,
          legend: { ...baseOptions.plugins.legend, position: "bottom" },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 1;
                const value = Number(ctx.parsed || 0);
                return `${ctx.label}：${moneyTooltip(value)}（${fmtNumber(value / total * 100, 1)}%）`;
              }
            }
          }
        }
      }
    });
  };


  ["overviewBudgetChart", "reportsBudgetChart"].forEach(makeDoughnut);
  ["overviewCategoryChart", "reportsCategoryChart"].forEach(makeCategoryBar);
  ["overviewMonthlyChart", "reportsMonthlyChart"].forEach(makeTrendLine);
  makeBudgetCompare("reportsBudgetCompareChart");
  makeHealthDoughnut("reportsHealthDoughnut");
  makeHealthTrend("reportsHealthTrend");
  makeSavingsRate("reportsSavingsRateChart");
  makeNetWorth("reportsNetWorthChart");
  makePareto("reportsParetoChart");
  makeCategoryExpenseReportBar("reportsCategoryExpenseTableChart");
  makeCategoryExpensePie("reportsCategoryExpensePieChart");
  makeRecurringReportBar("reportsRecurringChart");
  makeRecurringPie("reportsRecurringPieChart");
  makeNecessityAnalysisDoughnut("reportsNecessityAnalysisChart");
}


function field(label, html) {
  return `<div class="field"><label>${escapeHtml(label)}</label>${html}</div>`;
}

function selectOpts(values, selected) {
  return values.map(v => `<option value="${escapeHtml(v)}" ${String(v) === String(selected) ? "selected" : ""}>${escapeHtml(labelOf(v))}</option>`).join("");
}

function readForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach(k => {
    if (data[k] === "") data[k] = null;
  });
  return data;
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
}

function boolValue(value) {
  return value === "true" || value === true;
}

function formatSupabaseError(error) {
  if (!error) return "未知錯誤";
  return [
    error.message,
    error.details ? `細節：${error.details}` : "",
    error.hint ? `提示：${error.hint}` : "",
    error.code ? `代碼：${error.code}` : ""
  ].filter(Boolean).join("｜");
}

function assertSavedRow(table, data, action = "寫入") {
  if (!data) {
    throw new Error(`${action}失敗：資料庫沒有回傳資料。可能是權限、資料表規則、RLS 或前端欄位問題。表：${table}`);
  }
  if (!data.id) {
    throw new Error(`${action}失敗：資料庫有回應，但沒有回傳 id。表：${table}`);
  }
  return data;
}

function cleanPayload(payload) {
  const clean = { ...payload };
  Object.keys(clean).forEach(k => {
    if (clean[k] === undefined) delete clean[k];
  });
  return clean;
}

async function verifyRowExists(table, id, action = "寫入") {
  const { data, error } = await state.client
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`${action}驗證失敗：${formatSupabaseError(error)}`);
  if (!data || !data.id) {
    throw new Error(`${action}驗證失敗：資料庫查不到 id=${id}。表：${table}`);
  }
  return data;
}

function makeUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function normalizeForWrite(payload) {
  const clean = cleanPayload(payload);
  Object.keys(clean).forEach(k => {
    if (clean[k] === "") clean[k] = null;
  });
  return clean;
}

async function findExistingYearId(budgetYear) {
  if (!budgetYear) return null;
  const { data, error } = await state.client
    .from("years")
    .select("id,budget_year")
    .eq("budget_year", Number(budgetYear))
    .maybeSingle();

  if (error) throw new Error(`查詢既有年度失敗：${formatSupabaseError(error)}`);
  return data?.id || null;
}

async function writeRow(table, payload, options = {}) {
  const clean = normalizeForWrite(payload);
  let id = clean.id || null;
  let action = id ? "更新" : "新增";

  if (!id && table === "years" && clean.budget_year) {
    id = await findExistingYearId(clean.budget_year);
    if (id) {
      clean.id = id;
      action = "更新";
    }
  }

  let response;
  if (action === "更新") {
    const updatePayload = { ...clean };
    delete updatePayload.id;
    response = await state.client
      .from(table)
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();
  } else {
    response = await state.client
      .from(table)
      .insert(clean)
      .select("*")
      .single();
  }

  if (response.error) {
    const message = `${action}失敗：${formatSupabaseError(response.error)}｜表：${table}`;
    markWriteStatus(false, { action, table, error: formatSupabaseError(response.error) });
    throw new Error(message);
  }

  const saved = assertSavedRow(table, response.data, action);

  if (options.expect) {
    for (const [key, expected] of Object.entries(options.expect)) {
      const actual = saved[key];
      if (String(actual ?? "") !== String(expected ?? "")) {
        throw new Error(`${action}驗證失敗：欄位 ${key} 沒有寫入成功。預期=${expected ?? "空"}，實際=${actual ?? "空"}。表：${table}`);
      }
    }
  }

  const verified = await verifyRowExists(table, saved.id, action);
  markWriteStatus(true, { action, table });
  return verified;
}

async function upsert(table, payload, options = {}) {
  return await writeRow(table, payload, options);
}

async function insert(table, payload) {
  if (Array.isArray(payload)) {
    const rows = [];
    for (const row of payload) rows.push(await writeRow(table, row));
    return rows;
  }
  return await writeRow(table, payload);
}

async function removeRow(table, id) {
  if (!id) throw new Error("刪除失敗：缺少資料 id");

  const before = await state.client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (before.error) throw new Error(`刪除前檢查失敗：${formatSupabaseError(before.error)}｜表：${table}`);
  if (!before.data) throw new Error(`刪除失敗：資料不存在。表：${table}，id=${id}`);

  const response = await state.client
    .from(table)
    .delete()
    .eq("id", id);

  if (response.error) {
    markWriteStatus(false, { action: "刪除", table, error: formatSupabaseError(response.error) });
    throw new Error(`刪除失敗：${formatSupabaseError(response.error)}｜表：${table}`);
  }

  const verify = await state.client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (verify.error) {
    throw new Error(`刪除驗證失敗：${formatSupabaseError(verify.error)}｜表：${table}`);
  }
  if (verify.data) {
    const message = `刪除驗證失敗：資料仍存在。表：${table}，id=${id}`;
    markWriteStatus(false, { action: "刪除", table, error: message });
    throw new Error(message);
  }

  markWriteStatus(true, { action: "刪除", table });
  return true;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formId = form.getAttribute("id") || "";
  try {
    let saved = null;
    switch (formId) {
      case "txForm":
        saved = await saveTransaction(form);
        break;
      case "yearForm":
        saved = await saveYear(form);
        break;
      case "budgetItemForm":
        saved = await saveBudgetItem(form);
        break;
      case "budgetContributionForm":
        saved = await saveBudgetContribution(form);
        break;
      case "globalBudgetContributionForm":
        saved = await saveGlobalBudgetContribution(form);
        break;
      case "budgetMovementForm":
        saved = await saveBudgetMovement(form);
        break;
      case "accountForm":
        saved = await saveAccount(form);
        break;
      case "categoryForm":
        saved = await saveCategory(form);
        break;
      case "tagForm":
        saved = await saveTag(form);
        break;
      case "recurringForm":
        throw new Error("訂閱表單不應進入通用儲存流程。請確認目前前端版本為 v14。");
      case "creditCardForm":
        saved = await saveCreditCard(form);
        break;
      case "loanForm":
        saved = await saveLoan(form);
        break;
      case "goalForm":
        saved = await saveGoal(form);
        break;
      case "quickTemplateForm":
        saved = await saveQuickTemplate(form);
        break;
      case "preferencesForm":
        savePreferences(form);
        saved = { id: "local" };
        break;
      default:
        throw new Error(`未知表單：${formId || "無 id"}`);
    }

    await loadAll();
    clearEditing();
    render();
    showAlert(`v59 驗證通過：${tableLabel(formToTable(formId))} 已真正寫入資料庫｜id=${escapeHtml(saved?.id || "無")}`, "good");
  } catch (error) {
    showAlert(`儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}

function formToTable(formId) {
  return {
    txForm: "transactions",
    yearForm: "years",
    budgetItemForm: "budget_items",
    budgetContributionForm: "budget_contributions",
    budgetMovementForm: "budget_movements",
    accountForm: "accounts",
    categoryForm: "categories",
    tagForm: "tags",
    recurringForm: "recurring_transactions",
    creditCardForm: "credit_cards",
    loanForm: "loans",
    goalForm: "goals",
    quickTemplateForm: "quick_templates",
    preferencesForm: "本機偏好"
  }[formId] || formId;
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const saved = await saveRecurring(form);
    const rows = await loadRecurringOnly();
    const found = rows.some(row => String(row.id) === String(saved.id));

    if (!found) {
      throw new Error(`v14 驗證失敗：寫入後重新讀取列表，找不到 id=${saved.id || "無"}。目前列表 ${rows.length} 筆。`);
    }

    state.editing.recurring = null;
    render();
    showAlert(`v59 驗證通過：訂閱已真正寫入資料庫｜${escapeHtml(saved.name)}｜目前列表 ${rows.length} 筆。`, "good");
  } catch (error) {
    showAlert(`訂閱儲存失敗：${escapeHtml(error.message)}`, "bad");
  }
}


function savePreferences(form) {
  const d = readForm(form);
  setAppPreference("default_account_expense", d.default_account_expense);
  setAppPreference("default_account_income", d.default_account_income);
  setAppPreference("default_account_transfer", d.default_account_transfer);
  setAppPreference("default_account_refund", d.default_account_refund);
  return { id: "local" };
}


function accountLabel(accountId) {
  const acc = state.data.accounts.find(a => a.id === accountId) || {};
  return `${labelOf(acc.type || "asset")}：${acc.name || "未命名帳戶"}`;
}

function categoryLabel(categoryId, prefix = "分類") {
  const cat = state.data.categories.find(c => c.id === categoryId) || {};
  return `${prefix}：${cat.name || "未分類"}`;
}

function makeEntry(tx, side, payload = {}) {
  return {
    transaction_id: tx.id,
    entry_date: tx.transaction_date,
    side,
    entry_type: payload.entry_type || "account",
    account_id: payload.account_id || null,
    category_id: payload.category_id || null,
    budget_item_id: payload.budget_item_id || null,
    label: payload.label || "",
    amount: Math.abs(Number(payload.amount ?? tx.amount ?? 0)),
    note: payload.note || tx.note || null,
    sort_order: payload.sort_order || 0
  };
}

async function replaceTransactionSplits(transactionId, splitRows) {
  await state.client.from("transaction_splits").delete().eq("transaction_id", transactionId);
  if (!splitRows.length) return [];
  const rows = splitRows.map(s => ({ transaction_id: transactionId, ...s }));
  const { data, error } = await state.client.from("transaction_splits").insert(rows).select("*");
  if (error) throw new Error(`拆帳寫入失敗：${formatSupabaseError(error)}`);
  return data || [];
}

async function replaceTransactionEntries(transactionId, entries) {
  await state.client.from("transaction_entries").delete().eq("transaction_id", transactionId);
  if (!entries.length) return [];
  const { data, error } = await state.client.from("transaction_entries").insert(entries).select("*");
  if (error) throw new Error(`分錄寫入失敗：${formatSupabaseError(error)}`);
  return data || [];
}

function buildEntriesForTransaction(tx, splitRows = []) {
  const amount = Math.abs(Number(tx.amount || 0));
  const memo = tx.merchant || tx.note || labelOf(tx.type);
  const entries = [];
  const add = (side, payload) => entries.push(makeEntry(tx, side, { note: memo, ...payload }));

  if (tx.type === "expense") {
    const splits = splitRows.length ? splitRows : [{ category_id: tx.category_id, budget_item_id: tx.budget_item_id, amount }];
    splits.forEach((s, idx) => add("debit", {
      entry_type: "expense",
      category_id: s.category_id || null,
      budget_item_id: s.budget_item_id || null,
      label: categoryLabel(s.category_id, "費用"),
      amount: s.amount,
      sort_order: idx + 1
    }));
    add("credit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 99 });
  } else if (tx.type === "refund") {
    add("debit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 1 });
    const splits = splitRows.length ? splitRows : [{ category_id: tx.category_id, budget_item_id: tx.budget_item_id, amount }];
    splits.forEach((s, idx) => add("credit", {
      entry_type: "expense",
      category_id: s.category_id || null,
      budget_item_id: s.budget_item_id || null,
      label: categoryLabel(s.category_id, "費用退款"),
      amount: s.amount,
      sort_order: idx + 2
    }));
  } else if (tx.type === "income") {
    add("debit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 1 });
    add("credit", { entry_type: "income", category_id: tx.category_id || null, label: categoryLabel(tx.category_id, "收入"), amount, sort_order: 2 });
  } else if (tx.type === "transfer") {
    add("debit", { entry_type: "account", account_id: tx.to_account_id, label: accountLabel(tx.to_account_id), amount, sort_order: 1 });
    add("credit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 2 });
  } else if (tx.type === "asset_adjustment") {
    const direction = tx.adjustment_direction || "increase";
    if (direction === "decrease") {
      add("debit", { entry_type: "adjustment", label: "資產調整：減少", amount, sort_order: 1 });
      add("credit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 2 });
    } else {
      add("debit", { entry_type: "account", account_id: tx.account_id, label: accountLabel(tx.account_id), amount, sort_order: 1 });
      add("credit", { entry_type: "adjustment", label: "資產調整：增加", amount, sort_order: 2 });
    }
  }

  const debit = entries.filter(e => e.side === "debit").reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const credit = entries.filter(e => e.side === "credit").reduce((sum, e) => sum + Number(e.amount || 0), 0);
  if (Math.round(debit) !== Math.round(credit)) {
    throw new Error(`借貸不平衡：借方 ${debit}，貸方 ${credit}`);
  }

  return entries;
}

async function rebuildEntriesForTransaction(tx) {
  const rawSplits = (state.data.transactionSplits || []).filter(s => s.transaction_id === tx.id);
  const splitRows = rawSplits.map(s => ({
    category_id: s.category_id,
    budget_item_id: s.budget_item_id,
    amount: Number(s.amount || 0),
    note: s.note || null
  }));
  const entries = buildEntriesForTransaction(tx, splitRows);
  return await replaceTransactionEntries(tx.id, entries);
}

async function rebuildAllTransactionEntries() {
  let count = 0;
  const txRows = state.data.transactions.filter(t => t.status !== "cancelled");
  for (const tx of txRows) {
    await rebuildEntriesForTransaction(tx);
    count += 1;
  }
  await loadAll();
  render();
  showAlert(`已重建 ${count} 筆交易的分錄。`, "good");
}

async function saveTransaction(form) {
  const d = readForm(form);
  const type = d.type || state.draftTxType || "expense";
  if (!d.account_id) throw new Error(type === "income" ? "請選擇入帳帳戶" : type === "transfer" ? "請選擇轉出帳戶" : "請選擇帳戶");
  if (!Number(d.amount)) throw new Error("請輸入金額");
  if (type === "transfer" && !d.to_account_id) throw new Error("轉帳需要選擇轉入帳戶");
  if (type !== "transfer" && d.to_account_id) d.to_account_id = null;

  const rawAmount = Number(d.amount);
  const amount = Math.abs(rawAmount);
  const adjustmentDirection = type === "asset_adjustment"
    ? (d.adjustment_direction || (rawAmount < 0 ? "decrease" : "increase"))
    : null;

  const splitRows = (type === "expense" || type === "refund") ? parseSplitLines(d.split_lines || "", type) : [];
  if (splitRows.length) {
    const splitTotal = splitRows.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    if (Math.round(splitTotal) !== Math.round(amount)) {
      throw new Error(`拆帳合計 ${fmtMoney(splitTotal)} 必須等於交易金額 ${fmtMoney(amount)}`);
    }
  }

  const payload = {
    id: d.id || undefined,
    transaction_date: d.transaction_date,
    type,
    account_id: d.account_id,
    to_account_id: type === "transfer" ? d.to_account_id : null,
    category_id: ["transfer","asset_adjustment"].includes(type) ? null : d.category_id || null,
    budget_item_id: (type === "expense" || type === "refund") ? d.budget_item_id || null : null,
    related_transaction_id: type === "refund" ? d.related_transaction_id || null : null,
    amount,
    adjustment_direction: adjustmentDirection,
    merchant: d.merchant,
    payment_method: d.payment_method,
    note: d.note,
    status: d.status || "cleared",
    necessity_level: d.necessity_level || defaultNecessityByType(type),
    cashflow_nature: d.cashflow_nature || defaultCashflowByType(type),
    control_level: d.control_level || "controllable"
  };

  const saved = await upsert("transactions", payload, { expect: { type: payload.type, amount: payload.amount } });
  await replaceTransactionSplits(saved.id, splitRows);
  await replaceTransactionEntries(saved.id, saved.status === "cancelled" ? [] : buildEntriesForTransaction(saved, splitRows));
  return saved;
}

async function saveYear(form) {
  const d = readForm(form);
  const yearBefore = d.id
    ? state.data.years.find(y => y.id === d.id)
    : state.data.years.find(y => Number(y.budget_year) === Number(d.budget_year)) || selectedYearRecord();
  const existingGlobalRows = globalBudgetContributionRowsFromNote(yearBefore?.note || "");
  const annualBudget = existingGlobalRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const payload = {
    id: d.id || undefined,
    budget_year: Number(d.budget_year),
    name: d.name || `${d.budget_year} 年度預算`,
    budget_mode: "monthly_contribution",
    monthly_budget: 0,
    budget_start_mode: "record_start",
    annual_budget: annualBudget,
    carryover_from_previous: numberOrZero(d.carryover_from_previous),
    note: applyGlobalBudgetContributionsMarker(d.note || "", existingGlobalRows)
  };
  const row = await upsert("years", payload, { expect: { budget_year: Number(d.budget_year) } });
  state.selectedYearId = row.id;
  state.selectedBudgetYear = row.budget_year;
  return row;
}



async function saveBudgetMovement(form) {
  const d = readForm(form);
  if (!d.from_budget_item_id) throw new Error("請選擇來源預算項目");
  if (!d.to_budget_item_id) throw new Error("請選擇目標預算項目");
  if (d.from_budget_item_id === d.to_budget_item_id) throw new Error("來源與目標不能相同");
  if (!d.movement_date) throw new Error("請選擇日期");
  if (!Number(d.amount)) throw new Error("請輸入金額");

  const payload = {
    id: d.id || undefined,
    movement_date: d.movement_date,
    from_budget_item_id: d.from_budget_item_id,
    to_budget_item_id: d.to_budget_item_id,
    amount: numberOrZero(d.amount),
    movement_type: "manual",
    note: d.note || null
  };

  return await upsert("budget_movements", payload, { expect: { amount: payload.amount, movement_type: "manual" } });
}

async function saveBudgetContribution(form) {
  const d = readForm(form);
  if (!d.budget_item_id) throw new Error("請選擇預算項目");
  if (!d.contribution_date) throw new Error("請選擇提撥日期");
  if (!Number(d.amount)) throw new Error("請輸入提撥金額");

  const payload = {
    id: d.id || undefined,
    budget_item_id: d.budget_item_id,
    contribution_date: d.contribution_date,
    amount: numberOrZero(d.amount),
    note: d.note || null
  };

  return await upsert("budget_contributions", payload, { expect: { budget_item_id: payload.budget_item_id, amount: payload.amount } });
}

async function saveBudgetItem(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    year_id: state.selectedYearId,
    category_id: d.category_id || null,
    name: d.name,
    item_type: d.item_type || "expense",
    planned_amount: numberOrZero(d.planned_amount),
    period_type: d.period_type || "annual",
    start_date: d.start_date || null,
    end_date: d.end_date || null,
    rollover_mode: d.rollover_mode || "none",
    sort_order: numberOrZero(d.sort_order),
    is_active: boolValue(d.is_active),
    note: d.note || null
  };
  return await upsert("budget_items", payload, { expect: { name: payload.name } });
}

async function saveGlobalBudgetContribution(form) {
  const d = readForm(form);
  if (!d.contribution_date) throw new Error("請選擇提撥日期");
  if (!Number(d.amount)) throw new Error("請輸入提撥金額");

  const rows = globalBudgetContributionRowsForSelectedYear();
  rows.push({
    id: makeClientId("global_budget_contribution"),
    contribution_date: d.contribution_date,
    amount: numberOrZero(d.amount),
    note: d.note || ""
  });

  return await updateSelectedYearGlobalContributions(rows);
}

async function deleteGlobalBudgetContribution(id) {
  const rows = globalBudgetContributionRowsForSelectedYear();
  const nextRows = rows.filter(r => r.id !== id);
  if (nextRows.length === rows.length) throw new Error("找不到這筆全局提撥紀錄。");
  return await updateSelectedYearGlobalContributions(nextRows);
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
  return await upsert("accounts", payload, { expect: { name: payload.name } });
}

async function saveCategory(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type,
    parent_id: d.parent_id || null,
    color: d.color || "#64748b",
    sort_order: numberOrZero(d.sort_order),
    is_active: boolValue(d.is_active),
    note: d.note || null
  };
  return await upsert("categories", payload, { expect: { name: payload.name } });
}

async function saveTag(form) {
  const d = readForm(form);
  return await upsert("tags", {
    id: d.id || undefined,
    name: d.name,
    color: d.color || "#64748b",
    note: d.note || null
  }, { expect: { name: d.name } });
}

async function saveRecurring(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type || state.draftRecurringType || "expense",
    account_id: d.account_id,
    category_id: d.category_id || null,
    budget_item_id: d.budget_item_id || null,
    amount: numberOrZero(d.amount),
    frequency: d.frequency || "monthly",
    interval_count: numberOrZero(d.interval_count) || 1,
    next_due_date: d.next_due_date,
    merchant: d.merchant || null,
    payment_method: d.payment_method || null,
    reminder_days: numberOrZero(d.reminder_days),
    auto_create_transaction: boolValue(d.auto_create_transaction),
    is_active: boolValue(d.is_active),
    note: d.note || null
  };

  if (!payload.name) throw new Error("請輸入訂閱名稱");
  if (!payload.account_id) throw new Error("請選擇付款帳戶");
  if (!payload.amount) throw new Error("請輸入金額");
  if (!payload.next_due_date) throw new Error("請選擇下次扣款日");

  return await upsert("recurring_transactions", payload, { expect: { name: payload.name, amount: payload.amount } });
}

async function saveQuickTemplate(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    type: d.type || "expense",
    default_account_id: d.default_account_id || null,
    default_to_account_id: d.default_to_account_id || null,
    category_id: d.category_id || null,
    budget_item_id: d.budget_item_id || null,
    merchant: d.merchant || null,
    default_amount: d.default_amount ? numberOrZero(d.default_amount) : null,
    payment_method: d.payment_method || null,
    necessity_level: d.necessity_level || "quality",
    cashflow_nature: d.cashflow_nature || "variable",
    control_level: d.control_level || "controllable",
    sort_order: numberOrZero(d.sort_order),
    is_active: boolValue(d.is_active),
    note: d.note || null
  };
  return await upsert("quick_templates", payload, { expect: { name: payload.name, type: payload.type } });
}

async function saveCreditCard(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    account_id: d.account_id || null,
    name: d.name,
    issuer: d.issuer || null,
    card_network: d.card_network || null,
    credit_limit: numberOrZero(d.credit_limit),
    statement_day: numberOrZero(d.statement_day),
    payment_due_day: numberOrZero(d.payment_due_day),
    annual_fee: numberOrZero(d.annual_fee),
    reward_type: d.reward_type || null,
    reward_rate: d.reward_rate ? Number(d.reward_rate) : null,
    is_active: boolValue(d.is_active),
    note: d.note || null
  };
  return await upsert("credit_cards", payload, { expect: { name: payload.name } });
}

async function saveLoan(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    account_id: d.account_id || null,
    name: d.name,
    loan_type: d.loan_type || "personal_loan",
    principal_amount: numberOrZero(d.principal_amount),
    current_balance: numberOrZero(d.current_balance),
    interest_rate: d.interest_rate ? Number(d.interest_rate) : null,
    monthly_payment: numberOrZero(d.monthly_payment),
    payment_day: numberOrZero(d.payment_day),
    start_date: d.start_date || null,
    end_date: d.end_date || null,
    status: d.status || "active",
    note: d.note || null
  };
  return await upsert("loans", payload, { expect: { name: payload.name } });
}

async function saveGoal(form) {
  const d = readForm(form);
  const payload = {
    id: d.id || undefined,
    name: d.name,
    goal_type: d.goal_type || "saving",
    target_amount: numberOrZero(d.target_amount),
    current_amount: numberOrZero(d.current_amount),
    target_date: d.target_date || null,
    priority: numberOrZero(d.priority),
    status: d.status || "active",
    note: d.note || null
  };
  return await upsert("goals", payload, { expect: { name: payload.name } });
}

async function closeYearToNextYear() {
  const current = getCurrentYearSummary();
  const currentYear = selectedYearRecord();
  const nextYearNumber = Number(state.selectedBudgetYear) + 1;
  const existingNext = state.data.years.find(y => Number(y.budget_year) === nextYearNumber);
  const carryover = Math.round(Number(current.remaining_budget || 0));

  const ok = await confirmAction(
    "年度結轉",
    `確定要關閉 ${state.selectedBudgetYear} 年？\n\n${nextYearNumber} 年將使用：\n前期結轉：${fmtMoney(carryover)}\n年度總預算：先由下一年的全局提撥紀錄累積，不再填每次提撥金額。`
  );
  if (!ok) return;

  await upsert("years", {
    ...currentYear,
    is_closed: true,
    note: applyGlobalBudgetContributionsMarker(stripGlobalBudgetContributionsMarker(currentYear.note || ""), globalBudgetContributionRowsFromNote(currentYear.note || ""))
  }, { expect: { budget_year: Number(state.selectedBudgetYear) } });

  const next = await upsert("years", {
    id: existingNext?.id || undefined,
    budget_year: nextYearNumber,
    name: existingNext?.name || `${nextYearNumber} 年度預算`,
    budget_mode: "monthly_contribution",
    monthly_budget: 0,
    budget_start_mode: "record_start",
    annual_budget: globalBudgetContributionTotalForYear(existingNext || { budget_year: nextYearNumber, note: "" }),
    carryover_from_previous: carryover,
    note: existingNext?.note || ""
  }, { expect: { budget_year: nextYearNumber } });

  state.selectedYearId = next.id;
  state.selectedBudgetYear = next.budget_year;
  await loadAll();
  render();
  showAlert(`已結轉到 ${nextYearNumber} 年：前期結轉 ${fmtMoney(carryover)}。`, "good");
}

function bindRenderedEvents() {
  $$("form").forEach(form => {
    if (form.id === "recurringForm") form.addEventListener("submit", handleRecurringSubmit);
    else form.addEventListener("submit", handleSubmit);
  });

  $$("[data-tx-mode]").forEach(btn => btn.addEventListener("click", () => {
    state.draftTxType = btn.dataset.txMode;
    state.transactionDraft = { transaction_date: today(), type: state.draftTxType };
    render();
  }));

  $$("[data-recurring-type]").forEach(btn => btn.addEventListener("click", () => {
    state.draftRecurringType = btn.dataset.recurringType;
    render();
  }));

  $$("[data-quick-template]").forEach(btn => btn.addEventListener("click", () => {
    const draft = transactionDraftFromTemplate(btn.dataset.quickTemplate, btn.dataset.templateKind);
    if (!draft) return;
    state.draftTxType = draft.type || state.draftTxType;
    state.transactionDraft = draft;
    showAlert(`已套用模板：${escapeHtml(btn.textContent.trim())}`, "good");
    render();
  }));

  $("#filterTxSearch")?.addEventListener("input", e => { state.filters.txSearch = e.target.value; render(); });
  $("#filterTxType")?.addEventListener("change", e => { state.filters.txType = e.target.value; render(); });
  $("#filterTxCategory")?.addEventListener("change", e => { state.filters.txCategory = e.target.value; render(); });
  $("#filterTxAccount")?.addEventListener("change", e => { state.filters.txAccount = e.target.value; render(); });
  $("#filterTxStart")?.addEventListener("change", e => { state.filters.txStart = e.target.value; render(); });
  $("#filterTxEnd")?.addEventListener("change", e => { state.filters.txEnd = e.target.value; render(); });

  $("#chartCategoryFilter")?.addEventListener("change", e => { state.filters.chartCategory = e.target.value; render(); });
  $$("[data-chart-scope]").forEach(btn => btn.addEventListener("click", () => {
    state.filters.chartScope = btn.dataset.chartScope;
    render();
  }));

  $$("[data-edit-tx]").forEach(btn => btn.addEventListener("click", () => {
    state.editing.transaction = state.data.transactionView.find(x => x.id === btn.dataset.editTx) || state.data.transactions.find(x => x.id === btn.dataset.editTx);
    state.draftTxType = state.editing.transaction?.type || "expense";
    state.transactionDraft = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));

  $$("[data-edit-budget]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.editing.budgetItem = state.data.budgetItems.find(x => x.id === btn.dataset.editBudget);
    state.budgetOperationMode = "item";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));

  $$("[data-close-budget-item]").forEach(btn => btn.addEventListener("click", async () => {
    const item = state.data.budgetItems.find(x => x.id === btn.dataset.closeBudgetItem);
    const ok = await confirmAction("結帳預算項目", `確定要結帳「${item?.name || "預算項目"}」？\n\n這會把目前剩餘額度承接為新可用額度，並讓主畫面的實際金額從 0 重新開始。歷史累積會保留在項目明細。`);
    if (!ok) return;
    try {
      await closeBudgetItemCycle(btn.dataset.closeBudgetItem);
      await loadAll();
      render();
      showAlert("預算項目已結帳。", "good");
    } catch (error) {
      showAlert(`結帳失敗：${escapeHtml(error.message)}`, "bad");
    }
  }));

  $$("[data-edit-contribution]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.editing.budgetContribution = state.data.budgetContributions.find(x => x.id === btn.dataset.editContribution);
    state.budgetOperationMode = "itemContribution";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));

  $$("[data-edit-movement]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.editing.budgetMovement = state.data.budgetMovements.find(x => x.id === btn.dataset.editMovement);
    state.budgetOperationMode = "movement";
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }));

  $$("[data-edit-year]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.editing.year = state.data.years.find(x => x.id === btn.dataset.editYear);
    state.budgetOperationMode = "year";
    render();
  }));

  $$("[data-edit-account]").forEach(btn => btn.addEventListener("click", () => { state.editing.account = state.data.accounts.find(x => x.id === btn.dataset.editAccount); render(); }));
  $$("[data-edit-category]").forEach(btn => btn.addEventListener("click", () => { state.editing.category = state.data.categories.find(x => x.id === btn.dataset.editCategory); render(); }));
  $$("[data-edit-tag]").forEach(btn => btn.addEventListener("click", () => { state.editing.tag = state.data.tags.find(x => x.id === btn.dataset.editTag); render(); }));
  $$("[data-edit-recurring]").forEach(btn => btn.addEventListener("click", () => { state.editing.recurring = state.data.recurring.find(x => x.id === btn.dataset.editRecurring); state.draftRecurringType = state.editing.recurring?.type || "expense"; render(); }));
  $$("[data-edit-template]").forEach(btn => btn.addEventListener("click", () => { state.editing.quickTemplate = state.data.quickTemplates.find(x => x.id === btn.dataset.editTemplate); render(); }));
  $$("[data-edit-card]").forEach(btn => btn.addEventListener("click", () => { state.editing.creditCard = state.data.creditCards.find(x => x.id === btn.dataset.editCard); render(); }));
  $$("[data-edit-loan]").forEach(btn => btn.addEventListener("click", () => { state.editing.loan = state.data.loans.find(x => x.id === btn.dataset.editLoan); render(); }));
  $$("[data-edit-goal]").forEach(btn => btn.addEventListener("click", () => { state.editing.goal = state.data.goals.find(x => x.id === btn.dataset.editGoal); render(); }));

  $$("[data-cancel-edit]").forEach(btn => btn.addEventListener("click", () => {
    const key = btn.dataset.cancelEdit;
    if (key && state.editing[key] !== undefined) state.editing[key] = null;
    state.transactionDraft = null;
    render();
  }));

  $$("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
    const [table, id] = btn.dataset.delete.split(":");
    const ok = await confirmAction("刪除資料", `確定刪除這筆${tableLabel(table)}？`);
    if (!ok) return;
    try {
      await removeRow(table, id);
      await loadAll();
      render();
      showAlert(`${tableLabel(table)}已刪除，且資料庫已驗證不存在。`, "good");
    } catch (error) {
      showAlert(`刪除失敗：${escapeHtml(error.message)}`, "bad");
    }
  }));

  $$("[data-delete-global-contribution]").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.dataset.deleteGlobalContribution;
    const ok = await confirmAction("刪除全局提撥", "確定要刪除這筆全局預算提撥？");
    if (!ok) return;
    try {
      await deleteGlobalBudgetContribution(id);
      await loadAll();
      render();
      showAlert("全局預算提撥已刪除。", "good");
    } catch (error) {
      showAlert(`刪除全局提撥失敗：${escapeHtml(error.message)}`, "bad");
    }
  }));

  $("#closeYearBtn")?.addEventListener("click", async () => {
    try { await closeYearToNextYear(); } catch (error) { showAlert(`年度結轉失敗：${escapeHtml(error.message)}`, "bad"); }
  });

  $("#downloadJsonBtn")?.addEventListener("click", downloadCacheJson);
  $("#exportCsvBtn")?.addEventListener("click", exportTransactionsCsv);
  $("#exportCashflowCsvBtn")?.addEventListener("click", exportCashflowCsv);
  $("#exportXlsxBtn")?.addEventListener("click", exportWorkbookXlsx);
  $("#rebuildEntriesBtn")?.addEventListener("click", rebuildAllTransactionEntries);
  $("#mobileQuickAdd")?.addEventListener("click", () => setPage("transactions"));
  $$("[data-mobile-tab]").forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.mobileTab)));
  $("#importDefaultTemplatesBtn")?.addEventListener("click", importDefaultTemplates);

  $$("[data-report-mode]").forEach(btn => btn.addEventListener("click", () => {
    const group = btn.dataset.reportGroup;
    const mode = btn.dataset.reportMode;
    if (!group || !mode) return;
    state[group] = mode;
    if (group === "reportChartMode") {
      state.reportChartExpanded = false;
      state.reportChartKind = "bar";
    }
    render();
  }));

  $$("[data-report-chart-kind]").forEach(btn => btn.addEventListener("click", () => {
    state.reportChartKind = btn.dataset.reportChartKind || "bar";
    render();
  }));

  $$("[data-report-chart-expand]").forEach(btn => btn.addEventListener("click", () => {
    state.reportChartExpanded = btn.dataset.reportChartExpand === "true";
    render();
  }));

  $$("[data-budget-operation]").forEach(btn => btn.addEventListener("click", () => {
    clearBudgetOperationEditing();
    state.budgetOperationMode = btn.dataset.budgetOperation || "globalContribution";
    render();
  }));

  $$("[data-go]").forEach(btn => btn.addEventListener("click", () => setPage(btn.dataset.go)));
}

function clearEditing() {
  Object.keys(state.editing).forEach(k => state.editing[k] = null);
  state.transactionDraft = null;
}

function clearBudgetOperationEditing() {
  state.editing.year = null;
  state.editing.budgetItem = null;
  state.editing.budgetContribution = null;
  state.editing.budgetMovement = null;
}

function activeBudgetOperationMode() {
  if (state.editing.budgetContribution) return "itemContribution";
  if (state.editing.budgetMovement) return "movement";
  if (state.editing.budgetItem) return "item";
  if (state.editing.year) return "year";
  return state.budgetOperationMode || "globalContribution";
}

function budgetOperationTab(mode, label) {
  const active = activeBudgetOperationMode() === mode ? "active" : "";
  return `<button class="seg-btn ${active}" type="button" data-budget-operation="${mode}">${escapeHtml(label)}</button>`;
}

function renderYearSettingsForm(editYear, current) {
  return `
    <form id="yearForm" class="form-grid two">
      <input type="hidden" name="id" value="${escapeHtml(editYear?.id || "")}">
      ${field("年度", `<input class="input" type="number" name="budget_year" min="2000" max="2100" value="${escapeHtml(editYear?.budget_year || state.selectedBudgetYear)}" required>`)}
      ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editYear?.name || "")}" placeholder="例：2026 年度預算">`)}
      ${field("預算模式", `<input class="input" value="提撥紀錄制" disabled><input type="hidden" name="budget_mode" value="monthly_contribution">`)}
      ${field("年度提撥合計", `<input class="input" value="${escapeHtml(fmtMoney(current.annual_budget || 0))}" disabled><input type="hidden" name="annual_budget" value="${escapeHtml(current.annual_budget || 0)}">`)}
      ${field("計算起點", `<input class="input" value="依全局提撥紀錄" disabled><input type="hidden" name="budget_start_mode" value="record_start">`)}
      ${field("前期結轉", `<input class="input" type="number" step="1" name="carryover_from_previous" value="${escapeHtml(editYear?.carryover_from_previous ?? current.carryover_from_previous ?? 0)}">`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note">${escapeHtml(stripGlobalBudgetContributionsMarker(editYear?.note || ""))}</textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">儲存年度</button>
        <button class="btn secondary" type="button" data-edit-year="${state.selectedYearId}">載入目前年度編輯</button>
        <button class="btn secondary" type="button" id="closeYearBtn">結轉到下一年</button>
        ${editYear ? `<button class="btn danger" type="button" data-delete="years:${editYear.id}">刪除年度</button>` : ""}
        ${editYear ? `<button class="btn secondary" type="button" data-cancel-edit="year">取消編輯</button>` : ""}
      </div>
    </form>
  `;
}

function renderBudgetItemForm(editItem) {
  return `
    <form id="budgetItemForm" class="form-grid two">
      <input type="hidden" name="id" value="${escapeHtml(editItem?.id || "")}">
      ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editItem?.name || "")}" required placeholder="例：日常餐飲">`)}
      ${field("類型", `<select class="input" name="item_type">${selectOpts(["expense","income","saving","other"], editItem?.item_type || "expense")}</select>`)}
      ${field("金額", `<input class="input" type="number" step="1" name="planned_amount" value="${escapeHtml(editItem?.planned_amount || "")}" required placeholder="固定預算，或每次提撥金額">`)}
      ${field("分類", `<select class="input" name="category_id">${categoryOptions(editItem?.item_type || "expense", editItem?.category_id || "")}</select>`)}
      <details class="advanced-fields wide">
        <summary>進階欄位</summary>
        <div class="form-grid two">
          ${field("期間", `<select class="input" name="period_type">${selectOpts(["annual","monthly","weekly","custom"], editItem?.period_type || "annual")}</select>`)}
          ${field("結轉模式", `<select class="input" name="rollover_mode">${selectOpts(["none","carryover","overspend_to_next"], editItem?.rollover_mode || "none")}</select>`)}
          ${field("提撥起始日", `<input class="input" type="date" name="start_date" value="${escapeHtml(editItem?.start_date || "")}">`)}
          ${field("提撥結束日", `<input class="input" type="date" name="end_date" value="${escapeHtml(editItem?.end_date || "")}">`)}
          ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(editItem?.sort_order || 0)}">`)}
          ${field("啟用", `<select class="input" name="is_active">
            <option value="true" ${editItem?.is_active !== false ? "selected" : ""}>啟用</option>
            <option value="false" ${editItem?.is_active === false ? "selected" : ""}>停用</option>
          </select>`)}
          <div class="field wide">
            <label>備註</label>
            <textarea class="input" name="note">${escapeHtml(editItem?.note || "")}</textarea>
          </div>
        </div>
      </details>
      <div class="wide btn-row">
        <button class="btn" type="submit">${editItem ? "儲存修改" : "新增項目"}</button>
        ${editItem ? `<button class="btn secondary" type="button" data-cancel-edit="budgetItem">取消編輯</button>` : ""}
      </div>
    </form>
  `;
}

function renderGlobalBudgetContributionForm() {
  return `
    <form id="globalBudgetContributionForm" class="form-grid">
      ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(today())}" required>`)}
      ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" required placeholder="例：25000">`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note" placeholder="例：5 月稅後收入扣掉儲蓄後可支配預算"></textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">新增全局提撥</button>
      </div>
    </form>
  `;
}

function renderBudgetContributionForm(edit) {
  return `
    <form id="budgetContributionForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
      ${field("預算項目", `<select class="input" name="budget_item_id" required>${budgetContributionOptions(edit?.budget_item_id || "")}</select>`)}
      ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(edit?.contribution_date || today())}" required>`)}
      ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required placeholder="例：20000">`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note" placeholder="例：出國基金、Live Music 加碼">${escapeHtml(edit?.note || "")}</textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">${edit ? "儲存修改" : "新增項目提撥"}</button>
        ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetContribution">取消編輯</button>` : ""}
      </div>
    </form>
  `;
}

function renderBudgetMovementForm(edit) {
  return `
    <form id="budgetMovementForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
      ${field("日期", `<input class="input" type="date" name="movement_date" value="${escapeHtml(edit?.movement_date || today())}" required>`)}
      ${field("從哪個預算扣", `<select class="input" name="from_budget_item_id" required>${budgetContributionOptions(edit?.from_budget_item_id || "")}</select>`)}
      ${field("移到哪個預算", `<select class="input" name="to_budget_item_id" required>${budgetContributionOptions(edit?.to_budget_item_id || "")}</select>`)}
      ${field("金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required>`)}
      <div class="field wide">
        <label>備註</label>
        <textarea class="input" name="note" placeholder="例：月底把日常結餘移到出國">${escapeHtml(edit?.note || "")}</textarea>
      </div>
      <div class="wide btn-row">
        <button class="btn" type="submit">${edit ? "儲存修改" : "新增移轉"}</button>
        ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetMovement">取消編輯</button>` : ""}
      </div>
    </form>
  `;
}

function renderBudgetOperationsCard(editYear, editItem, current) {
  const mode = activeBudgetOperationMode();
  const titles = {
    globalContribution: "新增全局預算提撥",
    itemContribution: state.editing.budgetContribution ? "編輯項目提撥" : "新增項目提撥",
    movement: state.editing.budgetMovement ? "編輯預算移轉" : "預算項目移轉",
    item: editItem ? "編輯預算項目" : "新增預算項目",
    year: "年度基本設定"
  };

  const desc = {
    globalContribution: "增加年度母池可用預算。公式：目前可用預算 = 前期結轉 + 全局提撥紀錄合計。",
    itemContribution: "增加某個 envelope 的額度，例如出國、Live Music、高端餐飲。",
    movement: "把一個 envelope 的剩餘額度移到另一個 envelope，不會新增收入或支出。",
    item: "建立或修改 envelope 本身，例如日常花費、出國、Live Music。",
    year: "低頻設定：年度、名稱、前期結轉、年度刪除與結轉到下一年。"
  };

  const body = {
    globalContribution: renderGlobalBudgetContributionForm(),
    itemContribution: renderBudgetContributionForm(state.editing.budgetContribution),
    movement: renderBudgetMovementForm(state.editing.budgetMovement),
    item: renderBudgetItemForm(editItem),
    year: renderYearSettingsForm(editYear, current)
  }[mode] || renderGlobalBudgetContributionForm();

  return `
    <div class="card budget-operation-card">
      <div class="card-title-row">
        <h3>預算操作</h3>
        <span class="badge">${escapeHtml(titles[mode] || "")}</span>
      </div>
      <div class="segmented budget-operation-tabs">
        ${budgetOperationTab("globalContribution", "全局提撥")}
        ${budgetOperationTab("itemContribution", "項目提撥")}
        ${budgetOperationTab("movement", "預算移轉")}
        ${budgetOperationTab("item", "預算項目")}
        ${budgetOperationTab("year", "年度設定")}
      </div>
      <p class="metric-sub">${escapeHtml(desc[mode] || "")}</p>
      ${body}
    </div>
  `;
}

function renderGlobalBudgetContributionRecords() {
  const rows = globalBudgetContributionRowsForSelectedYear();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>全局提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderGlobalBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderBudgetContributionRecords() {
  const rows = enrichedBudgetContributionsForSelectedYear();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>項目提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderBudgetMovementRecords() {
  const rows = enrichedBudgetMovementsForSelectedYear();
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>預算移轉紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetMovementTable(rows)}
      </div>
    </details>
  `;
}

function renderMonthCloseAdvisor() {
  const rows = budgetItemSummariesForSelectedYear().filter(i => Number(i.remaining_amount || 0) > 0 && ["monthly","weekly"].includes(i.period_type || ""));
  if (!rows.length) return "";
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>結餘分配 / 月底處理</span>
        <span class="badge">手動處理</span>
      </summary>
      <div class="collapsible-body">
        <p class="metric-sub">不自動問、不自動分類。月底或你想整理時，自己從這裡看哪些項目有剩餘，再用「預算移轉」分配到其他項目。</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>預算項目</th><th>剩餘</th><th>建議動作</th></tr></thead>
            <tbody>${rows.map(r => `
              <tr><td>${escapeHtml(r.name)}</td><td class="mono good">${fmtMoney(r.remaining_amount)}</td><td>可移轉到出國、證券戶、Live Music 或保留。</td></tr>
            `).join("")}</tbody>
          </table>
        </div>
      </div>
    </details>
  `;
}

function renderAnnualRolloverCard() {
  const rows = budgetItemSummariesForSelectedYear().filter(budgetIsAnnualRolloverMode);
  if (!rows.length) return "";
  return `
    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>年度結轉型項目</span>
        <span class="badge">${rows.length} 項</span>
      </summary>
      <div class="collapsible-body">
        <p class="metric-sub">這些項目不需要跳到下一年才能處理；你可以直接按「結帳」讓主畫面實際歸 0，剩餘銀彈承接，歷史仍保留在項目明細。</p>
        ${renderBudgetItemTable(rows)}
      </div>
    </details>
  `;
}

async function ensureBudgetYearForNumber(yearNumber) {
  let year = state.data.years.find(y => Number(y.budget_year) === Number(yearNumber));
  if (year) return year;
  year = await upsert("years", {
    budget_year: Number(yearNumber),
    name: `${yearNumber} 年度預算`,
    annual_budget: 0,
    monthly_budget: 0,
    budget_mode: "monthly_contribution",
    budget_start_mode: "record_start",
    carryover_from_previous: 0,
    note: ""
  }, { expect: { budget_year: Number(yearNumber) } });
  await loadAll();
  return year;
}

function renderBudgetContributionSection() {
  const edit = state.editing.budgetContribution;
  const rows = enrichedBudgetContributionsForSelectedYear();
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>${edit ? "編輯預算提撥" : "新增預算提撥"}</h3>
        <span class="badge">${rows.length} 筆</span>
      </div>
      <p class="metric-sub">提撥型預算項目會優先使用這裡的實際提撥紀錄；若沒有紀錄，才用「金額 × 期間次數」估算。</p>
      <form id="budgetContributionForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("預算項目", `<select class="input" name="budget_item_id" required>${budgetContributionOptions(edit?.budget_item_id || "")}</select>`)}
        ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(edit?.contribution_date || today())}" required>`)}
        ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required placeholder="例：20000">`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="例：出國基金、Live Music 加碼">${escapeHtml(edit?.note || "")}</textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : "新增提撥"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetContribution">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderGlobalBudgetContributionSection() {
  const rows = globalBudgetContributionRowsForSelectedYear();
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>新增全局預算提撥</h3>
        <span class="badge">年度母池</span>
      </div>
      <p class="metric-sub">全局年度預算現在以實際提撥紀錄為準。公式：目前可用預算 = 前期結轉 + 全局提撥紀錄合計。</p>
      <form id="globalBudgetContributionForm" class="form-grid">
        ${field("提撥日期", `<input class="input" type="date" name="contribution_date" value="${escapeHtml(today())}" required>`)}
        ${field("提撥金額", `<input class="input" type="number" step="1" name="amount" required placeholder="例：25000">`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="例：5 月稅後收入扣掉儲蓄後可支配預算"></textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">新增全局提撥</button>
        </div>
      </form>
    </div>

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>全局提撥紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderGlobalBudgetContributionTable(rows)}
      </div>
    </details>
  `;
}

function renderGlobalBudgetContributionTable(rows) {
  if (!rows.length) return `<div class="empty">尚無全局提撥紀錄。</div>`;
  const mobileCards = `
    <div class="mobile-card-list">
      ${rows.slice(0, 80).map(r => `
        <div class="mobile-data-card">
          <div class="mobile-data-head">
            <div>
              <strong>全局預算提撥</strong>
              <span>${escapeHtml(r.contribution_date || "")}</span>
            </div>
            <div class="mobile-amount">${fmtMoney(r.amount)}</div>
          </div>
          <div class="mobile-data-meta">${r.note ? `<span>${escapeHtml(r.note)}</span>` : ""}</div>
          <div class="mobile-card-actions">
            <button type="button" class="btn small danger" data-delete-global-contribution="${escapeHtml(r.id)}">刪除</button>
          </div>
        </div>
      `).join("")}
    </div>`;

  const tableView = `
    <div class="table-wrap desktop-table">
      <table>
        <thead><tr><th>日期</th><th>金額</th><th>備註</th><th>操作</th></tr></thead>
        <tbody>${rows.slice(0, 120).map(r => `
          <tr>
            <td>${escapeHtml(r.contribution_date || "")}</td>
            <td class="mono good">${fmtMoney(r.amount)}</td>
            <td>${escapeHtml(r.note || "")}</td>
            <td class="actions">
              <button type="button" class="btn small danger" data-delete-global-contribution="${escapeHtml(r.id)}">刪除</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
  return `${mobileCards}${tableView}`;
}

function budgetContributionOptions(selected = "") {
  const items = state.data.budgetItems.filter(b => b.year_id === state.selectedYearId && b.is_active !== false);
  return `<option value="">請選擇預算項目</option>` + items.map(b => `<option value="${escapeHtml(b.id)}" ${b.id === selected ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("");
}

function enrichedBudgetContributionsForSelectedYear() {
  const itemMap = Object.fromEntries(state.data.budgetItems.map(i => [i.id, i]));
  return (state.data.budgetContributions || [])
    .filter(c => contributionYear(c.contribution_date) === Number(state.selectedBudgetYear))
    .map(c => ({ ...c, budget_item_name: itemMap[c.budget_item_id]?.name || "未知項目" }))
    .sort((a, b) => String(b.contribution_date).localeCompare(String(a.contribution_date)));
}

function renderBudgetContributionTable(rows) {
  if (!rows.length) return `<div class="empty">尚無提撥紀錄。</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>日期</th><th>預算項目</th><th>金額</th><th>備註</th><th>操作</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.contribution_date)}</td>
            <td>${escapeHtml(r.budget_item_name)}</td>
            <td class="mono good">${fmtMoney(r.amount)}</td>
            <td>${escapeHtml(r.note || "")}</td>
            <td class="actions">
              <button class="btn small secondary" data-edit-contribution="${escapeHtml(r.id)}">編輯</button>
              <button class="btn small danger" data-delete="budget_contributions:${escapeHtml(r.id)}">刪除</button>
            </td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderBudgetMovementSection() {
  const edit = state.editing.budgetMovement;
  const rows = enrichedBudgetMovementsForSelectedYear();
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>${edit ? "編輯預算移轉" : "預算項目移轉"}</h3>
        <span class="badge">手動分配</span>
      </div>
      <p class="metric-sub">用於把未花完的預算，從一個項目移到另一個項目。例如日常花費 → 證券戶 / 出國 / Live Music。</p>
      <form id="budgetMovementForm" class="form-grid">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("日期", `<input class="input" type="date" name="movement_date" value="${escapeHtml(edit?.movement_date || today())}" required>`)}
        ${field("從哪個預算扣", `<select class="input" name="from_budget_item_id" required>${budgetContributionOptions(edit?.from_budget_item_id || "")}</select>`)}
        ${field("移到哪個預算", `<select class="input" name="to_budget_item_id" required>${budgetContributionOptions(edit?.to_budget_item_id || "")}</select>`)}
        ${field("金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required>`)}
        <div class="field wide">
          <label>備註</label>
          <textarea class="input" name="note" placeholder="例：月底把日常結餘移到出國">${escapeHtml(edit?.note || "")}</textarea>
        </div>
        <div class="wide btn-row">
          <button class="btn" type="submit">${edit ? "儲存修改" : "新增移轉"}</button>
          ${edit ? `<button class="btn secondary" type="button" data-cancel-edit="budgetMovement">取消編輯</button>` : ""}
        </div>
      </form>
    </div>

    <details class="card collapsible-card">
      <summary class="collapsible-summary">
        <span>預算移轉紀錄（點擊展開 / 收合）</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderBudgetMovementTable(rows)}
      </div>
    </details>
  `;
}

function enrichedBudgetMovementsForSelectedYear() {
  const itemMap = Object.fromEntries(state.data.budgetItems.map(i => [i.id, i]));
  return (state.data.budgetMovements || [])
    .filter(m => contributionYear(m.movement_date) === Number(state.selectedBudgetYear))
    .map(m => ({
      ...m,
      from_name: itemMap[m.from_budget_item_id]?.name || "未知項目",
      to_name: itemMap[m.to_budget_item_id]?.name || "未知項目"
    }))
    .sort((a, b) => String(b.movement_date).localeCompare(String(a.movement_date)));
}

function renderBudgetMovementTable(rows) {
  if (!rows.length) return `<div class="empty">尚無預算移轉紀錄。</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>日期</th><th>從</th><th>到</th><th>金額</th><th>備註</th><th>操作</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.movement_date)}</td>
            <td>${escapeHtml(r.from_name)}</td>
            <td>${escapeHtml(r.to_name)}</td>
            <td class="mono">${fmtMoney(r.amount)}</td>
            <td>${escapeHtml(r.note || "")}</td>
            <td class="actions">
              <button class="btn small secondary" data-edit-movement="${escapeHtml(r.id)}">編輯</button>
              <button class="btn small danger" data-delete="budget_movements:${escapeHtml(r.id)}">刪除</button>
            </td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderAccounts() {
  const edit = state.editing.account;
  const rows = state.data.accounts;
  return `
    <div class="grid cols-2">
      <div class="card">
        <h3>${edit ? "編輯帳戶" : "新增帳戶"}</h3>
        <form id="accountForm" class="form-grid">
          <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required placeholder="例：現金、國泰銀行、信用卡">`)}
          ${field("類型", `<select class="input" name="type">${selectOpts(["cash","bank","e_wallet","credit_card","loan","asset","other"], edit?.type || "cash")}</select>`)}
          ${field("幣別", `<input class="input" name="currency" value="${escapeHtml(edit?.currency || "TWD")}">`)}
          ${field("期初餘額", `<input class="input" type="number" step="1" name="initial_balance" value="${escapeHtml(edit?.initial_balance ?? 0)}">`)}
          ${field("顏色", `<select class="input" name="color">${colorOptions(edit?.color || "#64748b")}</select>`)}
          ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(edit?.sort_order || 0)}">`)}
          ${field("狀態", `<select class="input" name="is_active"><option value="true" ${edit?.is_active !== false ? "selected" : ""}>啟用</option><option value="false" ${edit?.is_active === false ? "selected" : ""}>停用</option></select>`)}
          ${field("預算驗算", accountCoverageSelect(accountCoverageMode(edit?.note || "")))}
          <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(stripAccountCoverageMarker(edit?.note || ""))}</textarea></div>
          <div class="wide btn-row"><button class="btn" type="submit">${edit ? "儲存修改" : "新增帳戶"}</button>${edit ? `<button class="btn secondary" type="button" data-cancel-edit="account">取消編輯</button>` : ""}</div>
        </form>
      </div>
      <div class="card">
        <div class="card-title-row"><h3>帳戶列表</h3><span class="badge">${rows.length} 個</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>名稱</th><th>類型</th><th>餘額</th><th>預算驗算</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>${accountBalanceRowsMerged().map(a => `
              <tr>
                <td>${escapeHtml(a.name)}</td><td>${escapeHtml(labelOf(a.type))}</td><td class="mono">${fmtMoney(a.current_balance)}</td><td>${escapeHtml(accountCoverageLabel(accountCoverageMode(a.note || "")))}</td><td>${a.is_active === false ? "停用" : "啟用"}</td>
                <td class="actions"><button class="btn small secondary" data-edit-account="${escapeHtml(a.id)}">編輯</button><button class="btn small danger" data-delete="accounts:${escapeHtml(a.id)}">刪除</button></td>
              </tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function accountBalanceRowsMerged() {
  const balanceMap = Object.fromEntries(state.data.accountBalances.map(a => [a.id, a]));
  return state.data.accounts.map(a => ({ ...a, current_balance: balanceMap[a.id]?.current_balance ?? a.initial_balance ?? 0 }));
}

function renderCategories() {
  const editCat = state.editing.category;
  const editTag = state.editing.tag;
  return `
    <div class="grid cols-2">
      <div class="card">
        <h3>${editCat ? "編輯分類" : "新增分類"}</h3>
        <form id="categoryForm" class="form-grid">
          <input type="hidden" name="id" value="${escapeHtml(editCat?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editCat?.name || "")}" required>`)}
          ${field("類型", `<select class="input" name="type">${selectOpts(["expense","income","other"], editCat?.type || "expense")}</select>`)}
          ${field("父分類", `<select class="input" name="parent_id">${optionList(state.data.categories.filter(c => c.id !== editCat?.id), editCat?.parent_id || "", "name", "id", "無")}</select>`)}
          ${field("顏色", `<select class="input" name="color">${colorOptions(editCat?.color || "#64748b")}</select>`)}
          ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(editCat?.sort_order || 0)}">`)}
          ${field("狀態", `<select class="input" name="is_active"><option value="true" ${editCat?.is_active !== false ? "selected" : ""}>啟用</option><option value="false" ${editCat?.is_active === false ? "selected" : ""}>停用</option></select>`)}
          <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(editCat?.note || "")}</textarea></div>
          <div class="wide btn-row"><button class="btn" type="submit">${editCat ? "儲存分類" : "新增分類"}</button>${editCat ? `<button class="btn secondary" type="button" data-cancel-edit="category">取消編輯</button>` : ""}</div>
        </form>
      </div>
      <div class="card">
        <h3>${editTag ? "編輯標籤" : "新增標籤"}</h3>
        <form id="tagForm" class="form-grid">
          <input type="hidden" name="id" value="${escapeHtml(editTag?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(editTag?.name || "")}" required>`)}
          ${field("顏色", `<select class="input" name="color">${colorOptions(editTag?.color || "#64748b")}</select>`)}
          <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(editTag?.note || "")}</textarea></div>
          <div class="wide btn-row"><button class="btn" type="submit">${editTag ? "儲存標籤" : "新增標籤"}</button>${editTag ? `<button class="btn secondary" type="button" data-cancel-edit="tag">取消編輯</button>` : ""}</div>
        </form>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-title-row"><h3>分類列表</h3><span class="badge">${state.data.categories.length} 個</span></div>
        <div class="table-wrap"><table><thead><tr><th>名稱</th><th>類型</th><th>顏色</th><th>狀態</th><th>操作</th></tr></thead><tbody>
          ${state.data.categories.map(c => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(labelOf(c.type))}</td><td>${colorDot(c.color)}</td><td>${c.is_active === false ? "停用" : "啟用"}</td><td class="actions"><button class="btn small secondary" data-edit-category="${escapeHtml(c.id)}">編輯</button><button class="btn small danger" data-delete="categories:${escapeHtml(c.id)}">刪除</button></td></tr>`).join("")}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-title-row"><h3>標籤列表</h3><span class="badge">${state.data.tags.length} 個</span></div>
        <div class="table-wrap"><table><thead><tr><th>名稱</th><th>顏色</th><th>操作</th></tr></thead><tbody>
          ${state.data.tags.map(t => `<tr><td>${escapeHtml(t.name)}</td><td>${colorDot(t.color)}</td><td class="actions"><button class="btn small secondary" data-edit-tag="${escapeHtml(t.id)}">編輯</button><button class="btn small danger" data-delete="tags:${escapeHtml(t.id)}">刪除</button></td></tr>`).join("")}
        </tbody></table></div>
      </div>
    </div>
  `;
}

function renderRecurring() {
  const edit = state.editing.recurring;
  const type = edit?.type || state.draftRecurringType || "expense";
  const rows = state.data.recurring;
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>${edit ? "編輯訂閱 / 固定扣款" : "新增訂閱 / 固定扣款"}</h3>
        <span class="badge">v14 驗證版</span>
      </div>
      ${edit ? "" : `<div class="segmented">${["expense","income"].map(m => `<button type="button" class="seg-btn ${m === type ? "active" : ""}" data-recurring-type="${m}">${escapeHtml(labelOf(m))}</button>`).join("")}</div>`}
      <form id="recurringForm" class="form-grid two" data-current-type="${escapeHtml(type)}">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        <input type="hidden" name="type" value="${escapeHtml(type)}">
        ${field("名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required placeholder="例：Netflix、Apple TV、房租">`)}
        ${field(type === "income" ? "入帳帳戶" : "付款帳戶", `<select class="input" name="account_id" required>${accountOptions(edit?.account_id || defaultAccountIdFor(type))}</select>`)}
        ${field("分類", `<select class="input" name="category_id">${categoryOptions(type, edit?.category_id || "")}</select>`)}
        ${field("預算項目", `<select class="input" name="budget_item_id">${budgetOptions(edit?.budget_item_id || "")}</select>`)}
        ${field("金額", `<input class="input" type="number" step="1" name="amount" value="${escapeHtml(edit?.amount || "")}" required>`)}
        ${field("頻率", `<select class="input" name="frequency">${selectOpts(["weekly","monthly","quarterly","yearly"], edit?.frequency || "monthly")}</select>`)}
        ${field("間隔", `<input class="input" type="number" name="interval_count" value="${escapeHtml(edit?.interval_count || 1)}" min="1">`)}
        ${field("下次扣款日", `<input class="input" type="date" name="next_due_date" value="${escapeHtml(edit?.next_due_date || today())}" required>`)}
        ${field("商家", `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}">`)}
        ${field("付款方式", `<input class="input" name="payment_method" value="${escapeHtml(edit?.payment_method || "")}">`)}
        ${field("提醒天數", `<input class="input" type="number" name="reminder_days" value="${escapeHtml(edit?.reminder_days || 3)}">`)}
        ${field("自動建立交易", `<select class="input" name="auto_create_transaction"><option value="false" ${edit?.auto_create_transaction ? "" : "selected"}>否</option><option value="true" ${edit?.auto_create_transaction ? "selected" : ""}>是</option></select>`)}
        ${field("狀態", `<select class="input" name="is_active"><option value="true" ${edit?.is_active !== false ? "selected" : ""}>使用中</option><option value="false" ${edit?.is_active === false ? "selected" : ""}>已取消 / 停用</option></select>`)}
        <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(edit?.note || "")}</textarea></div>
        <div class="wide btn-row"><button class="btn" type="submit">${edit ? "儲存修改" : "新增訂閱"}</button>${edit ? `<button class="btn secondary" type="button" data-cancel-edit="recurring">取消編輯</button>` : ""}</div>
      </form>
    </div>

    <details class="card collapsible-card" open>
      <summary class="collapsible-summary">
        <span>訂閱 / 固定扣款列表</span>
        <span class="badge">${rows.length} 筆</span>
      </summary>
      <div class="collapsible-body">
        ${renderRecurringTable(rows)}
      </div>
    </details>
  `;
}

function renderRecurringTable(rows) {
  if (!rows.length) return `<div class="empty">尚無訂閱。若剛按新增仍看到這行，代表資料庫寫入失敗或權限未開。</div>`;
  const accountMap = Object.fromEntries(state.data.accounts.map(a => [a.id, a.name]));
  const catMap = Object.fromEntries(state.data.categories.map(c => [c.id, c.name]));
  return `<div class="table-wrap"><table><thead><tr><th>名稱</th><th>類型</th><th>金額</th><th>帳戶</th><th>分類</th><th>週期</th><th>下次扣款</th><th>狀態</th><th>操作</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td><strong>${escapeHtml(r.name)}</strong>${r.merchant ? `<br><small>${escapeHtml(r.merchant)}</small>` : ""}</td>
      <td>${typeBadge(r.type)}</td>
      <td class="mono ${r.type === "income" ? "good" : "bad"}">${fmtMoney(r.amount)}</td>
      <td>${escapeHtml(accountMap[r.account_id] || "")}</td>
      <td>${escapeHtml(catMap[r.category_id] || "")}</td>
      <td>${escapeHtml(labelOf(r.frequency))} / ${escapeHtml(r.interval_count || 1)}</td>
      <td>${escapeHtml(r.next_due_date || "")}</td>
      <td>${r.is_active === false ? "已取消 / 停用" : "使用中"}</td>
      <td class="actions"><button class="btn small secondary" data-edit-recurring="${escapeHtml(r.id)}">編輯</button><button class="btn small danger" data-delete="recurring_transactions:${escapeHtml(r.id)}">刪除</button></td>
    </tr>`).join("")}
  </tbody></table></div>`;
}

function renderTemplates() {
  const edit = state.editing.quickTemplate;
  const rows = state.data.quickTemplates;
  return `
    <div class="card">
      <div class="card-title-row">
        <h3>${edit ? "編輯快速模板" : "新增快速模板"}</h3>
        <span class="badge">快速記一筆</span>
      </div>
      <p class="metric-sub">自訂模板會顯示在「記一筆」頁的快捷按鈕列。內建模板不可直接刪除；若想完全自訂，請先匯入預設模板再編輯。</p>
      <form id="quickTemplateForm" class="form-grid two">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required placeholder="例：早餐、OpenAI、Live Music">`)}
        ${field("類型", `<select class="input" name="type">${selectOpts(["expense","income","transfer","refund"], edit?.type || "expense")}</select>`)}
        ${field("預設帳戶", `<select class="input" name="default_account_id">${accountOptions(edit?.default_account_id || "")}</select>`)}
        ${field("預設轉入帳戶", `<select class="input" name="default_to_account_id">${accountOptions(edit?.default_to_account_id || "")}</select>`)}
        ${field("分類", `<select class="input" name="category_id">${categoryOptions(edit?.type || "expense", edit?.category_id || "")}</select>`)}
        ${field("預算項目", `<select class="input" name="budget_item_id">${budgetOptions(edit?.budget_item_id || "")}</select>`)}
        ${field("商家 / 對象", `<input class="input" name="merchant" value="${escapeHtml(edit?.merchant || "")}">`)}
        ${field("預設金額", `<input class="input" type="number" step="1" name="default_amount" value="${escapeHtml(edit?.default_amount || "")}">`)}
        ${field("付款方式", `<input class="input" name="payment_method" value="${escapeHtml(edit?.payment_method || "")}">`)}
        ${field("必要程度", `<select class="input" name="necessity_level">${selectOpts(["survival","quality","luxury","investment","other"], edit?.necessity_level || "quality")}</select>`)}
        ${field("現金流性質", `<select class="input" name="cashflow_nature">${selectOpts(["fixed","variable","one_time"], edit?.cashflow_nature || "variable")}</select>`)}
        ${field("排序", `<input class="input" type="number" name="sort_order" value="${escapeHtml(edit?.sort_order || 0)}">`)}
        ${field("啟用", `<select class="input" name="is_active"><option value="true" ${edit?.is_active !== false ? "selected" : ""}>啟用</option><option value="false" ${edit?.is_active === false ? "selected" : ""}>停用</option></select>`)}
        <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(edit?.note || "")}</textarea></div>
        <div class="wide btn-row"><button class="btn" type="submit">${edit ? "儲存修改" : "新增模板"}</button>${edit ? `<button class="btn secondary" type="button" data-cancel-edit="quickTemplate">取消編輯</button>` : ""}<button class="btn secondary" type="button" id="importDefaultTemplatesBtn">匯入預設模板</button></div>
      </form>
    </div>

    <div class="card">
      <div class="card-title-row"><h3>自訂快速模板</h3><span class="badge">${rows.length} 筆</span></div>
      ${renderTemplateTable(rows)}
    </div>
  `;
}

function renderTemplateTable(rows) {
  if (!rows.length) return `<div class="empty">尚無自訂模板。你仍可使用系統內建模板。</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>名稱</th><th>類型</th><th>商家</th><th>金額</th><th>狀態</th><th>操作</th></tr></thead><tbody>
    ${rows.map(t => `<tr><td>${escapeHtml(t.name)}</td><td>${escapeHtml(labelOf(t.type))}</td><td>${escapeHtml(t.merchant || "")}</td><td>${t.default_amount ? fmtMoney(t.default_amount) : ""}</td><td>${t.is_active === false ? "停用" : "啟用"}</td><td class="actions"><button class="btn small secondary" data-edit-template="${escapeHtml(t.id)}">編輯</button><button class="btn small danger" data-delete="quick_templates:${escapeHtml(t.id)}">刪除</button></td></tr>`).join("")}
  </tbody></table></div>`;
}

async function importDefaultTemplates() {
  const ok = await confirmAction("匯入預設模板", "這會把目前的內建模板複製成可編輯的自訂模板。若已存在同名模板，可能會重複。確定匯入？");
  if (!ok) return;
  const rows = fallbackQuickTemplates.map((t, idx) => ({
    name: t.name,
    type: t.type,
    default_account_id: resolveTemplateAccount(t.type, t.accountTypes || []) || null,
    category_id: findByNames(state.data.categories, t.categoryNames || [])?.id || null,
    budget_item_id: findByNames(state.data.budgetItems.filter(b => b.year_id === state.selectedYearId), t.budgetNames || [])?.id || null,
    merchant: t.merchant || t.name,
    default_amount: null,
    payment_method: null,
    necessity_level: t.necessity_level || "quality",
    cashflow_nature: t.cashflow_nature || "variable",
    control_level: "controllable",
    sort_order: idx,
    is_active: true,
    note: "由內建模板匯入"
  }));
  for (const row of rows) await upsert("quick_templates", row, { expect: { name: row.name, type: row.type } });
  await loadAll();
  render();
  showAlert(`已匯入 ${rows.length} 個預設模板。`, "good");
}

function renderCreditLoans() {
  const cardEdit = state.editing.creditCard;
  const loanEdit = state.editing.loan;
  return `
    <div class="grid cols-2">
      <div class="card">
        <h3>${cardEdit ? "編輯信用卡" : "新增信用卡"}</h3>
        <form id="creditCardForm" class="form-grid">
          <input type="hidden" name="id" value="${escapeHtml(cardEdit?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(cardEdit?.name || "")}" required>`)}
          ${field("連結帳戶", `<select class="input" name="account_id">${accountOptions(cardEdit?.account_id || "")}</select>`)}
          ${field("發卡機構", `<input class="input" name="issuer" value="${escapeHtml(cardEdit?.issuer || "")}">`)}
          ${field("卡別", `<input class="input" name="card_network" value="${escapeHtml(cardEdit?.card_network || "")}" placeholder="Visa / Mastercard">`)}
          ${field("信用額度", `<input class="input" type="number" name="credit_limit" value="${escapeHtml(cardEdit?.credit_limit || 0)}">`)}
          ${field("結帳日", `<input class="input" type="number" name="statement_day" value="${escapeHtml(cardEdit?.statement_day || "")}" min="1" max="31">`)}
          ${field("繳款日", `<input class="input" type="number" name="payment_due_day" value="${escapeHtml(cardEdit?.payment_due_day || "")}" min="1" max="31">`)}
          ${field("年費", `<input class="input" type="number" name="annual_fee" value="${escapeHtml(cardEdit?.annual_fee || 0)}">`)}
          ${field("回饋類型", `<select class="input" name="reward_type">${selectOpts(["cashback","points","miles","other"], cardEdit?.reward_type || "cashback")}</select>`)}
          ${field("回饋率 %", `<input class="input" type="number" step="0.01" name="reward_rate" value="${escapeHtml(cardEdit?.reward_rate || "")}">`)}
          ${field("狀態", `<select class="input" name="is_active"><option value="true" ${cardEdit?.is_active !== false ? "selected" : ""}>啟用</option><option value="false" ${cardEdit?.is_active === false ? "selected" : ""}>停用</option></select>`)}
          <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(cardEdit?.note || "")}</textarea></div>
          <div class="wide btn-row"><button class="btn" type="submit">${cardEdit ? "儲存信用卡" : "新增信用卡"}</button>${cardEdit ? `<button class="btn secondary" type="button" data-cancel-edit="creditCard">取消編輯</button>` : ""}</div>
        </form>
      </div>
      <div class="card">
        <h3>${loanEdit ? "編輯貸款" : "新增貸款"}</h3>
        <form id="loanForm" class="form-grid">
          <input type="hidden" name="id" value="${escapeHtml(loanEdit?.id || "")}">
          ${field("名稱", `<input class="input" name="name" value="${escapeHtml(loanEdit?.name || "")}" required>`)}
          ${field("連結帳戶", `<select class="input" name="account_id">${accountOptions(loanEdit?.account_id || "")}</select>`)}
          ${field("類型", `<select class="input" name="loan_type">${selectOpts(["student_loan","personal_loan","mortgage","car_loan","credit_card_debt","installment","other"], loanEdit?.loan_type || "personal_loan")}</select>`)}
          ${field("本金", `<input class="input" type="number" name="principal_amount" value="${escapeHtml(loanEdit?.principal_amount || 0)}">`)}
          ${field("目前餘額", `<input class="input" type="number" name="current_balance" value="${escapeHtml(loanEdit?.current_balance || 0)}">`)}
          ${field("利率 %", `<input class="input" type="number" step="0.01" name="interest_rate" value="${escapeHtml(loanEdit?.interest_rate || "")}">`)}
          ${field("月付金", `<input class="input" type="number" name="monthly_payment" value="${escapeHtml(loanEdit?.monthly_payment || 0)}">`)}
          ${field("付款日", `<input class="input" type="number" name="payment_day" min="1" max="31" value="${escapeHtml(loanEdit?.payment_day || "")}">`)}
          ${field("開始日", `<input class="input" type="date" name="start_date" value="${escapeHtml(loanEdit?.start_date || "")}">`)}
          ${field("結束日", `<input class="input" type="date" name="end_date" value="${escapeHtml(loanEdit?.end_date || "")}">`)}
          ${field("狀態", `<select class="input" name="status">${selectOpts(["active","paused","paid_off"], loanEdit?.status || "active")}</select>`)}
          <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(loanEdit?.note || "")}</textarea></div>
          <div class="wide btn-row"><button class="btn" type="submit">${loanEdit ? "儲存貸款" : "新增貸款"}</button>${loanEdit ? `<button class="btn secondary" type="button" data-cancel-edit="loan">取消編輯</button>` : ""}</div>
        </form>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card"><div class="card-title-row"><h3>信用卡</h3><span class="badge">${state.data.creditCards.length} 張</span></div>${renderSimpleTable(state.data.creditCards, ["name","issuer","credit_limit","statement_day","payment_due_day"], "credit_cards", "card")}</div>
      <div class="card"><div class="card-title-row"><h3>貸款</h3><span class="badge">${state.data.loans.length} 筆</span></div>${renderLoanTable()}</div>
    </div>
  `;
}

function renderSimpleTable(rows, keys, table, editKey) {
  if (!rows.length) return `<div class="empty">尚無資料</div>`;
  return `<div class="table-wrap"><table><thead><tr>${keys.map(k => `<th>${escapeHtml(k)}</th>`).join("")}<th>操作</th></tr></thead><tbody>${rows.map(r => `<tr>${keys.map(k => `<td>${typeof r[k] === "number" ? fmtMoney(r[k]) : escapeHtml(r[k] || "")}</td>`).join("")}<td class="actions"><button class="btn small secondary" data-edit-${editKey}="${escapeHtml(r.id)}">編輯</button><button class="btn small danger" data-delete="${table}:${escapeHtml(r.id)}">刪除</button></td></tr>`).join("")}</tbody></table></div>`;
}

function renderLoanTable() {
  if (!state.data.loans.length) return `<div class="empty">尚無貸款</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>名稱</th><th>類型</th><th>餘額</th><th>月付金</th><th>狀態</th><th>操作</th></tr></thead><tbody>${state.data.loans.map(l => `<tr><td>${escapeHtml(l.name)}</td><td>${escapeHtml(labelOf(l.loan_type))}</td><td>${fmtMoney(l.current_balance)}</td><td>${fmtMoney(l.monthly_payment)}</td><td>${escapeHtml(labelOf(l.status))}</td><td class="actions"><button class="btn small secondary" data-edit-loan="${escapeHtml(l.id)}">編輯</button><button class="btn small danger" data-delete="loans:${escapeHtml(l.id)}">刪除</button></td></tr>`).join("")}</tbody></table></div>`;
}

function renderGoals() {
  const edit = state.editing.goal;
  const rows = state.data.goals;
  return `
    <div class="card">
      <h3>${edit ? "編輯目標" : "新增目標"}</h3>
      <form id="goalForm" class="form-grid two">
        <input type="hidden" name="id" value="${escapeHtml(edit?.id || "")}">
        ${field("名稱", `<input class="input" name="name" value="${escapeHtml(edit?.name || "")}" required>`)}
        ${field("類型", `<select class="input" name="goal_type">${selectOpts(["saving","debt_reduction","travel","emergency_fund","purchase","other"], edit?.goal_type || "saving")}</select>`)}
        ${field("目標金額", `<input class="input" type="number" name="target_amount" value="${escapeHtml(edit?.target_amount || 0)}" required>`)}
        ${field("目前金額", `<input class="input" type="number" name="current_amount" value="${escapeHtml(edit?.current_amount || 0)}">`)}
        ${field("目標日期", `<input class="input" type="date" name="target_date" value="${escapeHtml(edit?.target_date || "")}">`)}
        ${field("優先級", `<input class="input" type="number" name="priority" value="${escapeHtml(edit?.priority || 0)}">`)}
        ${field("狀態", `<select class="input" name="status">${selectOpts(["active","paused","completed"], edit?.status || "active")}</select>`)}
        <div class="field wide"><label>備註</label><textarea class="input" name="note">${escapeHtml(edit?.note || "")}</textarea></div>
        <div class="wide btn-row"><button class="btn" type="submit">${edit ? "儲存目標" : "新增目標"}</button>${edit ? `<button class="btn secondary" type="button" data-cancel-edit="goal">取消編輯</button>` : ""}</div>
      </form>
    </div>

    <div class="grid cols-2">
      ${rows.map(g => {
        const pct = g.target_amount ? Math.min(100, Number(g.current_amount || 0) / Number(g.target_amount) * 100) : 0;
        return `<div class="card"><div class="card-title-row"><h3>${escapeHtml(g.name)}</h3><span class="badge">${escapeHtml(labelOf(g.goal_type))}</span></div><div class="metric-value">${fmtMoney(g.current_amount)} / ${fmtMoney(g.target_amount)}</div><div class="progress"><span style="width:${pct}%"></span></div><p class="metric-sub">${fmtNumber(pct,1)}%｜目標日 ${escapeHtml(g.target_date || "未設定")}</p><div class="btn-row"><button class="btn small secondary" data-edit-goal="${escapeHtml(g.id)}">編輯</button><button class="btn small danger" data-delete="goals:${escapeHtml(g.id)}">刪除</button></div></div>`;
      }).join("")}
    </div>
  `;
}

function renderSettings() {
  return `
    ${renderDatabaseStatusCard()}

    <div class="grid cols-2">
      <div class="card">
        <h3>連線設定</h3>
        <p class="metric-sub">狀態已整合為「資料庫狀態」：連線、最後讀取、最後寫入。不要再分開看 Supabase / 後端 / 資料庫。</p>
        <p class="metric-sub">若讀不到資料，先確認：已在資料庫編輯器執行結構檔，且沒有直接開啟列層級安全規則導致缺少存取規則。</p>
      </div>
      <div class="card">
        <h3>資料匯出</h3>
        <p class="metric-sub">可匯出流水帳 CSV、現金流量表 CSV，或完整 Excel .xlsx 工作簿。</p>
        <div class="btn-row">
          <button class="btn secondary" id="exportCsvBtn">匯出流水帳 CSV</button>
          <button class="btn secondary" id="exportCashflowCsvBtn">匯出現金流量表 CSV</button>
          <button class="btn secondary" id="exportXlsxBtn">匯出 Excel .xlsx</button>
          <button class="btn secondary" id="rebuildEntriesBtn">重建分錄</button>
          <button class="btn secondary" id="downloadJsonBtn">下載暫存資料</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>預設常用帳戶</h3>
      <p class="metric-sub">手機快速記帳會優先帶入這些帳戶。設定存在本機瀏覽器，不會寫入資料庫。</p>
      <form id="preferencesForm" class="form-grid two">
        ${field("支出預設帳戶", `<select class="input" name="default_account_expense">${accountOptions(defaultAccountIdFor("expense"))}</select>`)}
        ${field("收入預設帳戶", `<select class="input" name="default_account_income">${accountOptions(defaultAccountIdFor("income"))}</select>`)}
        ${field("轉帳預設轉出帳戶", `<select class="input" name="default_account_transfer">${accountOptions(defaultAccountIdFor("transfer"))}</select>`)}
        ${field("退款預設帳戶", `<select class="input" name="default_account_refund">${accountOptions(defaultAccountIdFor("refund"))}</select>`)}
        <div class="wide btn-row">
          <button class="btn" type="submit">儲存偏好</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h3>重要限制</h3>
      <p class="metric-sub">
        這版沒有 登入驗證 / 列層級安全規則，適合單人測試或非敏感資料。若要公開長期使用，應改成 登入驗證與列層級安全規則。
      </p>
    </div>
  `;
}

function renderCategoryChart() {
  const rows = state.data.categorySpending.filter(r => Number(r.year) === Number(state.selectedBudgetYear)).slice(0, 8);
  if (!rows.length) return `<div class="empty">尚無分類支出資料</div>`;
  const max = Math.max(...rows.map(r => Number(r.expense_amount || 0)), 1);
  return `<div class="chart-list">${rows.map(r => `<div><div class="card-title-row"><span>${escapeHtml(r.category_name || "未分類")}</span><strong>${fmtMoney(r.expense_amount)}</strong></div><div class="mini-progress"><span style="width:${Number(r.expense_amount || 0) / max * 100}%"></span></div></div>`).join("")}</div>`;
}

function renderMonthlyChart() {
  const rows = state.data.monthlyCashflow.filter(r => Number(r.year) === Number(state.selectedBudgetYear));
  if (!rows.length) return `<div class="empty">尚無月度資料</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>月份</th><th>收入</th><th>支出</th><th>淨額</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.month)}</td><td class="good">${fmtMoney(r.income_amount)}</td><td class="bad">${fmtMoney(r.expense_amount)}</td><td>${fmtMoney(r.net_amount)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderTAccountTable() {
  const rows = state.data.transactionEntries
    .filter(e => Number(String(e.entry_date || "").slice(0, 4)) === Number(state.selectedBudgetYear))
    .sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)));
  if (!rows.length) return `<div class="empty">尚無分錄。可在設定頁按「重建分錄」。</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>日期</th><th>借貸</th><th>科目</th><th>金額</th><th>備註</th></tr></thead><tbody>${rows.slice(0, 120).map(e => `<tr><td>${escapeHtml(e.entry_date)}</td><td>${e.side === "debit" ? "借" : "貸"}</td><td>${escapeHtml(e.label || e.entry_type)}</td><td class="mono">${fmtMoney(e.amount)}</td><td>${escapeHtml(e.note || "")}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderTAccountCards() {
  const rows = state.data.transactionEntries
    .filter(e => Number(String(e.entry_date || "").slice(0, 4)) === Number(state.selectedBudgetYear));
  if (!rows.length) return `<div class="empty">尚無分錄。可在設定頁按「重建分錄」。</div>`;
  const map = new Map();
  rows.forEach(e => {
    const key = e.label || e.entry_type || "未命名科目";
    if (!map.has(key)) map.set(key, { label: key, debit: [], credit: [] });
    map.get(key)[e.side === "debit" ? "debit" : "credit"].push(e);
  });
  return `<div class="t-account-grid">${Array.from(map.values()).slice(0, 16).map(group => {
    const debitTotal = group.debit.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const creditTotal = group.credit.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return `<div class="t-account-card"><div class="card-title-row"><h4>${escapeHtml(group.label)}</h4><span class="badge">差餘 ${fmtMoney(debitTotal - creditTotal)}</span></div><div class="t-columns"><div><strong>借方</strong>${group.debit.slice(0, 8).map(e => `<p>${escapeHtml(e.note || "")} <b>${fmtMoney(e.amount)}</b><br><small>${escapeHtml(e.entry_date)}</small></p>`).join("") || "—"}</div><div><strong>貸方</strong>${group.credit.slice(0, 8).map(e => `<p>${escapeHtml(e.note || "")} <b>${fmtMoney(e.amount)}</b><br><small>${escapeHtml(e.entry_date)}</small></p>`).join("") || "—"}</div></div><div class="card-title-row"><small>借方合計 ${fmtMoney(debitTotal)}</small><small>貸方合計 ${fmtMoney(creditTotal)}</small></div></div>`;
  }).join("")}</div>`;
}

function renderFinancialSignals() {
  const s = getCurrentYearSummary();
  const items = budgetItemSummariesForSelectedYear();
  const over = items.filter(i => Number(i.remaining_amount || 0) < 0);
  const highUse = items.filter(i => Number(i.usage_pct || 0) >= 80 && Number(i.remaining_amount || 0) >= 0);
  const cash = Number(s.net_cashflow || 0);
  const notes = [];
  if (cash < 0) notes.push(`今年淨現金流為 ${fmtMoney(cash)}，代表支出高於收入。`);
  if (over.length) notes.push(`${over.length} 個預算項目已超支：${over.map(o => o.name).join("、")}。`);
  if (highUse.length) notes.push(`${highUse.length} 個預算項目使用率超過 80%。`);
  if (!notes.length) notes.push("目前沒有明顯預算警訊。仍需定期檢查訂閱與一次性支出。");
  return `<ul class="signal-list">${notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`;
}

function renderMobileMore() {
  const pages = [
    ["accounts", "帳戶", "現金、銀行、信用卡"],
    ["categories", "分類 / 標籤", "管理分類與標籤"],
    ["recurring", "訂閱管理", "固定扣款與取消狀態"],
    ["creditLoans", "信用卡 / 貸款", "債務與帳單資訊"],
    ["goals", "目標", "儲蓄與還債"],
    ["templates", "模板管理", "快速記帳模板"],
    ["settings", "設定", "匯出與連線狀態"]
  ];
  return `<div class="mobile-more-grid">${pages.map(([tab, title, sub]) => `<button class="mobile-more-card" type="button" data-go="${tab}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span></button>`).join("")}</div>`;
}

function download(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadCacheJson() {
  download(`accounting-cache-${today()}.json`, JSON.stringify(state.data, null, 2));
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(rows) {
  const body = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  return "\ufeff" + body;
}

function transactionExportRows() {
  return [["日期","類型","金額","帳戶","轉入帳戶","分類","預算項目","商家","付款方式","必要程度","現金流性質","狀態","備註"],
    ...transactionsForSelectedYear().map(t => [
      t.transaction_date,
      labelOf(t.type),
      t.amount,
      t.account_name || "",
      t.to_account_name || "",
      t.category_name || "",
      t.budget_item_name || "",
      t.merchant || "",
      t.payment_method || "",
      labelOf(t.necessity_level),
      labelOf(t.cashflow_nature),
      labelOf(t.status),
      t.note || ""
    ])
  ];
}

function exportTransactionsCsv() {
  download(`流水帳-${state.selectedBudgetYear}.csv`, toCsv(transactionExportRows()), "text/csv;charset=utf-8");
  showAlert("已匯出流水帳 CSV。", "good");
}

function addAmount(map, key, amount) {
  map.set(key, (map.get(key) || 0) + Number(amount || 0));
}

function mapToSortedRows(map) {
  return Array.from(map.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function cashflowStatementRows() {
  const tx = transactionsForSelectedYear().filter(t => t.status !== "cancelled");
  const incomeMap = new Map();
  const expenseMap = new Map();
  const transferMap = new Map();
  tx.forEach(t => {
    if (t.type === "income") addAmount(incomeMap, t.category_name || "收入", Number(t.amount || 0));
    if (t.type === "expense") addAmount(expenseMap, t.category_name || "未分類支出", -Number(t.amount || 0));
    if (t.type === "refund") addAmount(expenseMap, `${t.category_name || "未分類支出"}｜退款`, Number(t.amount || 0));
    if (t.type === "transfer") addAmount(transferMap, `${t.account_name || "轉出"} → ${t.to_account_name || "轉入"}`, Number(t.amount || 0));
  });
  const rows = [];
  const incomeRows = mapToSortedRows(incomeMap);
  const expenseRows = mapToSortedRows(expenseMap);
  const transferRows = mapToSortedRows(transferMap);
  const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = expenseRows.reduce((sum, r) => sum + r.amount, 0);
  const freeCashflow = totalIncome + totalExpense;
  rows.push({ section: "營運現金流", item: "收入合計", amount: totalIncome, ratio: totalIncome ? "100%" : "N/A", note: "收入類交易" });
  incomeRows.forEach(r => rows.push({ section: "收入明細", item: r.name, amount: r.amount, ratio: totalIncome ? `${fmtNumber(r.amount / totalIncome * 100, 1)}%` : "N/A", note: "" }));
  rows.push({ section: "營運現金流", item: "支出合計（扣退款）", amount: totalExpense, ratio: totalIncome ? `${fmtNumber(Math.abs(totalExpense) / totalIncome * 100, 1)}% of income` : "N/A", note: "支出為負數，退款為正數" });
  expenseRows.forEach(r => rows.push({ section: "支出明細", item: r.name, amount: r.amount, ratio: totalExpense ? `${fmtNumber(Math.abs(r.amount) / Math.abs(totalExpense) * 100, 1)}%` : "N/A", note: "" }));
  rows.push({ section: "自由現金流", item: "收入 - 淨支出", amount: freeCashflow, ratio: totalIncome ? `${fmtNumber(freeCashflow / totalIncome * 100, 1)}%` : "N/A", note: "不含轉帳" });
  transferRows.forEach(r => rows.push({ section: "轉帳備查", item: r.name, amount: r.amount, ratio: "", note: "轉帳不計入自由現金流" }));
  const budget = getCurrentYearSummary();
  rows.push({ section: "預算摘要", item: "可用預算", amount: budget.available_budget, ratio: "", note: "年度預算 + 前期結轉" });
  rows.push({ section: "預算摘要", item: "已用預算", amount: -budget.actual_expense, ratio: `${fmtNumber(budget.budget_used_pct, 1)}%`, note: "支出扣退款" });
  rows.push({ section: "預算摘要", item: "剩餘預算", amount: budget.remaining_budget, ratio: "", note: "" });
  return rows;
}

function exportCashflowCsv() {
  const rows = [["區塊","項目","金額","比例","備註"], ...cashflowStatementRows().map(r => [r.section, r.item, r.amount, r.ratio, r.note])];
  download(`現金流量表-${state.selectedBudgetYear}.csv`, toCsv(rows), "text/csv;charset=utf-8");
  showAlert("已匯出現金流量表 CSV。", "good");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const sheetData = rows.map((row, rIdx) => {
    const cells = row.map((cell, cIdx) => {
      const ref = `${columnName(cIdx)}${rIdx + 1}`;
      if (typeof cell === "number" && Number.isFinite(cell)) {
        return `<c r="${ref}"><v>${cell}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rIdx + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData></worksheet>`;
}

async function zipStore(files) {
  const encoder = new TextEncoder();
  const fileRecords = [];
  let offset = 0;
  const chunks = [];

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  const crc32 = bytes => {
    let crc = 0xffffffff;
    bytes.forEach(b => { crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8); });
    return (crc ^ 0xffffffff) >>> 0;
  };

  const u16 = n => new Uint8Array([n & 255, (n >>> 8) & 255]);
  const u32 = n => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const concat = parts => {
    const len = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(len);
    let pos = 0;
    parts.forEach(p => { out.set(p, pos); pos += p.length; });
    return out;
  };

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data
    ]);
    chunks.push(local);
    fileRecords.push({ ...file, nameBytes, data, crc, offset });
    offset += local.length;
  }

  const centralStart = offset;
  const central = fileRecords.map(file => concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(file.crc), u32(file.data.length), u32(file.data.length), u16(file.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(file.offset), file.nameBytes
  ]));
  chunks.push(...central);
  const centralSize = central.reduce((sum, p) => sum + p.length, 0);
  chunks.push(concat([u32(0x06054b50), u16(0), u16(0), u16(fileRecords.length), u16(fileRecords.length), u32(centralSize), u32(centralStart), u16(0)]));
  return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function exportWorkbookXlsx() {
  const txRows = transactionExportRows().slice(1);
  const budgetRows = budgetItemSummariesForSelectedYear().map(i => [i.name, labelOf(i.item_type), i.category_name || "", labelOf(i.period_type), i.current_budget_amount, i.actual_amount, i.remaining_amount, `${fmtNumber(i.usage_pct, 1)}%`, i.budget_formula]);
  const contributionRows = enrichedBudgetContributionsForSelectedYear().map(r => [r.contribution_date, r.budget_item_name, r.amount, r.note || ""]);
  const movementRows = enrichedBudgetMovementsForSelectedYear().map(r => [r.movement_date, r.from_name, r.to_name, r.amount, r.note || ""]);
  const entryRows = state.data.transactionEntries
    .filter(e => Number(String(e.entry_date || "").slice(0, 4)) === Number(state.selectedBudgetYear))
    .map(e => [e.entry_date, e.side === "debit" ? "借" : "貸", e.label || e.entry_type, e.amount, e.note || ""]);
  const cashflowRows = cashflowStatementRows().map(r => [r.section, r.item, r.amount, r.ratio, r.note]);
  const categoryExpenseRows = categoryExpenseReportRows().map(r => [r.category, Number(r.amount || 0), `${fmtNumber(r.share * 100, 1)}%`, Number(r.count || 0), Number(r.avg || 0), Number(r.max || 0)]);
  const recurringRows = recurringReportRows().map(r => [r.name, Number(r.monthly || 0), Number(r.annual || 0), r.account, r.category, r.frequency, r.next_due_date, r.status]);
  const monthlyRows = monthlyComparisonReportRows().map(r => [r.month, Number(r.income || 0), Number(r.expense || 0), Number(r.net || 0), r.savingsRate, r.budgetShare]);
  const necessityRows = necessityReportRows().map(r => [r.name, Number(r.amount || 0), `${fmtNumber(r.share * 100, 1)}%`, Number(r.count || 0)]);
  const pnlRows = pnlStatementRows().map(r => [r.section, r.item, r.amount, r.ratio, r.note]);
  const balanceRows = balanceSheetReportRows().map(r => [r.section, r.account, r.type, Number(r.amount || 0), r.note]);

  const sheets = [
    { name: "流水帳", rows: [["日期","類型","金額","帳戶","轉入帳戶","分類","預算項目","商家","付款方式","必要程度","現金流性質","狀態","備註"], ...txRows] },
    { name: "現金流量表", rows: [["區塊","項目","金額","比例","備註"], ...cashflowRows] },
    { name: "個人損益表", rows: [["區塊","項目","金額","比例","備註"], ...pnlRows] },
    { name: "資產負債表", rows: [["區塊","帳戶/項目","類型","金額","備註"], ...balanceRows] },
    { name: "分類支出表", rows: [["分類","金額","占比","筆數","平均單筆","最大單筆"], ...categoryExpenseRows] },
    { name: "固定支出訂閱表", rows: [["服務名稱","月化成本","年化成本","付款帳戶","分類","週期","下次扣款","狀態"], ...recurringRows] },
    { name: "月度比較表", rows: [["月份","收入","支出","淨收支","儲蓄率","占目前可用預算"], ...monthlyRows] },
    { name: "必要程度分析", rows: [["必要程度","金額","占比","筆數"], ...necessityRows] },
    { name: "預算項目", rows: [["名稱","類型","分類","模式","目前可用","實際","剩餘","使用率","計算方式"], ...budgetRows] },
    { name: "預算提撥", rows: [["日期","預算項目","金額","備註"], ...contributionRows] },
    { name: "預算移轉", rows: [["日期","從","到","金額","備註"], ...movementRows] },
    { name: "分錄", rows: [["日期","借貸","科目","金額","備註"], ...entryRows] }
  ];

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const files = [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", content: relsXml },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s.rows) }))
  ];
  const blob = await zipStore(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `個人記帳-${state.selectedBudgetYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showAlert("已匯出 Excel .xlsx。", "good");
}

function confirmAction(title, message) {
  const dialog = $("#confirmDialog");
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  dialog.showModal();
  return new Promise(resolve => {
    const ok = $("#confirmOkBtn");
    const cancel = $("#confirmCancelBtn");
    const cleanup = value => {
      ok.onclick = null;
      cancel.onclick = null;
      dialog.close();
      resolve(value);
    };
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

async function init() {
  if (!window.APP_CONFIG?.supabaseUrl || !window.APP_CONFIG?.supabaseAnonKey) {
    showAlert("缺少 Supabase 設定。請編輯 config.js。", "bad");
    return;
  }
  state.client = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseAnonKey);
  $("#refreshBtn").addEventListener("click", async () => { await loadAll(); render(); });
  $("#exportBtn").addEventListener("click", exportTransactionsCsv);
  $("#yearSelect").addEventListener("change", e => {
    state.selectedYearId = e.target.value;
    const y = state.data.years.find(row => row.id === e.target.value);
    state.selectedBudgetYear = y?.budget_year || state.selectedBudgetYear;
    render();
  });
  await loadAll();
  render();
}

init();
