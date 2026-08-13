const ACTIVE_PAGE_KEY = 'balanceBlock.activePage';
const pageKey = code => `balanceBlock.page.${code}`;
const validPageCode = value => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(value || '');

function decodeSharedPage(value) {
  try {
    const encoded = value.includes('#page=') ? value.split('#page=')[1] : value.replace(/^#?page=/, '');
    if (!encoded) return null;
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
    const page = JSON.parse(new TextDecoder().decode(bytes));
    if (!page || !Number.isFinite(Number(page.startingBalance)) || !Array.isArray(page.recurring) || !Array.isArray(page.variables)) return null;
    return page;
  } catch {
    return null;
  }
}

const sharedPage = decodeSharedPage(window.location.hash);
let activePageCode = sharedPage ? (validPageCode(sharedPage.pageCode) ? sharedPage.pageCode : generatePageCode()) : localStorage.getItem(ACTIVE_PAGE_KEY) || '';
let savedPage = sharedPage || (activePageCode ? readPage(activePageCode) : null);
let recurring = savedPage?.recurring || [];
let variables = savedPage?.variables || [];
let pointAdjustments = savedPage?.pointAdjustments || [];

function readPage(code) {
  try { return JSON.parse(localStorage.getItem(pageKey(code)) || 'null'); }
  catch { return null; }
}

function generatePageCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint8Array(8);
  crypto.getRandomValues(values);
  const raw = [...values].map(value => alphabet[value % alphabet.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function savePage() {
  if (!activePageCode) return;
  localStorage.setItem(pageKey(activePageCode), JSON.stringify(pageData()));
  localStorage.setItem(ACTIVE_PAGE_KEY, activePageCode);
}

function pageData() {
  return { version: 2, pageCode: activePageCode, startingBalance: getStartingBalance(), recurring, variables, pointAdjustments };
}

function shareLink() {
  const page = JSON.stringify(pageData());
  const bytes = new TextEncoder().encode(page);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${window.location.origin}${window.location.pathname}${window.location.search}#page=${encoded}`;
}
const frequencyLabels = {
  daily: 'Daily',
  'twice-weekly': 'Twice a week',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly'
};
const money = value => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const escapeHTML = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const itemColor = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#3759f0';

function renderCards(items, target) {
  const isVariableList = target === 'variableList';
  document.getElementById(target).innerHTML = items.map((item, index) => `<article class="item-card" style="--card-color:${itemColor(item.color)}"><input class="item-color" type="color" value="${itemColor(item.color)}" data-index="${index}" aria-label="Change the point color for ${escapeHTML(item.name)}" title="Change point color" /><div class="item-top"><span>${escapeHTML(item.name)}</span><span class="${item.amount >= 0 ? 'positive' : 'negative'}">${money(item.amount)}</span></div><small>${escapeHTML(isVariableList ? formatStartDate(item.date) : `${formatFrequency(item)} • Starts ${formatStartDate(item.start)}`)}</small><div class="item-actions"><button type="button" data-action="edit" data-index="${index}" aria-label="Edit ${escapeHTML(item.name)}">EDIT</button><button type="button" data-action="delete" data-index="${index}" aria-label="Delete ${escapeHTML(item.name)}">DELETE</button></div></article>`).join('');
}
function renderTransactions() {
  const from = parseDate(document.getElementById('forecastFrom').value);
  const to = parseDate(document.getElementById('forecastTo').value);
  const points = projectionPoints(from, to).slice(1);
  const rows = points.flatMap(point => point.events.map(event => ({ ...event, date: point.date, balance: point.balance })));
  document.getElementById('transactionRows').innerHTML = rows.length
    ? rows.map(row => `<tr><td>${formatStartDate(isoDate(row.date))}</td><td>${escapeHTML(row.name)} <small>${row.type}</small></td><td class="${row.amount >= 0 ? 'positive' : 'negative'}">${money(row.amount)}</td><td>${money(row.balance)}</td></tr>`).join('')
    : '<tr><td colspan="4">No upcoming activity yet. Add a recurring item or one-time change to get started.</td></tr>';
}
const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1);
let calendarDate = startOfMonth(new Date());
const isoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset);
  const gridEnd = addDays(gridStart, 41);
  const calendarChanges = forecastChanges(gridStart, gridEnd, true);
  const today = isoDate(new Date());

  document.getElementById('calendarTitle').textContent = firstDay.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  document.getElementById('calendarGrid').innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = isoDate(date);
    const classes = ['day'];

    if (date.getMonth() !== month) classes.push('muted');
    if (dateKey === today) classes.push('today');

    const events = calendarChanges.get(dateKey)?.events || [];
    const eventMarkup = events.length ? `<div class="day-events">${events.slice(0, 3).map(item => `<span class="day-event ${item.amount >= 0 ? 'positive' : ''}" title="${escapeHTML(item.name)}: ${money(item.amount)}">${escapeHTML(item.name)} ${money(item.amount)}</span>`).join('')}${events.length > 3 ? `<span class="day-event">+${events.length - 3} more</span>` : ''}</div>` : '';
    const dayLabel = `${date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })}${events.length ? `. ${events.map(item => `${item.name} ${money(item.amount)}`).join(', ')}` : ''}`;
    return `<div class="${classes.join(' ')}" aria-label="${escapeHTML(dayLabel)}">${date.getDate()}${eventMarkup}</div>`;
  }).join('');
}
const startingBalanceInput = document.getElementById('startingBalance');
const todayForForecast = new Date();
const forecastFromInput = document.getElementById('forecastFrom');
const todayForecastDate = () => isoDate(new Date());
forecastFromInput.value = todayForecastDate();
forecastFromInput.min = todayForecastDate();
forecastFromInput.max = todayForecastDate();
document.getElementById('forecastTo').value = isoDate(new Date(todayForForecast.getFullYear() + 1, todayForForecast.getMonth(), todayForForecast.getDate()));
if (savedPage) startingBalanceInput.value = savedPage.startingBalance ?? 0;
const getStartingBalance = () => Number.isFinite(startingBalanceInput.valueAsNumber) ? startingBalanceInput.valueAsNumber : 0;
if (sharedPage) {
  savePage();
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}
const parseDate = value => new Date(`${value}T00:00:00`);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const balanceAnchorDate = parseDate(document.getElementById('forecastFrom').value);

