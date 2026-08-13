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

function renderCards(items, target) {
  const isVariableList = target === 'variableList';
  document.getElementById(target).innerHTML = items.map((item, index) => `<article class="item-card" style="--card-color:${item.color}"><div class="item-top"><span>${escapeHTML(item.name)}</span><span class="${item.amount >= 0 ? 'positive' : 'negative'}">${money(item.amount)}</span></div><small>${escapeHTML(isVariableList ? formatStartDate(item.date) : `${formatFrequency(item)} • Starts ${formatStartDate(item.start)}`)}</small><div class="item-actions"><button type="button" data-action="edit" data-index="${index}" aria-label="Edit ${escapeHTML(item.name)}">EDIT</button><button type="button" data-action="delete" data-index="${index}" aria-label="Delete ${escapeHTML(item.name)}">DELETE</button></div></article>`).join('');
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
document.getElementById('forecastFrom').value = isoDate(todayForForecast);
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
    change.events.push({ name: item.name, amount: item.amount, type });
    changes.set(key, change);
  };
  recurring.forEach(item => recurringDates(item, includeFrom ? from : addDays(from, 1), to).forEach(date => addChange(date, item, 'Recurring')));
  variables.forEach(item => {
    const date = parseDate(item.date);
    if ((includeFrom ? date >= from : date > from) && date <= to) addChange(date, item, 'One-time');
  });
  return changes;
}

function projectionPoints(from, to) {
  const changes = forecastChanges(from, to);
  let balance = getStartingBalance();
  const adjustmentFor = date => pointAdjustments.filter(item => item.date === isoDate(date)).reduce((sum, item) => sum + item.amount, 0);
  const startingAdjustment = adjustmentFor(from);
  return [{ date: from, balance: balance + startingAdjustment, events: [{ name: 'Starting balance', amount: balance, type: 'Starting point' }, ...(startingAdjustment ? [{ name: 'Point-only adjustment', amount: startingAdjustment, type: 'Adjustment' }] : [])] }, ...[...changes].sort(([a], [b]) => a.localeCompare(b)).map(([date, change]) => {
    balance += change.amount;
    const adjustment = adjustmentFor(parseDate(date));
    return { date: parseDate(date), balance: balance + adjustment, events: [...change.events, ...(adjustment ? [{ name: 'Point-only adjustment', amount: adjustment, type: 'Adjustment' }] : [])] };
  })];
}

