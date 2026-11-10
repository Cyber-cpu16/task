/* Meridian — application shell: sidebar, top bar, command palette, notifications, shortcuts, boot */
(function () {
  const M = window.M;
  const { html, render, Component, useState, useEffect, useRef, Icon, Menu } = M;
  const { today, addDays } = M;

  /* ---------- command palette: global search + quick add ---------- */
  const TYPES = [['all', 'All'], ['task', 'Tasks'], ['homework', 'Homework'], ['event', 'Events'], ['project', 'Projects'], ['note', 'Notes'], ['reminder', 'Reminders']];
  function search(q, type, sort) {
    const s = M.state, ql = q.toLowerCase(), out = []; const hit = (...f) => f.some((x) => x && String(x).toLowerCase().includes(ql)); const T = today();
    const score = (title) => { const t = (title || '').toLowerCase(); return t === ql ? 0 : t.startsWith(ql) ? 1 : t.includes(ql) ? 2 : 3; };
    if (type === 'all' || type === 'task' || type === 'homework') s.items.forEach((i) => { if ((type === 'all' || i.kind === type) && hit(i.title, i.desc, i.notes, ...M.leaves(i.subtasks).map((x) => x.title))) out.push({ type: i.kind, icon: i.kind === 'homework' ? 'book' : 'checkCircle', title: i.title, sub: [i.archived ? 'Archived' : i.status === 'done' ? 'Completed' : i.due ? 'Due ' + M.dueLabel(i) : 'No due date', (i.kind === 'homework' ? M.cls(i.classId) : M.cat(i.categoryId) || {}).name].filter(Boolean).join(' · '), date: i.due || '9999', sc: score(i.title) + (i.status === 'done' ? 0.5 : 0), fn: () => M.open('item', { id: i.id }) }); });
    if (type === 'all' || type === 'event') s.events.forEach((e) => { if (!hit(e.title, e.desc, e.location)) return; let d = e.date; if (M.isRec(e) && d < T) { for (let i = 0; i < 60; i++) { const x = addDays(T, i); if (M.occursOn(e, x)) { d = x; break; } } } out.push({ type: 'event', icon: 'calendar', title: e.title + (e.source !== 'local' ? ' ↗' : ''), sub: `${M.fmtDate(d)}${e.allDay ? '' : ' · ' + M.fmtTime(e.start)}${M.isRec(e) ? ' · repeats' : ''}`, date: d, sc: score(e.title), fn: () => M.open('event', { id: e.id, date: d }) }); });
    if (type === 'all' || type === 'project') s.projects.forEach((p) => { if (hit(p.title, p.desc, p.notes)) out.push({ type: 'project', icon: 'layers', title: p.title, sub: `Project · ${M.projectProgress(p).pct}% complete`, date: p.target || '9999', sc: score(p.title), fn: () => M.go('projects', p.id) }); });
    if (type === 'all' || type === 'note') s.notes.forEach((n) => { if (hit(n.title, n.body, ...(n.tags || []))) out.push({ type: 'note', icon: 'file', title: n.title || 'Untitled note', sub: 'Note · ' + (n.body.split('\n')[0] || '').slice(0, 60), date: M.ds(new Date(n.updatedAt)), sc: score(n.title), fn: () => { M.setVs('noteId', n.id); M.go('notes'); } }); });
    if (type === 'all' || type === 'reminder') s.reminders.forEach((r) => { if (hit(r.title)) out.push({ type: 'reminder', icon: 'bell', title: r.title, sub: 'Reminder · ' + M.fmtStamp(r.at) + (r.done ? ' · done' : ''), date: r.at.slice(0, 10), sc: score(r.title), fn: () => M.open('reminder', { id: r.id }) }); });
    if (type === 'all' || type === 'homework') s.classes.forEach((c) => { if (hit(c.name, c.teacher)) out.push({ type: 'class', icon: 'book', title: c.icon + ' ' + c.name, sub: 'Class', date: '9999', sc: score(c.name), fn: () => M.go('homework', 'class', c.id) }); });
    out.sort(sort === 'date' ? (a, b) => a.date.localeCompare(b.date) : (a, b) => a.sc - b.sc || a.date.localeCompare(b.date));
    return out.slice(0, 40);
  }
  const COMMANDS = () => [
    ['New task', 'checkCircle', () => M.open('item', {})], ['New homework assignment', 'book', () => M.open('item', { preset: { kind: 'homework' } })], ['New event', 'calendar', () => M.open('event')],
    ['New reminder', 'bell', () => M.open('reminder')], ['New project', 'layers', () => M.open('project')], ['New goal', 'target', () => M.open('goal')], ['New habit', 'flame', () => M.open('habit')], ['New class', 'book', () => M.open('class')],
    ['Quick capture a note', 'file', () => M.open('capture')], ['Start a focus session', 'timer', () => { if (!M.state.focus.active) M.focusStart({}); M.setUI({ focusOverlay: true }); }],
    ['Daily review', 'chart', () => { M.setVs('anTab', 'daily'); M.go('analytics'); }], ['Weekly review', 'chart', () => { M.setVs('anTab', 'weekly'); M.go('analytics'); }],
    ['Export a backup', 'download', () => { M.setVs('setTab', 'data'); M.go('settings'); }], ['Toggle dark mode', 'moon', () => M.act((s) => (s.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'))],
    ...M.NAV.map((n) => ['Go to ' + n.label, n.icon, () => M.go(n.id)]),
  ].map(([title, icon, fn]) => ({ title, icon, fn, cmd: true }));

  function Palette() {
    const [q, setQ] = useState(M.ui.palette || ''), [sel, setSel] = useState(0), [type, setType] = useState('all'), [sort, setSort] = useState('relevance'); const listRef = useRef();
    const close = () => M.setUI({ palette: null }); const t = q.trim(); let rows = [];
    if (!t) rows = COMMANDS().slice(0, 12);
    else {
      const p = M.parseQuick(t); const res = search(t, type, sort), cmds = COMMANDS().filter((c) => c.title.toLowerCase().includes(t.toLowerCase())).slice(0, 4);
      const meta = [p.due && M.relDate(p.due), p.time && M.fmtTime(p.time) + (p.end ? '–' + M.fmtTime(p.end) : ''), p.priority && M.PRI[p.priority].label + ' priority', p.classId && M.cls(p.classId).name, p.categoryId && M.cat(p.categoryId).name].filter(Boolean).join(' · ');
      const mk = (kind, label, icon) => ({ add: true, icon, title: `${label}: “${p.title || t}”`, sub: meta || 'Press Enter to create', fn: () => { const forced = kind === p.kind ? t : ({ homework: 'hw ', event: 'event ', reminder: 'remind me to ', note: 'note ', task: '' }[kind]) + t.replace(/^\s*(remind me to|remind me|reminder:?|event:?|note:?|hw:?|homework:?)\s/i, ''); const r = M.quickCreate(forced); if (kind === 'task' || kind === 'homework') M.toast(`${kind === 'homework' ? 'Assignment' : 'Task'} added${r && r.due ? ' · due ' + M.dueLabel(r) : ''}.`, r ? { label: 'Open', action: () => M.open('item', { id: r.id }) } : {}); } });
      const labels = { task: ['Add task', 'checkCircle'], homework: ['Add homework', 'book'], event: ['Add event', 'calendar'], reminder: ['Add reminder', 'bell'], note: ['Save note', 'file'] };
      const adds = [mk(p.kind, ...labels[p.kind]), ...Object.keys(labels).filter((k) => k !== p.kind && !(k === 'event' && !p.time)).slice(0, 3).map((k) => mk(k, ...labels[k]))];
      const addFirst = !!(p.due || p.time || p.priority) || t.split(/\s+/).length >= 3 || (!res.length && !cmds.length);
      rows = addFirst ? [...adds, ...res, ...cmds] : [...res, ...cmds, ...adds];
    }
    const s = Math.min(sel, rows.length - 1);
    const run = (r) => { if (!r) return; close(); r.fn(); };
    const key = (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(s + 1, rows.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(s - 1, 0)); } else if (e.key === 'Enter') { e.preventDefault(); run(rows[s]); } else if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    useEffect(() => { const el = listRef.current && listRef.current.querySelector('.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); }, [s, q]);
    return html`<div class="overlay" style="padding-top:11vh" onPointerDown=${(e) => { if (e.target === e.currentTarget) close(); }}><div class="palette" role="dialog" aria-modal="true" aria-label="Search and quick add">
      <div class="pal-in"><${Icon} n="search" s=${18} c="dim"/><input value=${q} placeholder="Search, or type something to add — “Biology worksheet due Thursday, high priority”" aria-label="Search or quick add" onInput=${(e) => { setQ(e.target.value); setSel(0); }} onKeyDown=${key} ref=${(el) => el && !el._f && ((el._f = 1), el.focus(), setTimeout(() => el.focus(), 30))}/><span class="kbd">Esc</span></div>
      ${t && html`<div class="row wrap g6" style="padding:8px 12px 2px">${TYPES.map(([k, l]) => html`<button class="pill ${type === k ? 'accent' : ''}" onClick=${() => { setType(k); setSel(0); }}>${l}</button>`)}<span class="grow"></span><button class="pill" onClick=${() => setSort(sort === 'date' ? 'relevance' : 'date')}><${Icon} n="sliders" s=${11}/>Sort: ${sort === 'date' ? 'date' : 'best match'}</button></div>`}
      <div class="pal-list" ref=${listRef}>${!t && html`<div class="menu-h">Quick actions</div>`}
        ${rows.map((r, i) => html`<button class="pal-item ${i === s ? 'sel' : ''}" onMouseMove=${() => i !== s && setSel(i)} onClick=${() => run(r)}><span class="pi"><${Icon} n=${r.add ? 'plus' : r.icon} s=${15}/></span><span class="grow" style="min-width:0"><span class="med trunc" style="display:block">${r.title}</span>${r.sub && html`<span class="xs muted trunc" style="display:block">${r.sub}</span>`}</span>${r.add ? html`<span class="pill accent">Create</span>` : r.cmd ? null : html`<span class="pill">${r.type}</span>`}</button>`)}
        ${t && !rows.some((r) => !r.add && !r.cmd) && html`<div class="xs dim" style="padding:8px 12px">No existing items match “${t}”.</div>`}</div>
      <div class="pal-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> navigate</span><span><span class="kbd">Enter</span> select</span><span class="grow"></span><span>Dates, times and priorities are understood as you type</span></div>
    </div></div>`;
  }

  /* ---------- notification center ---------- */
  function NotifBell() {
    const ns = M.state.notifications, unread = ns.filter((n) => !n.read).length, open = M.ui.notif, ref = useRef();
    useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) M.setUI({ notif: false }); }; document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h); }, [open]);
    const ICON = { reminder: 'bell', deadline: 'flag', event: 'calendar', focus: 'timer', digest: 'checkCircle', info: 'info' };
    return html`<span style="position:relative" ref=${ref}><button class="ibtn ${open ? 'on' : ''}" aria-label=${`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded=${open} onClick=${() => M.setUI({ notif: !open })}><${Icon} n="bell"/>${unread > 0 && html`<i class="pip"></i>`}</button>
      ${open && html`<div class="npanel"><div class="row" style="padding:12px 14px;border-bottom:1px solid var(--line)"><b class="grow">Notifications</b>${unread > 0 && html`<button class="btn sm ghost" onClick=${() => M.act((s) => s.notifications.forEach((n) => (n.read = true)))}>Mark all read</button>`}${ns.length > 0 && html`<button class="btn sm ghost" onClick=${() => M.act((s) => (s.notifications = []))}>Clear</button>`}</div>
        <div style="overflow-y:auto">${ns.length === 0 ? html`<${M.Empty} sm icon="bell" title="You're all caught up" text="Reminders, upcoming events and deadline alerts appear here."/>` : ns.slice(0, 50).map((n) => html`<button class="nrow ${n.read ? '' : 'unread'}" key=${n.id} onClick=${() => { M.act(() => (n.read = true)); M.setUI({ notif: false }); M.openLink(n.link); }}><span class="pi" style="width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--sunken);flex:none"><${Icon} n=${ICON[n.kind] || 'bell'} s=${14}/></span><span class="grow" style="min-width:0"><span class="med" style="display:block">${n.title}</span>${n.body && html`<span class="xs muted" style="display:block">${n.body}</span>`}<span class="xxs dim">${M.ago(n.at)}</span></span></button>`)}</div>
        <button class="btn ghost sm" style="margin:6px" onClick=${() => { M.setUI({ notif: false }); M.go('reminders'); }}>Reminder & notification settings</button></div>`}</span>`;
  }

  /* ---------- sidebar & top bar ---------- */
  const badges = () => {
    const T = today(), open = M.open_(), now = M.nowIso(); const hwOver = open.filter((i) => i.kind === 'homework' && M.isOverdue(i)).length, tOver = open.filter((i) => i.kind === 'task' && M.isOverdue(i)).length, rPast = M.state.reminders.filter((r) => !r.done && r.at <= now).length;
    return { myday: [M.dayItems(T).filter((i) => i.status !== 'done').length, false], tasks: tOver ? [tOver, true] : [0, false], homework: hwOver ? [hwOver, true] : [open.filter((i) => i.kind === 'homework' && i.due && i.due <= addDays(T, 3)).length, false], reminders: [rPast, true] };
  };
  function Sidebar() {
    const S = M.state.settings, r = M.ui.route, b = badges(); const st = M.saveStatus;
    return html`<aside class="sidebar" aria-label="Main navigation"><div class="sb-head"><div class="sb-logo" title=${S.sidebarCollapsed ? 'Expand sidebar' : 'Meridian'} onClick=${() => S.sidebarCollapsed && M.act((s) => (s.settings.sidebarCollapsed = false))}><${Icon} n="logo" s=${18}/></div><span class="sb-name">Meridian</span>
        <button class="ibtn sm hide-m" aria-label="Collapse sidebar" title="Collapse sidebar" onClick=${() => M.act((s) => (s.settings.sidebarCollapsed = true))}><${Icon} n="sidebar" s=${15}/></button></div>
      <nav class="sb-nav">${S.sidebar.filter((x) => x.on || x.id === 'settings' || x.id === 'dashboard').map((x) => { const n = M.NAV.find((y) => y.id === x.id), bd = b[n.id]; return html`<button key=${n.id} class="sb-item ${r.view === n.id ? 'active' : ''}" aria-current=${r.view === n.id ? 'page' : null} title=${n.label} onClick=${() => { if (n.id === 'myday') M.ui.dayDate = today(); M.go(n.id); }}><${Icon} n=${n.icon}/><span>${n.label}</span>${bd && bd[0] > 0 && html`<i class="sb-badge ${bd[1] ? 'hot' : ''}" style="font-style:normal">${bd[0]}</i>`}</button>`; })}</nav>
      <div class="sb-foot" title=${st === 'error' ? 'Changes could not be saved' : 'Changes save automatically on this device'}><i class="save-dot ${st === 'saved' ? '' : st}"></i><span>${st === 'saving' ? 'Saving…' : st === 'error' ? 'Not saved' : 'All changes saved'}</span></div></aside>`;
  }
  const NEW = [
    { label: 'Task', icon: 'checkCircle', fn: () => M.open('item', {}) }, { label: 'Homework assignment', icon: 'book', fn: () => M.open('item', { preset: { kind: 'homework' } }) },
    { label: 'Event / schedule block', icon: 'calendar', fn: () => M.open('event', { preset: { date: M.ui.route.view === 'myday' ? M.ui.dayDate : today() } }) }, { label: 'Reminder', icon: 'bell', fn: () => M.open('reminder') }, '-',
    { label: 'Project', icon: 'layers', fn: () => M.open('project') }, { label: 'Goal', icon: 'target', fn: () => M.open('goal') }, { label: 'Habit', icon: 'flame', fn: () => M.open('habit') }, { label: 'Class', icon: 'book', fn: () => M.open('class') }, '-',
    { label: 'Quick note', icon: 'file', fn: () => M.open('capture') }];
  function Topbar() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return html`<header class="topbar"><button class="ibtn only-m" aria-label="Open menu" onClick=${() => M.setUI({ nav: true })}><${Icon} n="menu"/></button>
      <button class="tb-search" onClick=${() => M.setUI({ palette: '' })}><${Icon} n="search" s=${15}/><span class="grow trunc" style="text-align:left">Search or quick add…</span><span class="kbd hide-m">⌘K</span></button><span class="grow"></span>
      <${M.TimerChip}/>
      <${Menu} trigger=${html`<button class="btn primary"><${Icon} n="plus" s=${15}/><span class="hide-m">New</span></button>`} items=${NEW}/>
      <button class="ibtn hide-m" aria-label="Toggle dark mode" title="Toggle dark mode" onClick=${() => M.act((s) => (s.settings.theme = dark ? 'light' : 'dark'))}><${Icon} n=${dark ? 'sun' : 'moon'}/></button>
      <${NotifBell}/></header>`;
  }
  function MobileNav() {
    const v = M.ui.route.view;
    return html`<nav class="mnav" aria-label="Quick navigation">${[['dashboard', 'Home', 'grid'], ['myday', 'My Day', 'sun'], ['calendar', 'Calendar', 'calendar'], ['tasks', 'Tasks', 'checkCircle'], ['homework', 'Homework', 'book']].map(([id, l, ic]) => html`<button class=${v === id ? 'on' : ''} onClick=${() => { if (id === 'myday') M.ui.dayDate = today(); M.go(id); }}><${Icon} n=${ic} s=${20}/>${l}</button>`)}<button onClick=${() => M.setUI({ nav: true })}><${Icon} n="menu" s=${20}/>More</button></nav>`;
  }
  class Boundary extends Component {
    constructor() { super(); this.state = { err: null }; }
    componentDidCatch(err) { console.error(err); this.setState({ err }); }
    render() {
      if (this.state.err) return html`<div class="page narrow"><div class="card"><${M.Empty} icon="alert" title="This section ran into a problem" text=${String(this.state.err.message || this.state.err)}><button class="btn primary" onClick=${() => this.setState({ err: null })}>Try again</button><button class="btn" onClick=${() => { this.setState({ err: null }); M.go('dashboard'); }}>Go to dashboard</button><//><div class="xs dim center" style="padding:0 16px 16px">Your data is safe. If this keeps happening, export a backup from Settings → Data.</div></div></div>`;
      return this.props.children;
    }
  }

  function App() {
    const [, force] = useState(0); useEffect(() => M.subscribe(() => force((x) => x + 1)), []);
    const S = M.state.settings, r = M.ui.route;
    useEffect(() => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)'); const el = document.documentElement;
      const apply = () => { el.dataset.theme = S.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : S.theme; el.dataset.tone = S.tone; el.dataset.density = S.density; el.style.setProperty('--accent', S.accent);
        const h = S.accent.replace('#', ''); const lum = (parseInt(h.slice(0, 2), 16) * 299 + parseInt(h.slice(2, 4), 16) * 587 + parseInt(h.slice(4, 6), 16) * 114) / 1000; el.style.setProperty('--accent-ink', lum > 165 ? '#1A1A1E' : '#fff'); };
      apply(); const on = () => { apply(); M.emit(); }; mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
    }, [S.theme, S.tone, S.density, S.accent]);
    const View = M.views[r.view] || M.views.dashboard;
    return html`<div class="app ${S.sidebarCollapsed ? 'collapsed' : ''} ${M.ui.nav ? 'nav-open' : ''}" onClick=${(e) => { if (M.ui.nav && e.target === e.currentTarget) M.setUI({ nav: false }); }}>
      <${Sidebar}/><main class="main"><${Topbar}/><div class="view" id="main"><${Boundary} key=${r.view + (r.a || '') + (r.b || '')}><${View}/><//></div></main><${MobileNav}/>
      <${M.ModalHost}/>${M.ui.palette != null && html`<${Palette}/>`}${M.ui.focusOverlay && html`<${M.FocusOverlay}/>`}<${M.Toasts}/></div>`;
  }

  /* ---------- keyboard shortcuts ---------- */
  let gPending = 0;
  window.addEventListener('keydown', (e) => {
    if (!M.state) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); M.setUI({ palette: M.ui.palette == null ? '' : null }); return; }
    if (e.key === 'Escape') {
      if (M.ui.palette != null) return M.setUI({ palette: null });
      if (M.ui.modals.length) { const top = M.ui.modals[M.ui.modals.length - 1]; if (top.type === 'welcome') return; if (top.props.resolve) top.props.resolve(false); return M.close(top.id); }
      if (M.ui.notif) return M.setUI({ notif: false }); if (M.ui.nav) return M.setUI({ nav: false });
      return;
    }
    const tg = e.target; if (e.metaKey || e.ctrlKey || e.altKey || (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) || M.ui.modals.length || M.ui.palette != null || M.ui.focusOverlay) return;
    const k = e.key.toLowerCase();
    if (gPending && Date.now() - gPending < 1200) { gPending = 0; const dest = { d: 'dashboard', m: 'myday', c: 'calendar', t: 'tasks', h: 'homework', s: 'schedule', p: 'projects', r: 'reminders', g: 'goals', f: 'focus', n: 'notes', a: 'analytics' }[k]; if (dest) { e.preventDefault(); M.go(dest); } return; }
    const map = { n: () => M.open('item', {}), h: () => M.open('item', { preset: { kind: 'homework' } }), e: () => M.open('event'), r: () => M.open('reminder'), c: () => M.open('capture'), f: () => M.setUI({ focusOverlay: true }), '/': () => M.setUI({ palette: '' }) };
    if (k === 'g') { gPending = Date.now(); return; }
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  /* ---------- boot ---------- */
  const root = document.getElementById('app');
  M.load().then(() => {
    if (!M.state.settings.onboarded) M.ui.modals.push({ id: M.uid(), type: 'welcome', props: {} });
    root.innerHTML = ''; render(html`<${App}/>`, root); setTimeout(M.startEngines, 50);
  }).catch((e) => { console.error(e); root.innerHTML = '<div class="boot" style="font-size:18px;padding:24px;text-align:center">Meridian could not start: ' + String(e && e.message ? e.message : e).replace(/</g, '&lt;') + '</div>'; });
})();