function recurringDates(item, from, to) {
  const dates = [];
  const start = parseDate(item.start);
  if (Number.isNaN(start.getTime())) return dates;
  let date = start;
  let occurrence = 0;
  while (date < from) {
    occurrence += 1;
    date = nextOccurrence(item, start, occurrence);
  }
  while (date <= to) {
    dates.push(date);
    occurrence += 1;
    date = nextOccurrence(item, start, occurrence);
  }
  return dates;
}

function nextOccurrence(item, start, occurrence) {
  if (item.frequency === 'daily') return addDays(start, occurrence);
  if (item.frequency === 'twice-weekly') return addDays(start, Math.floor(occurrence / 2) * 7 + (occurrence % 2) * 3);
  if (item.frequency === 'weekly') return addDays(start, occurrence * 7);
  if (item.frequency === 'biweekly') return addDays(start, occurrence * 14);
  if (item.frequency === 'custom-weeks') return addDays(start, occurrence * 7 * Math.max(1, item.interval));
  const interval = item.frequency === 'custom-months' ? Math.max(1, item.interval) : 1;
  const month = start.getMonth() + occurrence * interval;
  const lastDay = new Date(start.getFullYear(), month + 1, 0).getDate();
  return new Date(start.getFullYear(), month, Math.min(start.getDate(), lastDay));
}

function forecastChanges(from, to, includeFrom = false) {
  const changes = new Map();
  const addChange = (date, item, type) => {
    const key = isoDate(date);
    const change = changes.get(key) || { amount: 0, events: [] };
    change.amount += item.amount;
    change.events.push({ name: item.name, amount: item.amount, color: itemColor(item.color), type, sourceType: item.sourceType, sourceIndex: item.sourceIndex });
    changes.set(key, change);
  };
  recurring.forEach((item, sourceIndex) => recurringDates(item, includeFrom ? from : addDays(from, 1), to).forEach(date => {
    const dateKey = isoDate(date);
    const futureChanges = (item.amountChanges || []).filter(change => change.date <= dateKey).sort((a, b) => a.date.localeCompare(b.date));
    const amount = Object.hasOwn(item.overrides || {}, dateKey) ? item.overrides[dateKey] : (futureChanges.at(-1)?.amount ?? item.amount);
    addChange(date, { ...item, amount, sourceType: 'recurring', sourceIndex }, 'Recurring');
  }));
  variables.forEach((item, sourceIndex) => {
    const date = parseDate(item.date);
    // One-time changes represent activity on a specific day. Include changes on
    // the forecast's first day so a balance audit performed "today" immediately
    // reconciles the opening point of the graph.
    if (date >= from && date <= to) addChange(date, { ...item, sourceType: 'variable', sourceIndex }, 'One-time');
  });
  return changes;
}

