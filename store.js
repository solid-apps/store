// store — browse, install, and uninstall Solid apps on your pod.
//
// Aggregates apps from every curated bundle in solid-apps/bundles,
// checks which are installed locally (LDP container probe against
// /public/apps/), and gives one-click "copy the install command"
// for the rest. Pairs with home (the launcher) — install here,
// see it in the dock there.

const app = document.getElementById('app')

const BUNDLE_NAMES = [
  'default', 'starter', 'jspod', 'all',
  'media', 'productivity', 'agentic', 'teams'
]
const BUNDLE_BASE = 'https://raw.githubusercontent.com/solid-apps/bundles/HEAD'

// Known apps: stable colors + emoji glyphs so the catalog looks alive.
// Unknown apps get hash-derived colors + first-letter fallback.
const KNOWN = {
  home:       { glyph: '\u{1F3E0}',  color: '#7c4dff' },
  plaza:      { glyph: '\u{1F4AC}',  color: '#7c4dff' },
  chat:       { glyph: '✉️',         color: '#06b6d4' },
  vellum:     { glyph: '✍️',         color: '#f59e0b' },
  plume:      { glyph: '\u{1FAB6}',  color: '#a855f7' },
  taskify:    { glyph: '✅',          color: '#22c55e' },
  explorer:   { glyph: '\u{1F4C1}',  color: '#3b82f6' },
  hub:        { glyph: '\u{1F39B}',  color: '#ec4899' },
  chrome:     { glyph: '\u{1FA9F}',  color: '#10b981' },
  timeline:   { glyph: '\u{1F4F0}',  color: '#f97316' },
  win98:      { glyph: '\u{1F4BB}',  color: '#06b6d4' },
  pdf:        { glyph: '\u{1F4C4}',  color: '#ef4444' },
  alarm:      { glyph: '⏰',          color: '#fbbf24' },
  playlist:   { glyph: '\u{1F3B5}',  color: '#a855f7' },
  mindstr:    { glyph: '\u{1F9E0}',  color: '#a855f7' },
  charlie:    { glyph: '\u{1F916}',  color: '#22c55e' },
  forum:      { glyph: '\u{1F4AD}',  color: '#ec4899' },
  transcribe: { glyph: '\u{1F3A4}',  color: '#06b6d4' },
  git:        { glyph: '\u{1F500}',  color: '#1f8fff' },
  store:      { glyph: '\u{1F6CD}',  color: '#5a2be0' }
}
const FALLBACK = ['#7c4dff','#06b6d4','#f59e0b','#22c55e','#3b82f6','#ec4899','#10b981','#f97316','#a855f7','#ef4444']
function hashColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return FALLBACK[h % FALLBACK.length]
}
function describe(name, spec) {
  const known = KNOWN[name.toLowerCase()]
  return {
    glyph: known?.glyph || (name[0] || '?').toUpperCase(),
    color: known?.color || hashColor(name)
  }
}

// Parse an app:spec the way jspod install does. Returns the pod-path
// name (what shows up under /public/apps/<name>/) + the original spec.
function parseSpec(input) {
  let base = input
  let renameName = null
  const eq = base.lastIndexOf('=')
  if (eq > 0) { renameName = base.slice(eq + 1); base = base.slice(0, eq) }
  const h = base.lastIndexOf('#')
  if (h > 0) base = base.slice(0, h)
  let name
  if (/^https?:\/\//.test(base)) {
    name = base.replace(/\/$/, '').split('/').pop()
  } else if (base.includes('/')) {
    const [, ...rest] = base.split('/')
    name = rest.join('/').split('/').pop()
  } else {
    name = base
  }
  if (renameName) name = renameName
  return { name, spec: input }
}

