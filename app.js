const recurring = [
  { name: 'Pay', amount: 1250, meta: 'Biweekly • Next: Aug 13', color: '#14a467' },
  { name: 'Rent', amount: -1150, meta: 'Monthly • Next: Aug 28', color: '#3759f0' },
  { name: 'Insurance', amount: -2000, meta: 'Every 6 months • Next: Aug 15', color: '#eaa81d' },
  { name: 'Electric bill', amount: -200, meta: 'Monthly • Next: Sep 10', color: '#f05f85' },
  { name: 'Weekly spending', amount: -150, meta: 'Weekly • Next: Aug 11', color: '#8b55df' }
];
const variables = [
  { name: 'Overtime pay audit', amount: 819.74, meta: 'Jul 1, 2026', color: '#14a467' },
  { name: 'Unexpected repair', amount: -408.38, meta: 'Jul 16, 2026', color: '#f04444' }
];
const transactions = [
  ['Jun 30', 'Weekly spending', -150, 2033.82], ['Jul 1', 'Overtime pay audit', 819.74, 2853.56],
  ['Jul 2', 'Pay', 1250, 4103.56], ['Jul 7', 'Weekly spending', -150, 3953.56],
  ['Jul 10', 'Electric bill', -200, 3753.56], ['Jul 14', 'Weekly spending', -150, 3603.56]
];
const money = value => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function renderCards(items, target) {
  document.getElementById(target).innerHTML = items.map(item => `<article class="item-card" style="--card-color:${item.color}"><div class="item-top"><span>${item.name}</span><span class="${item.amount >= 0 ? 'positive' : 'negative'}">${money(item.amount)}</span></div><small>${item.meta}</small></article>`).join('');
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
function drawChart(months=12) {
  const svg=document.getElementById('balanceChart'), width=900, height=270, pad={l:55,r:24,t:22,b:35};
  const full=[2034,2854,4104,3954,3754,3604,4854,4704,3554,3404,3204,3054,4304,4154,4004,3854,3704,4954,4804,3654,3504,3354,4604,4454,4254,4104,3954,5204,5054,4904,4754,4554,5804,5654,4504,4354,4204,5454,5304,5104,4954,4804,6054,5904,5754,5604,5404,6654,6504,5354,5204,5054,6304,6154,6004,5854,5704,6954,6804,5654,5504,5354,6604,6454,6254,6104,5954,7204,7054,6904,6754,6554,7804,7654,6504,6354,6204,7454,7304,7154,7004,6854,8104,7954,7804,7654,7504,8395,8100,7650];
  const values=full.slice(0,Math.max(10,Math.round(full.length*months/12))), max=9000;
  const x=i=>pad.l+i*(width-pad.l-pad.r)/(values.length-1), y=v=>height-pad.b-v*(height-pad.t-pad.b)/max;
  let html='';
  [0,2000,4000,6000,8000].forEach(v=>{html+=`<line x1="${pad.l}" y1="${y(v)}" x2="${width-pad.r}" y2="${y(v)}" stroke="#c8c5bd" stroke-width="1"/><text x="8" y="${y(v)+4}" font-size="10" fill="#666">$${v/1000}k</text>`});
  for(let i=0;i<=12;i++){const xx=pad.l+i*(width-pad.l-pad.r)/12;html+=`<line x1="${xx}" y1="${pad.t}" x2="${xx}" y2="${height-pad.b}" stroke="#e0ddd5"/><text x="${xx}" y="${height-12}" text-anchor="middle" font-size="9" fill="#666">${['JUL','AUG','SEP','OCT','NOV','DEC','JAN','FEB','MAR','APR','MAY','JUN','JUL'][i]}</text>`}
  const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(' '); html+=`<line x1="${x(0)}" y1="${y(2850)}" x2="${x(values.length-1)}" y2="${y(7600)}" stroke="#0a7d4f" stroke-width="2" stroke-dasharray="8 7"/><polyline points="${points}" fill="none" stroke="#151515" stroke-width="3"/>`;
  values.forEach((v,i)=>{if(i%2===0)html+=`<rect x="${x(i)-3}" y="${y(v)-3}" width="6" height="6" fill="#fff" stroke="#3759f0" stroke-width="2"/>`}); svg.innerHTML=html;
}
renderCards(recurring,'recurringList'); renderCards(variables,'variableList'); renderTransactions(); renderCalendar(); drawChart();

document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');drawChart(Number(button.dataset.range));}));
const dialog=document.getElementById('itemDialog'); let itemType='recurring';
function openDialog(type){itemType=type;document.getElementById('dialogTitle').textContent=type==='recurring'?'Add recurring item':'Add one-time change';document.getElementById('itemForm').reset();dialog.showModal();}
document.getElementById('addRecurring').addEventListener('click',()=>openDialog('recurring')); document.getElementById('addVariable').addEventListener('click',()=>openDialog('variable'));
document.getElementById('saveItem').addEventListener('click',e=>{const form=document.getElementById('itemForm');if(!form.reportValidity()){e.preventDefault();return;}const item={name:document.getElementById('itemName').value,amount:Number(document.getElementById('itemAmount').value),meta:itemType==='recurring'?'Monthly • Upcoming':'Aug 10, 2026',color:'#3759f0'};(itemType==='recurring'?recurring:variables).push(item);renderCards(itemType==='recurring'?recurring:variables,itemType==='recurring'?'recurringList':'variableList');showToast('Item added to your forecast.');});
function showToast(message){const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200)}
document.getElementById('auditButton').addEventListener('click',()=>showToast('Audit started — review your recent transactions.'));
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
