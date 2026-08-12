const recurring = [
  { name: 'Pay', amount: 1250, frequency: 'biweekly', start: '2026-08-13', color: '#14a467' },
  { name: 'Rent', amount: -1150, frequency: 'monthly', start: '2026-08-28', color: '#3759f0' },
  { name: 'Insurance', amount: -2000, frequency: 'custom-months', interval: 6, start: '2026-08-15', color: '#eaa81d' },
  { name: 'Electric bill', amount: -200, frequency: 'monthly', start: '2026-09-10', color: '#f05f85' },
  { name: 'Weekly spending', amount: -150, frequency: 'weekly', start: '2026-08-11', color: '#8b55df' }
];
const variables = [
  { name: 'Overtime pay audit', amount: 819.74, date: '2026-07-01', color: '#14a467' },
  { name: 'Unexpected repair', amount: -408.38, date: '2026-07-16', color: '#f04444' }
];
const transactions = [
  ['Jun 30', 'Weekly spending', -150, 2033.82], ['Jul 1', 'Overtime pay audit', 819.74, 2853.56],
  ['Jul 2', 'Pay', 1250, 4103.56], ['Jul 7', 'Weekly spending', -150, 3953.56],
  ['Jul 10', 'Electric bill', -200, 3753.56], ['Jul 14', 'Weekly spending', -150, 3603.56]
];
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
  document.getElementById('transactionRows').innerHTML = transactions.map(row => `<tr><td>${row[0]}, 2026</td><td>${row[1]}</td><td class="${row[2] >= 0 ? 'positive' : 'negative'}">${money(row[2])}</td><td>${money(row[3])}</td></tr>`).join('');
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

    return `<div class="${classes.join(' ')}" aria-label="${date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })}">${date.getDate()}</div>`;
  }).join('');
}
const currentBalance = 2183.82;
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

function projectionPoints(from, to) {
  const changes = new Map();
  const addChange = (date, amount) => {
    const key = isoDate(date);
    changes.set(key, (changes.get(key) || 0) + amount);
  };
  recurring.forEach(item => recurringDates(item, addDays(from, 1), to).forEach(date => addChange(date, item.amount)));
  variables.forEach(item => {
    const date = parseDate(item.date);
    if (date > from && date <= to) addChange(date, item.amount);
  });
  let balance = currentBalance;
  return [{ date: from, balance }, ...[...changes].sort(([a], [b]) => a.localeCompare(b)).map(([date, change]) => {
    balance += change;
    return { date: parseDate(date), balance };
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
    const label = `${point.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}: ${money(point.balance)}`;
    html += `<circle class="chart-point" data-index="${index}" cx="${x(point.date)}" cy="${y(point.balance)}" r="4" fill="#fff" stroke="#3759f0" stroke-width="2" tabindex="0" role="img" aria-label="${label}"/>`;
  });
  html += '<g class="chart-tooltip" visibility="hidden"><rect width="154" height="42" rx="2"/><text x="8" y="16"></text><text x="8" y="32"></text></g>';
  svg.innerHTML = html;
  const tooltip = svg.querySelector('.chart-tooltip'), tooltipText = tooltip.querySelectorAll('text');
  const showTooltip = event => {
    const point = points[Number(event.currentTarget.dataset.index)], px = x(point.date), py = y(point.balance);
    const tx = Math.min(width - 160, Math.max(4, px - 77)), ty = py < 65 ? py + 10 : py - 50;
    tooltip.setAttribute('transform', `translate(${tx} ${ty})`);
    tooltipText[0].textContent = point.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    tooltipText[1].textContent = `Balance: ${money(point.balance)}`;
    tooltip.setAttribute('visibility', 'visible');
  };
  svg.querySelectorAll('.chart-point').forEach(point => {
    point.addEventListener('mouseenter', showTooltip); point.addEventListener('focus', showTooltip);
    point.addEventListener('mouseleave', () => tooltip.setAttribute('visibility', 'hidden')); point.addEventListener('blur', () => tooltip.setAttribute('visibility', 'hidden'));
  });
  document.getElementById('forecastLow').textContent = money(low);
  document.getElementById('forecastHigh').textContent = money(high);
}
renderCards(recurring,'recurringList'); renderCards(variables,'variableList'); renderTransactions(); renderCalendar(); drawChart();

document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');const from=parseDate(document.getElementById('forecastFrom').value);const month=from.getMonth()+Number(button.dataset.range);const lastDay=new Date(from.getFullYear(),month+1,0).getDate();const to=new Date(from.getFullYear(),month,Math.min(from.getDate(),lastDay));document.getElementById('forecastTo').value=isoDate(to);drawChart();}));
document.getElementById('forecastFrom').addEventListener('change', drawChart);
document.getElementById('forecastTo').addEventListener('change', drawChart);
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
document.getElementById('saveItem').addEventListener('click',e=>{const form=document.getElementById('itemForm');if(!form.reportValidity()){e.preventDefault();return;}const item={name:document.getElementById('itemName').value.trim(),amount:Number(document.getElementById('itemAmount').value),color:'#3759f0'};if(itemType==='recurring'){item.frequency=frequencySelect.value;item.interval=frequencySelect.value.startsWith('custom-')?Number(intervalInput.value):undefined;item.start=startInput.value;if(editingItemIndex!==null){item.color=recurring[editingItemIndex].color;recurring[editingItemIndex]=item;}else recurring.push(item);}else{item.date=startInput.value;if(editingItemIndex!==null){item.color=variables[editingItemIndex].color;variables[editingItemIndex]=item;}else variables.push(item);}renderCards(itemType==='recurring'?recurring:variables,itemType==='recurring'?'recurringList':'variableList');drawChart();showToast(editingItemIndex===null?'Item added to your forecast.':itemType==='recurring'?'Recurring item updated.':'One-time change updated.');});
document.getElementById('recurringList').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === 'edit') openDialog('recurring', index);
  if (button.dataset.action === 'delete' && window.confirm(`Delete ${recurring[index].name}?`)) {
    recurring.splice(index, 1);
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
    renderCards(variables, 'variableList');
    drawChart();
    showToast('One-time change deleted.');
  }
});
function showToast(message){const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200)}

const auditDialog = document.getElementById('auditDialog');
const auditActual = document.getElementById('auditActual');
const auditResult = document.getElementById('auditResult');
let expectedAuditBalance = currentBalance;
function balanceOn(date) {
  if (date <= balanceAnchorDate) return currentBalance;
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