// --- one-click install (write the app's files onto the pod) -----------------
const MIME = {
  html: 'text/html', js: 'application/javascript', mjs: 'application/javascript', css: 'text/css',
  json: 'application/json', jsonld: 'application/ld+json', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  txt: 'text/plain', md: 'text/markdown', woff2: 'font/woff2', woff: 'font/woff',
  m3u: 'audio/x-mpegurl', map: 'application/json'
}
const mimeOf = (p) => MIME[p.split('.').pop().toLowerCase()] || 'application/octet-stream'
const authFetch = (url, opts) => ((window.xlogin && window.xlogin.authFetch) || fetch)(url, opts)
const loggedIn = () => !!(window.xlogin && window.xlogin.id)
const servable = (p) => !p.split('/').some((s) => s.startsWith('.'))  // skip dot-resources (JSS 403s PUT)

// Resolve an app spec to its source repo. `name` → solid-apps/<name>@gh-pages;
// `org/repo` and trailing `#branch` honored; bare GitHub URLs parsed.
function resolveSource(spec) {
  let s = spec
  const eq = s.lastIndexOf('='); if (eq > 0) s = s.slice(0, eq)
  let branch = 'gh-pages'
  const h = s.lastIndexOf('#'); if (h > 0) { branch = s.slice(h + 1) || branch; s = s.slice(0, h) }
  if (/^https?:\/\//.test(s)) {
    const m = s.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
    return m ? { org: m[1], repo: m[2], branch } : null
  }
  if (s.includes('/')) { const [org, ...rest] = s.split('/'); return { org, repo: rest.join('/'), branch } }
  return { org: 'solid-apps', repo: s, branch }
}

async function listSourceFiles({ org, repo, branch }) {
  const r = await fetch(`https://api.github.com/repos/${org}/${repo}/git/trees/${branch}?recursive=1`)
  if (!r.ok) throw new Error(`source listing failed (${r.status})`)
  return ((await r.json()).tree || []).filter((t) => t.type === 'blob').map((t) => t.path).filter(servable)
}

// Install `a` onto the pod at /public/apps/<a.name>/. raw.githubusercontent
// is the source (always current); files are PUT with authFetch. Returns count.
async function installToPod(a) {
  const src = resolveSource(a.spec)
  if (!src) throw new Error("can't auto-install this source")
  const files = await listSourceFiles(src)
  let ok = 0
  for (const f of files) {
    const res = await fetch(`https://raw.githubusercontent.com/${src.org}/${src.repo}/${src.branch}/${f}`)
    if (!res.ok) continue
    const put = await authFetch(new URL(`../${a.name}/${f}`, location.href), {
      method: 'PUT', headers: { 'Content-Type': mimeOf(f) }, body: await res.arrayBuffer()
    })
    if (put.ok) ok++
  }
  if (!ok) throw new Error('nothing installed')
  return ok
}

async function fetchBundle(bundleName) {
  try {
    const r = await fetch(`${BUNDLE_BASE}/${bundleName}.jsonld`)
    if (!r.ok) return null
    const doc = await r.json()
    const items = doc['schema:itemListElement'] || doc['itemListElement'] || []
    const apps = items.map(item => {
      if (typeof item === 'string') {
        const { name, spec } = parseSpec(item)
        return { name, spec, label: name, description: '' }
      }
      const spec = item['app:spec']
      if (!spec) return null
      const { name } = parseSpec(spec)
      return {
        name,
        spec,
        label: item['app:label'] || name,
        description: item['app:description'] || ''
      }
    }).filter(Boolean)
    return {
      bundleName,
      displayName: doc['schema:name'] || bundleName,
      description: doc['schema:description'] || '',
      apps
    }
  } catch {
    return null
  }
}

async function fetchAllBundles() {
  return (await Promise.all(BUNDLE_NAMES.map(fetchBundle))).filter(Boolean)
}

async function fetchInstalled() {
  try {
    const r = await fetch('/public/apps/', { headers: { Accept: 'application/ld+json' } })
    if (!r.ok) return new Set()
    const doc = await r.json()
    const contains = doc['ldp:contains'] || doc['http://www.w3.org/ns/ldp#contains'] || doc['contains'] || []
    const arr = Array.isArray(contains) ? contains : [contains]
    return new Set(arr
      .map(x => typeof x === 'string' ? x : x?.['@id'])
      .filter(Boolean)
      .filter(u => u.endsWith('/'))
      .map(url => {
        const segs = url.replace(/\/$/, '').split('/')
        return segs[segs.length - 1]
      }))
  } catch {
    return new Set()
  }
}