function setRecurringAmountFromDate(item, date, amount) {
  item.amountChanges = [
    ...(item.amountChanges || []).filter(change => change.date < date),
    { date, amount }
  ];
  item.overrides = Object.fromEntries(
    Object.entries(item.overrides || {}).filter(([overrideDate]) => overrideDate < date)
  );
}

function projectionPoints(from, to) {
  const changes = forecastChanges(from, to);
  const anchorKey = isoDate(from);
  const anchorChange = changes.get(anchorKey);
  let balance = getStartingBalance() + (anchorChange?.amount || 0);
  changes.delete(anchorKey);
  const adjustmentFor = date => pointAdjustments.filter(item => item.date === isoDate(date)).reduce((sum, item) => sum + item.amount, 0);
  const startingAdjustment = adjustmentFor(from);
  return [{ date: from, balance: balance + startingAdjustment, events: [{ name: 'Starting balance', amount: getStartingBalance(), type: 'Starting point' }, ...(anchorChange?.events || []), ...(startingAdjustment ? [{ name: 'Point-only adjustment', amount: startingAdjustment, type: 'Adjustment' }] : [])] }, ...[...changes].sort(([a], [b]) => a.localeCompare(b)).map(([date, change]) => {
    balance += change.amount;
    const adjustment = adjustmentFor(parseDate(date));
    return { date: parseDate(date), balance: balance + adjustment, events: [...change.events, ...(adjustment ? [{ name: 'Point-only adjustment', amount: adjustment, type: 'Adjustment' }] : [])] };
  })];
}

function linearTrend(points) {
  if (!points.length) return null;
  if (points.length === 1) return { start: points[0].balance, end: points[0].balance };
  const origin = points[0].date.getTime();
  const times = points.map(point => (point.date.getTime() - origin) / 86400000);
  const meanTime = times.reduce((sum, value) => sum + value, 0) / times.length;
  const meanBalance = points.reduce((sum, point) => sum + point.balance, 0) / points.length;
  const variance = times.reduce((sum, value) => sum + (value - meanTime) ** 2, 0);
  const slope = variance
    ? points.reduce((sum, point, index) => sum + (times[index] - meanTime) * (point.balance - meanBalance), 0) / variance
    : 0;
  return {
    start: meanBalance + slope * (times[0] - meanTime),
    end: meanBalance + slope * (times.at(-1) - meanTime)
  };
}