function drawChart() {
  const svg = document.getElementById('balanceChart'), width = 900, height = 270, pad = { l: 62, r: 24, t: 22, b: 38 };
  const from = parseDate(document.getElementById('forecastFrom').value);
  const to = parseDate(document.getElementById('forecastTo').value);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return;
  const points = projectionPoints(from, to);
  const values = points.map(point => point.balance);
  const low = Math.min(...values), high = Math.max(...values);
  const spread = Math.max(100, high - low), chartMin = Math.floor((low - spread * .12) / 500) * 500, chartMax = Math.ceil((high + spread * .12) / 500) * 500;
  const duration = to - from;
  const x = date => pad.l + (date - from) / duration * (width - pad.l - pad.r);
  const y = value => height - pad.b - (value - chartMin) / (chartMax - chartMin) * (height - pad.t - pad.b);
  const formatAxisMoney = value => `${value < 0 ? '-' : ''}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(Math.abs(value) % 1000 ? 1 : 0)}k` : Math.abs(value)}`;
  let html = '';
  for (let i = 0; i <= 4; i += 1) {
    const value = chartMin + (chartMax - chartMin) * i / 4;
    html += `<line x1="${pad.l}" y1="${y(value)}" x2="${width-pad.r}" y2="${y(value)}" stroke="#c8c5bd"/><text x="8" y="${y(value)+4}" font-size="10" fill="#666">${formatAxisMoney(value)}</text>`;
  }
  for (let i = 0; i <= 6; i += 1) {
    const date = new Date(from.getTime() + duration * i / 6), xx = x(date);
    html += `<line x1="${xx}" y1="${pad.t}" x2="${xx}" y2="${height-pad.b}" stroke="#e0ddd5"/><text x="${xx}" y="${height-12}" text-anchor="middle" font-size="9" fill="#666">${date.toLocaleDateString('en-US', { month: 'short', day: duration < 1000*60*60*24*100 ? 'numeric' : undefined }).toUpperCase()}</text>`;
  }
  const line = points.map(point => `${x(point.date)},${y(point.balance)}`).join(' ');
  html += `<line x1="${x(from)}" y1="${y(values[0])}" x2="${x(to)}" y2="${y(values.at(-1))}" stroke="#0a7d4f" stroke-width="2" stroke-dasharray="8 7"/><polyline points="${line}" fill="none" stroke="#151515" stroke-width="3"/>`;
  points.forEach((point, index) => {
    const eventSummary = point.events.map(item => `${item.type} ${item.name} ${money(item.amount)}`).join(', ');
    const label = `${point.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}: ${eventSummary}. Balance ${money(point.balance)}`;
    html += `<circle class="chart-point" data-index="${index}" cx="${x(point.date)}" cy="${y(point.balance)}" r="4" fill="#fff" stroke="#3759f0" stroke-width="2" tabindex="0" role="img" aria-label="${escapeHTML(label)}"/>`;
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
let selectedPoint = null;
function updatePointChange() {
  const newBalance = pointBalanceInput.valueAsNumber;
  const difference = Number.isFinite(newBalance) && selectedPoint ? newBalance - selectedPoint.balance : 0;
  const appliesToFuture = document.querySelector('input[name="pointScope"]:checked').value === 'future';
  document.getElementById('pointChange').textContent = Number.isFinite(newBalance) && selectedPoint
    ? `${difference >= 0 ? 'Add' : 'Subtract'} ${money(Math.abs(difference))} ${appliesToFuture ? 'from this date forward' : 'at this point only'}.`
    : '';
  return difference;
}
function openPointDialog(point) {
  selectedPoint = point;
  document.getElementById('pointDate').textContent = point.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  document.getElementById('pointCurrentBalance').textContent = money(point.balance);
  pointBalanceInput.value = point.balance.toFixed(2);
  document.querySelector('input[name="pointScope"][value="single"]').checked = true;
  updatePointChange();
  pointDialog.showModal();
  pointBalanceInput.select();
}
pointBalanceInput.addEventListener('input', updatePointChange);
document.querySelectorAll('input[name="pointScope"]').forEach(input => input.addEventListener('change', updatePointChange));
document.getElementById('savePoint').addEventListener('click', event => {
  if (!document.getElementById('pointForm').reportValidity()) { event.preventDefault(); return; }
  const difference = Math.round(updatePointChange() * 100) / 100;
  const appliesToFuture = document.querySelector('input[name="pointScope"]:checked').value === 'future';
  if (appliesToFuture && selectedPoint.events[0]?.type === 'Starting point') {
    startingBalanceInput.value = pointBalanceInput.valueAsNumber.toFixed(2);
  } else if (difference !== 0) {
    const adjustment = { name: 'Graph point adjustment', amount: difference, date: isoDate(selectedPoint.date), color: difference > 0 ? '#14a467' : '#f04444' };
    if (appliesToFuture) variables.push(adjustment);
    else pointAdjustments.push(adjustment);
  }
  savePage();
  renderCards(variables, 'variableList');
  drawChart();
  showToast(difference === 0 ? 'Point was already at that balance.' : 'Forecast point updated.');
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
document.getElementById('forecastFrom').addEventListener('change', drawChart);
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
document.getElementById('saveItem').addEventListener('click',e=>{const form=document.getElementById('itemForm');if(!form.reportValidity()){e.preventDefault();return;}const item={name:document.getElementById('itemName').value.trim(),amount:Number(document.getElementById('itemAmount').value),color:'#3759f0'};if(itemType==='recurring'){item.frequency=frequencySelect.value;item.interval=frequencySelect.value.startsWith('custom-')?Number(intervalInput.value):undefined;item.start=startInput.value;if(editingItemIndex!==null){item.color=recurring[editingItemIndex].color;recurring[editingItemIndex]=item;}else recurring.push(item);}else{item.date=startInput.value;if(editingItemIndex!==null){item.color=variables[editingItemIndex].color;variables[editingItemIndex]=item;}else variables.push(item);}savePage();renderCards(itemType==='recurring'?recurring:variables,itemType==='recurring'?'recurringList':'variableList');drawChart();showToast(editingItemIndex===null?'Item added to your forecast.':itemType==='recurring'?'Recurring item updated.':'One-time change updated.');});
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
function showToast(message){const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200)}

const auditDialog = document.getElementById('auditDialog');
const auditActual = document.getElementById('auditActual');
const auditResult = document.getElementById('auditResult');
let expectedAuditBalance = getStartingBalance();
function balanceOn(date) {
  if (date <= balanceAnchorDate) return getStartingBalance();
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
document.getElementById('clearPage').addEventListener('click', () => {
  if (!window.confirm('Clear this page and all of its locally saved data?')) return;
  localStorage.removeItem(pageKey(activePageCode));
  localStorage.removeItem(ACTIVE_PAGE_KEY);
  window.location.reload();
});