// Merge all bundles into a flat, deduped catalogue. Each app records
// which bundles it appears in so we can show that as metadata.
function mergeCatalogue(bundles) {
  const byName = new Map()
  for (const b of bundles) {
    for (const a of b.apps) {
      if (!byName.has(a.name)) {
        byName.set(a.name, { ...a, bundles: new Set() })
      }
      byName.get(a.name).bundles.add(b.bundleName)
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true }
  catch { return false }
}

async function render() {
  const [bundles, installed] = await Promise.all([fetchAllBundles(), fetchInstalled()])
  const catalogue = mergeCatalogue(bundles)

  const style = document.createElement('style')
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
    .s { min-height: 100vh; min-height: 100dvh;
      background:
        radial-gradient(circle at 25% 8%, rgba(99,102,241,0.20) 0%, transparent 38%),
        radial-gradient(circle at 85% 88%, rgba(168,85,247,0.16) 0%, transparent 38%),
        linear-gradient(160deg, #0a0618 0%, #1a1145 30%, #2d1b69 50%, #1a1145 70%, #0a0618 100%);
      color: rgba(255,255,255,0.92);
      padding: 32px 24px 80px;
    }
    .s-wrap { max-width: 1080px; margin: 0 auto; }

    /* header */
    .s-head {
      display: flex; align-items: baseline; gap: 14px;
      margin-bottom: 6px; flex-wrap: wrap;
    }
    .s-title {
      font-size: 32px; font-weight: 800; letter-spacing: -0.022em; color: #fff;
      font-family: "Source Serif Pro", Georgia, serif;
    }
    .s-sub { color: rgba(255,255,255,0.5); font-size: 14px; }

    /* filters + search */
    .s-bar {
      display: flex; align-items: center; gap: 10px;
      margin: 20px 0 28px; flex-wrap: wrap;
    }
    .s-tab {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.65);
      font-size: 13px; font-weight: 500;
      padding: 7px 14px; border-radius: 999px;
      cursor: pointer; transition: all 0.15s ease;
      letter-spacing: 0.005em;
    }
    .s-tab:hover { background: rgba(255,255,255,0.10); color: rgba(255,255,255,0.85); }
    .s-tab.active {
      background: rgba(124,77,255,0.25);
      border-color: rgba(124,77,255,0.4);
      color: #fff;
    }
    .s-tab .count {
      display: inline-block;
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.65);
      padding: 1px 7px; border-radius: 999px;
      font-size: 11px; font-weight: 700;
      margin-left: 6px;
      font-variant-numeric: tabular-nums;
    }
    .s-tab.active .count { background: rgba(255,255,255,0.18); color: #fff; }
    .s-search {
      flex: 1; min-width: 200px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 9px 14px; color: #fff; font-size: 14px;
      outline: none; font-family: inherit;
    }
    .s-search::placeholder { color: rgba(255,255,255,0.3); }
    .s-search:focus { border-color: rgba(124,77,255,0.4); background: rgba(255,255,255,0.10); }

    /* card grid */
    .s-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .s-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px; padding: 18px 18px 16px;
      display: flex; flex-direction: column; gap: 12px;
      transition: all 0.18s ease;
    }
    .s-card:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.12);
    }
    .s-card.hidden { display: none; }
    .s-card-head {
      display: flex; align-items: center; gap: 12px;
    }
    .s-icon {
      width: 44px; height: 44px; border-radius: 11px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 700; color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2);
      flex-shrink: 0;
    }
    .s-name {
      font-size: 15px; font-weight: 700; color: #fff;
      line-height: 1.2; letter-spacing: -0.01em;
    }
    .s-spec {
      font-size: 11px; color: rgba(255,255,255,0.4);
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      margin-top: 2px;
      word-break: break-all;
    }
    .s-desc {
      font-size: 13px; color: rgba(255,255,255,0.65);
      line-height: 1.5; flex: 1;
    }
    .s-foot {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin-top: 4px;
    }
    .s-pills { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; }
    .s-pill {
      font-size: 10.5px; font-weight: 600;
      padding: 2px 7px; border-radius: 999px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.5);
      letter-spacing: 0.02em;
    }
    .s-pill.installed {
      background: rgba(34,197,94,0.16);
      color: #4ade80;
    }
    .s-btn {
      background: var(--accent, #7c4dff);
      color: #fff;
      border: 0; border-radius: 8px;
      padding: 7px 14px;
      font-size: 12.5px; font-weight: 600;
      cursor: pointer; transition: background 0.15s ease;
      font-family: inherit;
      letter-spacing: 0.005em;
    }
    .s-btn:hover { background: #5a2be0; }
    .s-btn.secondary {
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.85);
    }
    .s-btn.secondary:hover { background: rgba(255,255,255,0.14); color: #fff; }

    .s-empty {
      text-align: center; padding: 60px 24px;
      color: rgba(255,255,255,0.45);
    }
    .s-empty strong { display: block; color: #fff; font-size: 16px; margin-bottom: 8px; }

    /* toast */
    .s-toast {
      position: fixed; left: 50%; bottom: 32px;
      transform: translateX(-50%) translateY(20px);
      background: rgba(10,6,24,0.96);
      border: 1px solid rgba(255,255,255,0.12);
      color: #fff; padding: 12px 18px; border-radius: 12px;
      font-size: 14px; line-height: 1.4;
      opacity: 0; pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
      max-width: 480px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.4);
    }
    .s-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .s-toast code {
      display: block;
      margin-top: 6px;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 13px;
      color: #c4b5fd;
      background: rgba(255,255,255,0.05);
      padding: 6px 10px; border-radius: 6px;
      word-break: break-all;
    }

    @media (max-width: 720px) {
      .s { padding: 24px 16px 80px; }
      .s-title { font-size: 26px; }
      .s-grid { grid-template-columns: 1fr; }
      .s-bar { gap: 8px; }
      .s-search { width: 100%; }
    }
  `
  app.appendChild(style)

  const root = document.createElement('div')
  root.className = 's'
  const wrap = document.createElement('div')
  wrap.className = 's-wrap'

  // Header
  const head = document.createElement('div')
  head.className = 's-head'
  const installedCount = catalogue.filter(a => installed.has(a.name)).length
  head.innerHTML = `
    <h1 class="s-title">App store</h1>
    <span class="s-sub">${catalogue.length} apps · ${installedCount} installed</span>
  `
  wrap.appendChild(head)

  // Filter bar
  const bar = document.createElement('div')
  bar.className = 's-bar'
  bar.innerHTML = `
    <button class="s-tab active" data-filter="all">All <span class="count">${catalogue.length}</span></button>
    <button class="s-tab" data-filter="installed">Installed <span class="count">${installedCount}</span></button>
    <button class="s-tab" data-filter="available">Available <span class="count">${catalogue.length - installedCount}</span></button>
    <input class="s-search" type="search" placeholder="Search apps…">
  `
  wrap.appendChild(bar)

  // Grid
  const grid = document.createElement('div')
  grid.className = 's-grid'

  for (const a of catalogue) {
    const isInstalled = installed.has(a.name)
    const { glyph, color } = describe(a.name, a.spec)
    const card = document.createElement('div')
    card.className = 's-card'
    card.dataset.installed = isInstalled ? '1' : '0'
    card.dataset.name = a.name.toLowerCase()
    card.dataset.label = a.label.toLowerCase()
    card.dataset.desc = (a.description || '').toLowerCase()
    card.style.setProperty('--accent', color)

    card.innerHTML = `
      <div class="s-card-head">
        <div class="s-icon" style="background: linear-gradient(145deg, ${color}cc, ${color})">${glyph}</div>
        <div style="min-width:0">
          <div class="s-name">${escapeHtml(a.label)}</div>
          <div class="s-spec">${escapeHtml(a.spec)}</div>
        </div>
      </div>
      <div class="s-desc">${escapeHtml(a.description || ' ')}</div>
      <div class="s-foot">
        <div class="s-pills">
          ${isInstalled ? '<span class="s-pill installed">✓ Installed</span>' : ''}
          ${[...a.bundles].slice(0, 3).map(b => `<span class="s-pill">${b}</span>`).join('')}
        </div>
      </div>
    `
    const foot = card.querySelector('.s-foot')
    if (isInstalled) {
      const open = document.createElement('a')
      open.className = 's-btn secondary'
      open.href = `/public/apps/${a.name}/`
      open.textContent = 'Open'
      foot.appendChild(open)
    } else {
      const install = document.createElement('button')
      install.className = 's-btn'
      install.textContent = 'Install'
      install.addEventListener('click', () => onInstall(a, card, install))
      foot.appendChild(install)
    }
    grid.appendChild(card)
  }
  wrap.appendChild(grid)

  root.appendChild(wrap)
  app.appendChild(root)

  // Toast container
  const toast = document.createElement('div')
  toast.className = 's-toast'
  toast.innerHTML = '<div class="s-toast-msg">Copied!</div><code class="s-toast-cmd"></code>'
  document.body.appendChild(toast)
  let toastTimer = null
  function showToast(msg, cmd) {
    toast.querySelector('.s-toast-msg').textContent = msg
    const codeEl = toast.querySelector('.s-toast-cmd')
    if (cmd) { codeEl.textContent = cmd; codeEl.style.display = 'block' }
    else { codeEl.style.display = 'none' }
    toast.classList.add('show')
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4500)
  }

  async function onInstall(a, card, btn) {
    // Signed out → fall back to the copy-the-command path (e.g. a terminal pod).
    if (!loggedIn()) {
      const cmd = `jspod install ${a.spec}`
      const ok = await copy(cmd)
      showToast(ok ? 'Sign in to install here — or paste in your terminal:' : 'Run this in your terminal:', cmd)
      return
    }
    btn.disabled = true
    const label = btn.textContent
    btn.textContent = 'Installing…'
    try {
      const n = await installToPod(a)
      installed.add(a.name)
      card.dataset.installed = '1'
      const pills = card.querySelector('.s-pills')
      if (pills && !pills.querySelector('.installed')) {
        pills.insertAdjacentHTML('afterbegin', '<span class="s-pill installed">✓ Installed</span>')
      }
      const open = document.createElement('a')
      open.className = 's-btn secondary'
      open.href = `/public/apps/${a.name}/`
      open.textContent = 'Open'
      btn.replaceWith(open)
      showToast(`Installed ${a.label} (${n} files) — open it from home.`)
    } catch (e) {
      btn.disabled = false
      btn.textContent = label
      showToast('Install failed: ' + (e.message || e))
    }
  }

  // Filter logic
  let currentFilter = 'all'
  let currentSearch = ''
  const applyFilters = () => {
    for (const card of grid.querySelectorAll('.s-card')) {
      const installedMatch =
        currentFilter === 'all' ||
        (currentFilter === 'installed' && card.dataset.installed === '1') ||
        (currentFilter === 'available' && card.dataset.installed === '0')
      const q = currentSearch
      const searchMatch = !q ||
        card.dataset.name.includes(q) ||
        card.dataset.label.includes(q) ||
        card.dataset.desc.includes(q)
      card.classList.toggle('hidden', !(installedMatch && searchMatch))
    }
  }
  bar.querySelectorAll('.s-tab').forEach(t => t.addEventListener('click', () => {
    bar.querySelectorAll('.s-tab').forEach(x => x.classList.remove('active'))
    t.classList.add('active')
    currentFilter = t.dataset.filter
    applyFilters()
  }))
  bar.querySelector('.s-search').addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase().trim()
    applyFilters()
  })
}

function escapeHtml(s) {
  if (typeof s !== 'string') s = String(s ?? '')
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

render()
