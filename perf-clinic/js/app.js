const { pageSize, tickerIntervalMs, tickerVisibleRows, storageKey } = window.APP_CONFIG;

const grid = document.getElementById('agents');
const searchInput = document.getElementById('search');
const resultsList = document.getElementById('results');
const resultsCount = document.getElementById('results-count');
const topbar = document.querySelector('.topbar');
const backToTop = document.getElementById('back-to-top');
const progress = document.getElementById('read-progress');
const tickerToggle = document.getElementById('ticker-toggle');
const preview = document.getElementById('row-preview');
const scrollContext = document.getElementById('scroll-context');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });
}

function updateAgentCounts() {
  const counts = {};
  for (const event of window.ACTIVITY) counts[event.agent] = (counts[event.agent] || 0) + 1;
  grid.querySelectorAll('.agent-count').forEach((el) => {
    el.textContent = (counts[el.dataset.agent] || 0).toLocaleString() + ' calls today';
  });
}

function renderAgents() {
  grid.innerHTML = window.AGENTS.map((agent, index) => {
    const image = 'assets/agents/agent-' + String((index % 6) + 1).padStart(2, '0') + '.png';
    return (
      '<article class="agent-card">' +
      '<img class="agent-avatar" src="' + image + '" width="48" height="48" loading="lazy" decoding="async" alt="">' +
      '<h3>' + escapeHtml(agent.name) + '</h3>' +
      '<p class="agent-owner">' + escapeHtml(agent.owner) + '</p>' +
      '<p class="agent-description">' + escapeHtml(agent.description) + '</p>' +
      '<p class="agent-count" data-agent="' + escapeHtml(agent.name) + '">Counting calls…</p>' +
      '</article>'
    );
  }).join('');
}

const viewed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));

function rememberViewed(items) {
  const before = viewed.size;
  for (const item of items) viewed.add(item.id);
  if (viewed.size !== before) localStorage.setItem(storageKey, JSON.stringify([...viewed]));
}

let byNewest = [];
let eventsById = new Map();
const callsPerMinute = new Map();
let lastQuery = null;
let lastMatches = [];

function buildIndexes() {
  byNewest = window.ACTIVITY.slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  eventsById = new Map(window.ACTIVITY.map((event) => [event.id, event]));
  for (const event of window.ACTIVITY) {
    const minute = event.timestamp.slice(11, 16);
    callsPerMinute.set(minute, (callsPerMinute.get(minute) || 0) + 1);
  }
  lastMatches = byNewest;
}

function matches(event, needle) {
  return (
    event.summary.toLowerCase().includes(needle) ||
    event.timestamp.includes(needle) ||
    event.id.includes(needle) ||
    event.status.includes(needle) ||
    String(event.latencyMs).includes(needle)
  );
}

function search(query) {
  const needle = query.trim().toLowerCase();
  if (needle === lastQuery) return lastMatches;
  lastQuery = needle;
  lastMatches = needle ? byNewest.filter((event) => matches(event, needle)) : byNewest;
  return lastMatches;
}

function renderResults(query) {
  const matches = search(query);
  const page = matches.slice(0, pageSize);
  resultsCount.textContent = matches.length.toLocaleString() + ' matching tool calls';
  focusedRow = null;
  resultsList.innerHTML = page.map((event) => {
    const isNew = !viewed.has(event.id);
    return (
      '<li class="result-row status-' + event.status + '" data-id="' + event.id + '" data-minute="' + event.timestamp.slice(11, 16) + '">' +
      '<span class="result-time">' + formatTime(event.timestamp) + '</span>' +
      '<span class="result-agent">' + escapeHtml(event.agent) + '</span>' +
      '<span class="result-tool">' + escapeHtml(event.tool) + '</span>' +
      '<span class="result-status">' + event.status + '</span>' +
      '<span class="result-latency">' + event.latencyMs + ' ms</span>' +
      '<span class="result-summary">' + escapeHtml(event.summary) + '</span>' +
      (isNew ? '<span class="badge-new">New</span>' : '') +
      '</li>'
    );
  }).join('');
  rememberViewed(page);
}

let scrollQueued = false;
let focusedRow = null;

function onScroll() {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(updateOnScroll);
}