function drawChart() {
  const svg = document.getElementById('balanceChart'), width = 900, height = 270, pad = { l: 62, r: 24, t: 22, b: 38 };
  // The entered balance is the account balance today, so every forecast must
  // be anchored to today rather than moving that balance to an arbitrary date.
  forecastFromInput.value = todayForecastDate();
  forecastFromInput.min = forecastFromInput.value;
  forecastFromInput.max = forecastFromInput.value;
  const from = parseDate(forecastFromInput.value);
  const to = parseDate(document.getElementById('forecastTo').value);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return;
  const points = projectionPoints(from, to);
  const values = points.map(point => point.balance);
  const low = Math.min(...values), high = Math.max(...values);
  const spread = Math.max(100, high - low);
  const chartMin = Math.floor((low - spread * .12) / 500) * 500;
  const chartMax = Math.max(low < 0 ? 0 : -Infinity, Math.ceil((high + spread * .12) / 500) * 500);
  const duration = to - from;
  const x = date => pad.l + (date - from) / duration * (width - pad.l - pad.r);
  const y = value => height - pad.b - (value - chartMin) / (chartMax - chartMin) * (height - pad.t - pad.b);
  const formatAxisMoney = value => `${value < 0 ? '-' : ''}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(Math.abs(value) % 1000 ? 1 : 0)}k` : Math.abs(value)}`;
  let html = '';
  if (chartMin < 0) {
    const zeroY = y(0);
    html += `<rect class="negative-zone" x="${pad.l}" y="${zeroY}" width="${width-pad.l-pad.r}" height="${height-pad.b-zeroY}"/>`;
    html += `<text class="negative-zone-label" x="${width-pad.r-8}" y="${Math.min(height-pad.b-8, zeroY+16)}" text-anchor="end">NEGATIVE BALANCE</text>`;
  }
  for (let i = 0; i <= 4; i += 1) {
    const value = chartMin + (chartMax - chartMin) * i / 4;
    html += `<line x1="${pad.l}" y1="${y(value)}" x2="${width-pad.r}" y2="${y(value)}" stroke="#c8c5bd"/><text x="8" y="${y(value)+4}" font-size="10" fill="#666">${formatAxisMoney(value)}</text>`;
  }
  for (let i = 0; i <= 6; i += 1) {
    const date = new Date(from.getTime() + duration * i / 6), xx = x(date);
    html += `<line x1="${xx}" y1="${pad.t}" x2="${xx}" y2="${height-pad.b}" stroke="#e0ddd5"/><text x="${xx}" y="${height-12}" text-anchor="middle" font-size="9" fill="#666">${date.toLocaleDateString('en-US', { month: 'short', day: duration < 1000*60*60*24*100 ? 'numeric' : undefined }).toUpperCase()}</text>`;
  }
  if (chartMin <= 0 && chartMax >= 0) {
    html += `<line class="zero-line" x1="${pad.l}" y1="${y(0)}" x2="${width-pad.r}" y2="${y(0)}"/><text class="zero-label" x="${pad.l+8}" y="${y(0)-7}">$0 · ZERO</text>`;
  }
  const line = points.map(point => `${x(point.date)},${y(point.balance)}`).join(' ');
  const trend = linearTrend(points);
  html += `<line class="trend-line" x1="${x(points[0].date)}" y1="${y(trend.start)}" x2="${x(points.at(-1).date)}" y2="${y(trend.end)}"><title>Best-fit trend based on all ${points.length} forecast data points</title></line><polyline points="${line}" fill="none" stroke="#151515" stroke-width="3"/>`;
  points.forEach((point, index) => {
    const eventSummary = point.events.map(item => `${item.type} ${item.name} ${money(item.amount)}`).join(', ');
    const label = `${point.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}: ${eventSummary}. Balance ${money(point.balance)}`;
    const pointColor = itemColor(point.events.find(event => event.color)?.color);
    html += `<circle class="chart-point" data-index="${index}" cx="${x(point.date)}" cy="${y(point.balance)}" r="4" fill="#fff" stroke="${pointColor}" stroke-width="2" tabindex="0" role="img" aria-label="${escapeHTML(label)}"/>`;
  });
  html += '<g class="chart-tooltip" visibility="hidden"><rect width="230" rx="2"/><text></text></g>';
  svg.innerHTML = html;
  const tooltip = svg.querySelector('.chart-tooltip'), tooltipRect = tooltip.querySelector('rect'), tooltipText = tooltip.querySelector('text');
  const showTooltip = event => {
    const point = points[Number(event.currentTarget.dataset.index)], px = x(point.date), py = y(point.balance);
    const lines = [
      point.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      ...point.events.map(item => `${item.type} — ${item.name}: ${money(item.amount)}`),
      `Balance: ${money(point.balance)}`
    ];
    const tooltipHeight = 12 + lines.length * 16;
    const tx = Math.min(width - 234, Math.max(4, px - 115)), ty = py < tooltipHeight + 12 ? py + 10 : py - tooltipHeight - 8;
    tooltip.setAttribute('transform', `translate(${tx} ${ty})`);
    tooltipRect.setAttribute('height', tooltipHeight);
    tooltipText.replaceChildren(...lines.map((line, index) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', '8');
      tspan.setAttribute('y', String(17 + index * 16));
      tspan.textContent = line;
      return tspan;
    }));
    tooltip.setAttribute('visibility', 'visible');
  };
  const openSelectedPoint = event => openPointDialog(points[Number(event.currentTarget.dataset.index)]);
  svg.querySelectorAll('.chart-point').forEach(point => {
    point.addEventListener('mouseenter', showTooltip); point.addEventListener('focus', showTooltip);
    point.addEventListener('mouseleave', () => tooltip.setAttribute('visibility', 'hidden')); point.addEventListener('blur', () => tooltip.setAttribute('visibility', 'hidden'));
    point.addEventListener('click', openSelectedPoint);
    point.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSelectedPoint(event); }
    });
  });
  document.getElementById('forecastLow').textContent = money(low);
  document.getElementById('forecastHigh').textContent = money(high);
  document.getElementById('headerBalance').textContent = money(getStartingBalance());
  renderTransactions();
  renderCalendar();
}
function renderPage() {
  renderCards(recurring,'recurringList'); renderCards(variables,'variableList'); drawChart();
}
renderPage();

const pointDialog = document.getElementById('pointDialog');
const pointBalanceInput = document.getElementById('pointBalance');
const pointActionSelect = document.getElementById('pointAction');
let selectedPoint = null;
const selectedAction = () => selectedPoint?.events.filter(event => event.sourceType)[Number(pointActionSelect.value)];
function updatePointChange() {
  const action = selectedAction();
  const newAmount = pointBalanceInput.valueAsNumber;
  const difference = Number.isFinite(newAmount) && action ? newAmount - action.amount : 0;
  const appliesToFuture = document.querySelector('input[name="pointScope"]:checked').value === 'future';
  document.getElementById('pointChange').textContent = Number.isFinite(newAmount) && action
    ? `${action.name} will change from ${money(action.amount)} to ${money(newAmount)}${action.sourceType === 'recurring' && appliesToFuture ? ' from this date forward' : ' on this date'}.`
    : '';
  return difference;
}
function loadSelectedAction() {
  const action = selectedAction();
  if (!action) return;
  pointBalanceInput.value = action.amount.toFixed(2);
  document.querySelector('.point-scope').hidden = action.sourceType !== 'recurring';
  updatePointChange();
  pointBalanceInput.select();
}
function openPointDialog(point) {
  selectedPoint = point;
  const actions = point.events.filter(event => event.sourceType);
  if (!actions.length) return;
  document.getElementById('pointDate').textContent = point.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  document.getElementById('pointCurrentBalance').textContent = `${actions.length} ${actions.length === 1 ? 'ACTION' : 'ACTIONS'}`;
  pointActionSelect.innerHTML = actions.map((action, index) => `<option value="${index}">${escapeHTML(action.name)} — ${money(action.amount)}</option>`).join('');
  document.querySelector('input[name="pointScope"][value="single"]').checked = true;
  loadSelectedAction();
  pointDialog.showModal();
  pointBalanceInput.select();
}
pointBalanceInput.addEventListener('input', updatePointChange);
pointActionSelect.addEventListener('change', loadSelectedAction);
document.querySelectorAll('input[name="pointScope"]').forEach(input => input.addEventListener('change', updatePointChange));
document.getElementById('savePoint').addEventListener('click', event => {
  if (!document.getElementById('pointForm').reportValidity()) { event.preventDefault(); return; }
  const action = selectedAction();
  const newAmount = Math.round(pointBalanceInput.valueAsNumber * 100) / 100;
  const difference = Math.round(updatePointChange() * 100) / 100;
  const appliesToFuture = document.querySelector('input[name="pointScope"]:checked').value === 'future';
  if (difference !== 0 && action.sourceType === 'recurring') {
    const item = recurring[action.sourceIndex];
    const date = isoDate(selectedPoint.date);
    if (appliesToFuture) {
      setRecurringAmountFromDate(item, date, newAmount);
    } else {
      item.overrides = { ...(item.overrides || {}), [date]: newAmount };
    }
  } else if (difference !== 0 && action.sourceType === 'variable') {
    variables[action.sourceIndex].amount = newAmount;
  }
  savePage();
  renderCards(variables, 'variableList');
  drawChart();
  showToast(difference === 0 ? 'That action already has this amount.' : `${action.name} updated.`);
});

const welcomeDialog = document.getElementById('welcomeDialog');
function enterPage() {
  document.body.classList.add('page-ready');
  document.getElementById('headerPageCodeValue').textContent = activePageCode;
  if (welcomeDialog.open) welcomeDialog.close();
  renderPage();
}
if (savedPage) {
  enterPage();
  if (sharedPage) showToast(`Saved page ${activePageCode} imported to this browser.`);
}
else welcomeDialog.showModal();

document.getElementById('welcomeForm').addEventListener('submit', event => {
  event.preventDefault();
  activePageCode = generatePageCode();
  while (readPage(activePageCode)) activePageCode = generatePageCode();
  recurring = [];
  variables = [];
  pointAdjustments = [];
  startingBalanceInput.value = document.getElementById('welcomeBalance').value || '0';
  savePage();
  enterPage();
});
document.getElementById('welcomeCode').addEventListener('input', event => {
  if (event.target.value.includes('#page=') || event.target.value.startsWith('page=')) return;
  const raw = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8);
  event.target.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
});
document.getElementById('openSavedPage').addEventListener('click', () => {
  const enteredValue = document.getElementById('welcomeCode').value.trim();
  const importedPage = decodeSharedPage(enteredValue);
  const code = enteredValue.toUpperCase();
  const page = importedPage || readPage(code);
  if (!page) {
    document.getElementById('welcomeError').textContent = 'That page is not saved here, or the share link is invalid.';
    return;
  }
  activePageCode = importedPage ? (validPageCode(importedPage.pageCode) ? importedPage.pageCode : generatePageCode()) : code;
  savedPage = page;
  recurring = page.recurring || [];
  variables = page.variables || [];
  pointAdjustments = page.pointAdjustments || [];
  startingBalanceInput.value = page.startingBalance ?? 0;
  savePage();
  enterPage();
  if (importedPage) showToast(`Saved page ${activePageCode} imported to this browser.`);
});

function importPage(page) {
  if (!page || !Number.isFinite(Number(page.startingBalance)) || !Array.isArray(page.recurring) || !Array.isArray(page.variables)) throw new Error('Invalid backup');
  activePageCode = validPageCode(page.pageCode) ? page.pageCode : generatePageCode();
  recurring = page.recurring;
  variables = page.variables;
  pointAdjustments = Array.isArray(page.pointAdjustments) ? page.pointAdjustments : [];
  startingBalanceInput.value = Number(page.startingBalance).toFixed(2);
  savePage();
  enterPage();
  if (settingsDialog.open) settingsDialog.close();
  showToast(`Backup imported as page ${activePageCode}.`);
}

async function importBackupFile(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    importPage(JSON.parse(await file.text()));
  } catch {
    showToast('That backup file is invalid.');
  }
  event.target.value = '';
}

document.getElementById('welcomeImportFile').addEventListener('change', importBackupFile);
document.getElementById('importPageFile').addEventListener('change', importBackupFile);

document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');const from=parseDate(document.getElementById('forecastFrom').value);const month=from.getMonth()+Number(button.dataset.range);const lastDay=new Date(from.getFullYear(),month+1,0).getDate();const to=new Date(from.getFullYear(),month,Math.min(from.getDate(),lastDay));document.getElementById('forecastTo').value=isoDate(to);drawChart();}));
forecastFromInput.addEventListener('change', drawChart);
document.getElementById('forecastTo').addEventListener('change', drawChart);
startingBalanceInput.addEventListener('input', () => { drawChart(); savePage(); });
const dialog=document.getElementById('itemDialog'); let itemType='recurring';
const frequencySelect = document.getElementById('itemFrequency');
const intervalField = document.getElementById('intervalField');
const intervalInput = document.getElementById('itemInterval');
const startInput = document.getElementById('itemStart');
const dateLabel = document.getElementById('itemDateLabel');
let editingItemIndex = null;
function updateIntervalField() {
  const unit = frequencySelect.value === 'custom-months' ? 'months' : frequencySelect.value === 'custom-weeks' ? 'weeks' : '';
  intervalField.hidden = !unit;
  intervalInput.required = Boolean(unit);
  document.getElementById('intervalLabel').textContent = unit ? `NUMBER OF ${unit.toUpperCase()}` : '';
}
function formatFrequency(item) {
  if (item.frequency === 'custom-months') return `Every ${item.interval} ${Number(item.interval) === 1 ? 'month' : 'months'}`;
  if (item.frequency === 'custom-weeks') return `Every ${item.interval} ${Number(item.interval) === 1 ? 'week' : 'weeks'}`;
  return frequencyLabels[item.frequency];
}
function formatStartDate(value) {
  if (!value) return 'on a date to be set';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function openDialog(type, index=null){itemType=type;editingItemIndex=index;document.getElementById('dialogTitle').textContent=index===null?(type==='recurring'?'Add recurring item':'Add one-time change'):(type==='recurring'?'Edit recurring item':'Edit one-time change');document.getElementById('saveItem').textContent=index===null?'SAVE ITEM':'SAVE CHANGES';document.getElementById('itemForm').reset();document.getElementById('recurrenceFields').hidden=type!=='recurring';dateLabel.textContent=type==='recurring'?'STARTS':'OCCURS ON';frequencySelect.value='monthly';intervalInput.value='2';startInput.value=isoDate(new Date());if(index!==null){const item=(type==='recurring'?recurring:variables)[index];document.getElementById('itemName').value=item.name;document.getElementById('itemAmount').value=item.amount;startInput.value=(type==='recurring'?item.start:item.date)||isoDate(new Date());if(type==='recurring'){frequencySelect.value=item.frequency;intervalInput.value=item.interval||2;}}updateIntervalField();dialog.showModal();}
document.getElementById('addRecurring').addEventListener('click',()=>openDialog('recurring')); document.getElementById('addVariable').addEventListener('click',()=>openDialog('variable'));
frequencySelect.addEventListener('change', updateIntervalField);
document.getElementById('saveItem').addEventListener('click',e=>{const form=document.getElementById('itemForm');if(!form.reportValidity()){e.preventDefault();return;}const item={name:document.getElementById('itemName').value.trim(),amount:Number(document.getElementById('itemAmount').value),color:'#3759f0'};if(itemType==='recurring'){item.frequency=frequencySelect.value;item.interval=frequencySelect.value.startsWith('custom-')?Number(intervalInput.value):undefined;item.start=startInput.value;if(editingItemIndex!==null){item.color=recurring[editingItemIndex].color;item.overrides=recurring[editingItemIndex].overrides;item.amountChanges=recurring[editingItemIndex].amountChanges;recurring[editingItemIndex]=item;}else recurring.push(item);}else{item.date=startInput.value;if(editingItemIndex!==null){item.color=variables[editingItemIndex].color;variables[editingItemIndex]=item;}else variables.push(item);}savePage();renderCards(itemType==='recurring'?recurring:variables,itemType==='recurring'?'recurringList':'variableList');drawChart();showToast(editingItemIndex===null?'Item added to your forecast.':itemType==='recurring'?'Recurring item updated.':'One-time change updated.');});
document.getElementById('recurringList').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'edit') openDialog('recurring', index);
  if (button.dataset.action === 'delete' && window.confirm(`Delete ${recurring[index].name}?`)) {
    recurring.splice(index, 1);
    savePage();
    renderCards(recurring, 'recurringList');
    drawChart();
    showToast('Recurring item deleted.');
  }
});
document.getElementById('variableList').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'edit') openDialog('variable', index);
  if (button.dataset.action === 'delete' && window.confirm(`Delete ${variables[index].name}?`)) {
    variables.splice(index, 1);
    savePage();
    renderCards(variables, 'variableList');
    drawChart();
    showToast('One-time change deleted.');
  }
});
function updateItemColor(event, items, target, itemLabel) {
  if (!event.target.matches('.item-color')) return;
  const index = Number(event.target.dataset.index);
  if (!items[index]) return;
  items[index].color = itemColor(event.target.value);
  savePage();
  renderCards(items, target);
  drawChart();
  showToast(`${itemLabel} point color updated.`);
}
document.getElementById('recurringList').addEventListener('change', event => updateItemColor(event, recurring, 'recurringList', 'Recurring item'));
document.getElementById('variableList').addEventListener('change', event => updateItemColor(event, variables, 'variableList', 'One-time change'));
function showToast(message){const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200)}

const auditDialog = document.getElementById('auditDialog');
const auditActual = document.getElementById('auditActual');
const auditResult = document.getElementById('auditResult');
let expectedAuditBalance = getStartingBalance();
function balanceOn(date) {
  if (date < balanceAnchorDate) return getStartingBalance();
  return projectionPoints(balanceAnchorDate, date).at(-1).balance;
}
function updateAuditResult() {
  const hasValue = auditActual.value.trim() !== '' && Number.isFinite(auditActual.valueAsNumber);
  const difference = hasValue ? Math.round((auditActual.valueAsNumber - expectedAuditBalance) * 100) / 100 : 0;
  document.getElementById('auditDifference').textContent = money(difference);
  auditResult.classList.toggle('over', hasValue && difference > 0);
  auditResult.classList.toggle('under', hasValue && difference < 0);
  document.getElementById('auditExplanation').textContent = !hasValue
    ? 'Enter your current balance to see the adjustment.'
    : difference === 0
      ? 'You’re right on forecast. No adjustment is needed.'
      : `You’re ${money(Math.abs(difference))} ${difference > 0 ? 'over' : 'under'} today’s forecast.`;
  document.getElementById('saveAudit').disabled = !hasValue || difference === 0;
  return difference;
}
document.getElementById('auditButton').addEventListener('click', () => {
  const today = new Date();
  expectedAuditBalance = balanceOn(today);
  document.getElementById('auditDate').textContent = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  document.getElementById('auditExpected').textContent = money(expectedAuditBalance);
  auditActual.value = '';
  updateAuditResult();
  auditDialog.showModal();
  auditActual.focus();
});
auditActual.addEventListener('input', updateAuditResult);
document.getElementById('saveAudit').addEventListener('click', event => {
  if (!document.getElementById('auditForm').reportValidity()) { event.preventDefault(); return; }
  const difference = updateAuditResult();
  if (difference === 0) { event.preventDefault(); return; }
  variables.push({ name: 'Balance audit adjustment', amount: difference, date: isoDate(new Date()), color: difference > 0 ? '#14a467' : '#f04444' });
  savePage();
  renderCards(variables, 'variableList');
  drawChart();
  showToast(`${money(Math.abs(difference))} ${difference > 0 ? 'credit' : 'charge'} added for today.`);
});
function changeCalendarMonth(offset) {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + offset, 1);
  renderCalendar();
}
document.getElementById('prevMonth').addEventListener('click', () => changeCalendarMonth(-1));
document.getElementById('nextMonth').addEventListener('click', () => changeCalendarMonth(1));
document.getElementById('todayMonth').addEventListener('click', () => {
  calendarDate = startOfMonth(new Date());
  renderCalendar();
});

document.querySelectorAll('.collapse-button').forEach(button => {
  const expandedLabel = button.getAttribute('aria-label');
  button.addEventListener('click', () => {
    const panel = button.closest('.panel');
    const collapsed = panel.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? expandedLabel.replace('Minimize', 'Expand') : expandedLabel);
    button.textContent = collapsed ? '+' : '−';
  });
});

const settingsDialog = document.getElementById('settingsDialog');
const savedPageLink = document.getElementById('savedPageLink');
document.getElementById('headerPageCode').addEventListener('click', async () => {
  const url = shareLink();
  document.getElementById('pageCode').textContent = activePageCode;
  savedPageLink.value = url;
  if (!settingsDialog.open) settingsDialog.showModal();
  try {
    await navigator.clipboard.writeText(url);
    showToast('Saved page link copied and shown in Settings.');
  } catch {
    showToast('Open settings to copy a snapshot link.');
  }
});
document.getElementById('openSettings').addEventListener('click', () => {
  document.getElementById('pageCode').textContent = activePageCode;
  savedPageLink.value = shareLink();
  settingsDialog.showModal();
});
document.getElementById('sharePage').addEventListener('click', async () => {
  const url = shareLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: `Balance Block ${activePageCode}`, text: 'Open my saved Balance Block page.', url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Saved page link copied. Send it to your phone and open it there.');
  } catch {
    window.prompt('Copy and send this saved page link to your phone:', url);
  }
});
document.getElementById('copyShareLink').addEventListener('click', async () => {
  const url = shareLink();
  savedPageLink.value = url;
  try {
    await navigator.clipboard.writeText(url);
    savedPageLink.focus();
    savedPageLink.select();
    showToast('Saved page link copied and shown below.');
  } catch {
    savedPageLink.focus();
    savedPageLink.select();
    showToast('Link shown below. Select it and copy manually.');
  }
});
document.getElementById('exportPage').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(pageData(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `balance-block-${activePageCode}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`Backup for ${activePageCode} exported.`);
});
document.getElementById('closePage').addEventListener('click', () => {
  savePage();
  localStorage.removeItem(ACTIVE_PAGE_KEY);
  window.location.reload();
});
document.getElementById('clearPage').addEventListener('click', () => {
  if (!window.confirm('Clear this page and all of its locally saved data?')) return;
  localStorage.removeItem(pageKey(activePageCode));
  localStorage.removeItem(ACTIVE_PAGE_KEY);
  window.location.reload();
});