function updateOnScroll() {
  scrollQueued = false;
  const scrolled = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.transform = 'scaleX(' + (max > 0 ? scrolled / max : 0) + ')';
  topbar.classList.toggle('topbar-raised', scrolled > 8);
  topbar.classList.toggle('topbar-compact', scrolled > 100);
  backToTop.classList.toggle('visible', scrolled > window.innerHeight);

  const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.45);
  const row = hit && hit.closest ? hit.closest('.result-row') : null;
  if (row !== focusedRow) {
    if (focusedRow) focusedRow.classList.remove('in-focus');
    if (row) row.classList.add('in-focus');
    focusedRow = row;
    scrollContext.textContent = row
      ? row.dataset.minute + ' UTC · ' + (callsPerMinute.get(row.dataset.minute) || 0) + ' calls that minute'
      : '';
  }
}

function hidePreview() {
  previewRow = null;
  preview.hidden = true;
}

let previewRow = null;
let previewPoint = null;
let previewQueued = false;

function showPreview(event) {
  previewPoint = { x: event.clientX, y: event.clientY, target: event.target };
  if (previewQueued) return;
  previewQueued = true;
  requestAnimationFrame(() => {
    previewQueued = false;
    const row = previewPoint.target.closest('.result-row');
    if (!row) return hidePreview();
    if (row !== previewRow) {
      const item = eventsById.get(row.dataset.id);
      if (!item) return hidePreview();
      preview.textContent = item.summary;
      previewRow = row;
    }
    preview.style.transform = 'translate(' + (previewPoint.x + 12) + 'px, ' + (previewPoint.y + 12) + 'px)';
    preview.hidden = false;
  });
}

let tickerPanel = null;
let tickerTimer = 0;

function tickerRow(event) {
  const row = document.createElement('li');
  row.className = 'ticker-row status-' + event.status;
  row.innerHTML =
    '<span class="ticker-time">' + formatTime(event.timestamp) + '</span>' +
    '<span class="ticker-agent">' + escapeHtml(event.agent) + '</span>' +
    '<span class="ticker-tool">' + escapeHtml(event.tool) + '</span>';
  return row;
}

function positionTicker() {
  if (!tickerPanel) return;
  tickerPanel.style.maxHeight = window.innerHeight - 120 + 'px';
}

function onTickerKey(event) {
  if (event.key === 'Escape') closeTicker();
}

function openTicker() {
  if (tickerPanel) return;
  const panel = document.createElement('aside');
  panel.className = 'ticker';
  panel.innerHTML = '<header class="ticker-header">Live tool calls</header><ul class="ticker-list"></ul>';
  document.body.appendChild(panel);
  tickerPanel = panel;
  const list = panel.querySelector('.ticker-list');

  tickerTimer = setInterval(() => {
    if (!window.ACTIVITY.length) return;
    const event = window.ACTIVITY[Math.floor(Math.random() * window.ACTIVITY.length)];
    list.prepend(tickerRow(event));
    while (list.children.length > tickerVisibleRows) {
      list.lastElementChild.remove();
    }
  }, tickerIntervalMs);

  window.addEventListener('resize', positionTicker);
  window.addEventListener('keydown', onTickerKey);
  positionTicker();
  tickerToggle.setAttribute('aria-pressed', 'true');
  tickerToggle.textContent = 'Hide live calls';
}

function closeTicker() {
  if (!tickerPanel) return;
  clearInterval(tickerTimer);
  window.removeEventListener('resize', positionTicker);
  window.removeEventListener('keydown', onTickerKey);
  tickerPanel.remove();
  tickerPanel = null;
  tickerToggle.setAttribute('aria-pressed', 'false');
  tickerToggle.textContent = 'Show live calls';
}

let searchTimer = 0;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => renderResults(searchInput.value), 150);
});
window.addEventListener('scroll', onScroll, { passive: true });
resultsList.addEventListener('mousemove', showPreview);
resultsList.addEventListener('mouseleave', hidePreview);
resultsList.addEventListener('wheel', hidePreview);
resultsList.addEventListener('touchstart', hidePreview);
backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
tickerToggle.addEventListener('click', () => (tickerPanel ? closeTicker() : openTicker()));

renderAgents();
searchInput.disabled = true;
resultsCount.textContent = 'Loading tool calls…';

window.ACTIVITY_READY.then(() => {
  buildIndexes();
  updateAgentCounts();
  renderResults('');
  searchInput.disabled = false;
});
