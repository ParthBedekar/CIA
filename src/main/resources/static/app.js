/* ─────────────────────────────────────────
   State
───────────────────────────────────────── */
let allChanges         = [];
let affectedProcessMap = {};
let activeFilter       = 'all';
let activeGraph        = 'file';
let cy                 = null;

const API = 'https://cia-production-3b2a.up.railway.app/api/analyze';

/* ─────────────────────────────────────────
   Analysis
───────────────────────────────────────── */
async function runAnalysis() {
    const url = document.getElementById('repoUrl').value.trim();
    const btn = document.getElementById('runBtn');
    const err = document.getElementById('errorMsg');

    err.classList.remove('visible');

    if (!url)                  { showError('Please enter a repository URL.'); return; }
    if (!url.endsWith('.git')) { showError('URL must end in .git\ne.g. https://github.com/user/repo.git'); return; }

    btn.classList.add('btn-loading');
    btn.disabled = true;
    setStatus('running', 'analyzing…');

    try {
        const res     = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const rawText = await res.text();
        console.log('STATUS:', res.status, '| RAW:', rawText);
        if (!res.ok) throw new Error(rawText || `HTTP ${res.status}`);
        const data = JSON.parse(rawText);
        renderResults(data);
        setStatus('done', 'complete');
    } catch (e) {
        showError(e.message || 'Analysis failed. Check the server.');
        setStatus('error', 'error');
    } finally {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

/* ─────────────────────────────────────────
   Render
───────────────────────────────────────── */
function renderResults(data) {
    allChanges         = data.rawChanges         || [];
    affectedProcessMap = data.affectedProcessMap || {};

    const add  = allChanges.filter(c => c.changeType === 'ADDITION').length;
    const rem  = allChanges.filter(c => c.changeType === 'REMOVAL').length;
    const proc = Object.keys(affectedProcessMap).length;

    counter('statAdd',  add);
    counter('statRem',  rem);
    counter('statProc', proc);

    document.getElementById('sumAdd').textContent   = '+' + add;
    document.getElementById('sumRem').textContent   = '−' + rem;
    document.getElementById('sumProc').textContent  = proc;
    document.getElementById('sumTotal').textContent = allChanges.length;
    document.getElementById('summarySection').style.display = 'block';

    renderChangesTable(allChanges);
    renderProcesses(affectedProcessMap);

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('results').style.display    = 'block';

    switchView('changes', document.querySelector('.view-tab[data-view="changes"]'));
}

/* ─────────────────────────────────────────
   Changes table
───────────────────────────────────────── */
function renderChangesTable(changes) {
    const table = document.getElementById('changesTable');
    table.innerHTML = '';

    if (!changes.length) {
        table.innerHTML = '<div class="table-empty">No changes detected.</div>';
        return;
    }

    changes.forEach((c, i) => {
        const isAdd  = c.changeType === 'ADDITION';
        const param  = isAdd ? (c.newParameter || '') : (c.oldParameter || '');
        const cat    = guessCategory(param);
        const fname  = c.affectedCu ? (c.affectedCu.filename || '') : '';

        const row = document.createElement('div');
        row.className            = 'change-row';
        row.dataset.type         = c.changeType;
        row.dataset.category     = cat;
        row.dataset.param        = param.toLowerCase();
        row.style.animationDelay = Math.min(i * 10, 250) + 'ms';

        row.innerHTML = `
      <span class="change-sign ${isAdd ? 'add' : 'rem'}">${isAdd ? '+' : '−'}</span>
      <span class="change-cat">${cat}</span>
      <span class="change-param" title="${esc(param)}">${esc(param)}</span>
      <span class="change-file"  title="${esc(fname)}">${esc(fname)}</span>
    `;
        table.appendChild(row);
    });
}

/* ─────────────────────────────────────────
   Processes view
───────────────────────────────────────── */
function renderProcesses(pm) {
    const grid = document.getElementById('processesGrid');
    grid.innerHTML = '';

    const entries = Object.entries(pm);
    if (!entries.length) {
        grid.innerHTML = '<p style="color:var(--ink3);font-size:12px;">No processes identified.</p>';
        return;
    }

    entries.forEach(([proc, files], i) => {
        const card = document.createElement('div');
        card.className            = 'process-card';
        card.style.animationDelay = i * 40 + 'ms';

        const filesHtml = files.map(f => {
            const fname      = f.filename || 'unknown';
            const lang       = (f.language || '').toLowerCase();
            const fileMethods = new Set(f.methods || []);
            const hits = allChanges.filter(c => {
                const sym = c.changeType === 'ADDITION' ? c.newParameter : c.oldParameter;
                return sym && fileMethods.has(sym);
            }).length;

            return `
        <div class="process-file-row">
          <span class="file-lang-badge ${lang}">${lang.toUpperCase()}</span>
          <span class="file-name">${esc(fname)}</span>
          <span class="file-changes">${hits} hit${hits !== 1 ? 's' : ''}</span>
        </div>`;
        }).join('');

        card.innerHTML = `
      <div class="process-card-header">
        <span class="process-card-name">${esc(proc)}</span>
        <span class="tag">${files.length} file${files.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="process-card-body">${filesHtml}</div>`;

        grid.appendChild(card);
    });
}

/* ─────────────────────────────────────────
   Graph
   3-tier: process (circle) → file (rect) → symbol (diamond)
   Edges come from real data: file.methods[] intersected with rawChanges symbols
───────────────────────────────────────── */
const PROC_PALETTE = [
    '#9b3a2a','#2d6a4f','#7a580a','#2c4a7c',
    '#6b3f7e','#3a6741','#7c402f','#1a5c6b',
];
const procColor = i => PROC_PALETTE[i % PROC_PALETTE.length];

function renderGraph() {
    const container = document.getElementById('graphContainer');
    if (cy) { cy.destroy(); cy = null; }
    container.innerHTML = '';
    if (activeGraph === 'process') renderProcessGraph(container);
    else                           renderFileGraph(container);
}

/* ── Process graph: process → symbol ── */
function renderProcessGraph(container) {
    const entries = Object.entries(affectedProcessMap);
    if (!entries.length) { showGraphEmpty(container); return; }

    const { addSet, remSet, allSyms } = symbolSets();

    // per-process: which changed symbols appear in any file's methods[]?
    const procSyms = {};
    entries.forEach(([proc, files]) => {
        procSyms[proc] = new Set();
        files.forEach(f => (f.methods || []).forEach(m => { if (allSyms.has(m)) procSyms[proc].add(m); }));
        if (procSyms[proc].size === 0) allSyms.forEach(s => procSyms[proc].add(s)); // fallback
    });

    const nodes = [];
    const edges = [];
    let eid = 0;

    entries.forEach(([proc, files], i) => {
        nodes.push({ data: { id: proc, label: proc, type: 'process', color: procColor(i), fileCount: files.length, symCount: procSyms[proc].size }});
    });
    allSyms.forEach(sym => {
        nodes.push({ data: { id: `s::${sym}`, label: sym, type: 'symbol', kind: symKind(sym, addSet, remSet) }});
    });
    entries.forEach(([proc]) => {
        procSyms[proc].forEach(sym => edges.push({ data: { id: `e${eid++}`, source: proc, target: `s::${sym}`, etype: 'proc-sym' }}));
    });

    cy = makeCy(container, nodes, edges, sharedStyle());
    attachTooltip(cy,
        n => n.data('type') === 'process'
            ? `<div class="tooltip-title">${n.data('label')}</div><div class="tooltip-row">Files: <span>${n.data('fileCount')}</span></div><div class="tooltip-row">Symbols: <span>${n.data('symCount')}</span></div>`
            : `<div class="tooltip-title">${n.data('label')}</div><div class="tooltip-row">Change: <span>${kindLabel(n.data('kind'))}</span></div>`,
        e => `<div class="tooltip-row">${e.data('source')} → <span>${e.data('target').replace('s::','')}</span></div>`
    );
    setLegend(false);
}

/* ── File graph: process → file → symbol ── */
function renderFileGraph(container) {
    const entries = Object.entries(affectedProcessMap);
    if (!entries.length) { showGraphEmpty(container); return; }

    const { addSet, remSet, allSyms } = symbolSets();

    const nodes    = [];
    const edges    = [];
    let eid        = 0;
    const symAdded = new Set();

    entries.forEach(([proc, files], i) => {
        const pcolor = procColor(i);
        nodes.push({ data: { id: proc, label: proc, type: 'process', color: pcolor, fileCount: files.length }});

        files.forEach(f => {
            const fid         = `f::${proc}::${f.filename}`;
            const fileMethods = new Set(f.methods || []);
            const hits        = [...allSyms].filter(s => fileMethods.has(s));

            nodes.push({ data: { id: fid, label: f.filename || 'unknown', type: 'file', lang: (f.language||'').toLowerCase(), proc, pcolor, hitCount: hits.length }});
            edges.push({ data: { id: `e${eid++}`, source: proc, target: fid, etype: 'proc-file' }});

            hits.forEach(sym => {
                const sid = `s::${sym}`;
                if (!symAdded.has(sym)) {
                    nodes.push({ data: { id: sid, label: sym, type: 'symbol', kind: symKind(sym, addSet, remSet) }});
                    symAdded.add(sym);
                }
                edges.push({ data: { id: `e${eid++}`, source: fid, target: sid, etype: 'file-sym' }});
            });
        });
    });

    // fallback if no methods[] data — direct process→symbol
    if (!edges.some(e => e.data.etype === 'file-sym')) {
        allSyms.forEach(sym => {
            if (!symAdded.has(sym)) {
                nodes.push({ data: { id: `s::${sym}`, label: sym, type: 'symbol', kind: symKind(sym, addSet, remSet) }});
                symAdded.add(sym);
            }
            entries.forEach(([proc]) =>
                edges.push({ data: { id: `e${eid++}`, source: proc, target: `s::${sym}`, etype: 'proc-sym' }})
            );
        });
    }

    cy = makeCy(container, nodes, edges, sharedStyle());
    attachTooltip(cy,
        n => {
            if (n.data('type') === 'process') return `<div class="tooltip-title">${n.data('label')}</div><div class="tooltip-row">Files: <span>${n.data('fileCount')}</span></div>`;
            if (n.data('type') === 'file')    return `<div class="tooltip-title">${n.data('label')}</div><div class="tooltip-row">Process: <span>${n.data('proc')}</span></div><div class="tooltip-row">Symbols hit: <span>${n.data('hitCount')}</span></div>`;
            return `<div class="tooltip-title">${n.data('label')}</div><div class="tooltip-row">Change: <span>${kindLabel(n.data('kind'))}</span></div>`;
        },
        e => {
            if (e.data('etype') === 'proc-file') return `<div class="tooltip-row">${e.data('source')} contains <span>${e.data('target').split('::')[2]}</span></div>`;
            return `<div class="tooltip-row">${(e.data('source').split('::')[2]||e.data('source'))} touches <span>${e.data('target').replace('s::','')}</span></div>`;
        }
    );
    setLegend(true);
}

/* ─────────────────────────────────────────
   Cytoscape helpers
───────────────────────────────────────── */
function makeCy(container, nodes, edges, style) {
    return cytoscape({
        container,
        elements: { nodes, edges },
        style,
        layout: {
            name: 'cose',
            animate: true, animationDuration: 550,
            nodeRepulsion: 12000,
            idealEdgeLength: 160,
            nodeOverlap: 24,
            padding: 80,
            randomize: false,
            componentSpacing: 80,
            gravity: 0.3,
            numIter: 1000,
        },
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        minZoom: 0.1,
        maxZoom: 5,
    });
}

function sharedStyle() {
    return [
        // Process
        {
            selector: 'node[type="process"]',
            style: {
                'background-color': 'data(color)', 'background-opacity': 0.88,
                'label': 'data(label)', 'color': '#f0ece4',
                'font-size': '13px', 'font-family': 'Martian Mono, monospace', 'font-weight': '700',
                'text-valign': 'center', 'text-halign': 'center',
                'width': 'mapData(fileCount, 1, 8, 80, 150)',
                'height': 'mapData(fileCount, 1, 8, 80, 150)',
                'shape': 'ellipse', 'border-width': 2, 'border-color': 'rgba(255,255,255,0.18)',
            }
        },
        // File
        {
            selector: 'node[type="file"]',
            style: {
                'background-color': '#272220', 'background-opacity': 1,
                'border-width': 1.5, 'border-color': 'data(pcolor)', 'border-opacity': 0.55,
                'label': 'data(label)', 'color': '#b8b4ac',
                'font-size': '9px', 'font-family': 'Martian Mono, monospace', 'font-weight': '500',
                'text-valign': 'center', 'text-halign': 'center',
                'text-wrap': 'none',
                'width': 100, 'height': 30, 'shape': 'roundrectangle',
            }
        },
        { selector: 'node[type="file"]:hover', style: { 'background-color': '#38302a', 'color': '#f0ece4', 'border-opacity': 1 }},
        // Symbol additions
        {
            selector: 'node[type="symbol"][kind="add"]',
            style: {
                'background-color': '#1a3624', 'border-width': 1.5, 'border-color': '#5ab882',
                'label': 'data(label)', 'color': '#5ab882',
                'font-size': '9px', 'font-family': 'Martian Mono, monospace',
                'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6,
                'text-wrap': 'none',
                'width': 14, 'height': 14, 'shape': 'diamond',
            }
        },
        // Symbol removals
        {
            selector: 'node[type="symbol"][kind="rem"]',
            style: {
                'background-color': '#361a1a', 'border-width': 1.5, 'border-color': '#cc5a48',
                'label': 'data(label)', 'color': '#cc5a48',
                'font-size': '9px', 'font-family': 'Martian Mono, monospace',
                'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6,
                'text-wrap': 'none',
                'width': 14, 'height': 14, 'shape': 'diamond',
            }
        },
        // Symbol both
        {
            selector: 'node[type="symbol"][kind="both"]',
            style: {
                'background-color': '#2e2010', 'border-width': 1.5, 'border-color': '#c8a840',
                'label': 'data(label)', 'color': '#c8a840',
                'font-size': '9px', 'font-family': 'Martian Mono, monospace',
                'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 6,
                'text-wrap': 'none',
                'width': 14, 'height': 14, 'shape': 'diamond',
            }
        },
        { selector: 'node[type="symbol"]:hover', style: { 'width': 18, 'height': 18, 'border-width': 2 }},
        // Edges
        { selector: 'edge[etype="proc-file"]', style: { 'width': 1.5, 'line-color': '#3a3530', 'target-arrow-color': '#3a3530', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'opacity': 0.5 }},
        { selector: 'edge[etype="file-sym"]',  style: { 'width': 1,   'line-color': '#524840', 'target-arrow-color': '#524840', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'opacity': 0.65 }},
        { selector: 'edge[etype="proc-sym"]',  style: { 'width': 1,   'line-color': '#524840', 'target-arrow-color': '#524840', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'opacity': 0.55 }},
        { selector: 'edge',                    style: { 'width': 1.5, 'line-color': '#4a4540', 'target-arrow-color': '#4a4540', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'opacity': 0.6 }},
        { selector: 'edge:hover',              style: { 'line-color': '#a09080', 'target-arrow-color': '#a09080', 'opacity': 1, 'width': 2 }},
        { selector: 'node:selected',           style: { 'border-width': 3, 'border-color': 'rgba(255,255,255,0.65)', 'border-opacity': 1 }},
    ];
}

function attachTooltip(cyInst, nodeHtml, edgeHtml) {
    const tooltip = document.getElementById('graphTooltip');
    cyInst.on('mouseover', 'node[type]', evt => {
        const pos = evt.renderedPosition;
        tooltip.innerHTML = nodeHtml(evt.target);
        tooltip.style.left = (pos.x + 14) + 'px';
        tooltip.style.top  = Math.max(8, pos.y - 14) + 'px';
        tooltip.classList.add('visible');
    });
    cyInst.on('mouseover', 'edge', evt => {
        const pos = evt.renderedPosition;
        tooltip.innerHTML = edgeHtml(evt.target);
        tooltip.style.left = (pos.x + 14) + 'px';
        tooltip.style.top  = Math.max(8, pos.y - 14) + 'px';
        tooltip.classList.add('visible');
    });
    cyInst.on('mouseout',  'node, edge', () => tooltip.classList.remove('visible'));
    cyInst.on('pan zoom',  ()           => tooltip.classList.remove('visible'));
}

function showGraphEmpty(container) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#786a5a;font-family:Martian Mono,monospace;font-size:12px;">No graph data available.</div>`;
}

function setLegend(showFile) {
    document.getElementById('graphLegend').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:#9b3a2a;border-radius:50%"></div> Process</div>
    ${showFile ? '<div class="legend-item"><div class="legend-swatch square" style="background:#272220;border:1.5px solid #666;border-radius:2px"></div> File</div>' : ''}
    <div class="legend-item"><div class="legend-swatch" style="background:#1a3624;border:1.5px solid #5ab882;border-radius:2px;transform:rotate(45deg);width:9px;height:9px;flex-shrink:0"></div> Added</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#361a1a;border:1.5px solid #cc5a48;border-radius:2px;transform:rotate(45deg);width:9px;height:9px;flex-shrink:0"></div> Removed</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#2e2010;border:1.5px solid #c8a840;border-radius:2px;transform:rotate(45deg);width:9px;height:9px;flex-shrink:0"></div> Modified</div>
  `;
}

/* ─────────────────────────────────────────
   Graph controls
───────────────────────────────────────── */
function fitGraph() { if (cy) cy.fit(undefined, 60); }
function zoomIn()   { if (cy) cy.zoom({ level: cy.zoom() * 1.3,  renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }); }
function zoomOut()  { if (cy) cy.zoom({ level: cy.zoom() * 0.77, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }); }

function switchGraph(type, btn) {
    activeGraph = type;
    document.querySelectorAll('.graph-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGraph();
}

/* ─────────────────────────────────────────
   View switching
───────────────────────────────────────── */
function switchView(view, btn) {
    document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('view-' + view).style.display = 'block';
    btn.classList.add('active');
    if (view === 'graph') setTimeout(renderGraph, 80);
}

/* ─────────────────────────────────────────
   Filters
───────────────────────────────────────── */
function setFilter(btn) {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
}

function applyFilters() {
    const search = (document.getElementById('searchBox').value || '').toLowerCase();
    document.querySelectorAll('.change-row').forEach(row => {
        const tm = activeFilter === 'all' || row.dataset.type === activeFilter || row.dataset.category === activeFilter;
        const sm = !search || row.dataset.param.includes(search);
        row.style.display = tm && sm ? 'grid' : 'none';
    });
}

/* ─────────────────────────────────────────
   Utility
───────────────────────────────────────── */
function symbolSets() {
    const addSet = new Set(allChanges.filter(c => c.changeType === 'ADDITION').map(c => c.newParameter).filter(Boolean));
    const remSet = new Set(allChanges.filter(c => c.changeType === 'REMOVAL').map(c => c.oldParameter).filter(Boolean));
    const allSyms = new Set([...addSet, ...remSet]);
    return { addSet, remSet, allSyms };
}

function symKind(sym, addSet, remSet) {
    return addSet.has(sym) && remSet.has(sym) ? 'both' : addSet.has(sym) ? 'add' : 'rem';
}

function kindLabel(k) {
    return k === 'add' ? 'Addition' : k === 'rem' ? 'Removal' : 'Modified (add+remove)';
}

function guessCategory(p) {
    if (!p) return 'unknown';
    if (p.includes('.') && /^[a-z]/.test(p)) return 'import';
    if (/^[A-Z]/.test(p)) return 'class';
    return 'method';
}

function setStatus(cls, label) {
    document.getElementById('statusDot').className = 'status-dot ' + cls;
    document.getElementById('statusLabel').textContent = label;
}

function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.classList.add('visible');
}

function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function counter(id, target) {
    const el = document.getElementById(id);
    let val  = 0;
    const step = Math.max(1, Math.ceil(target / 18));
    const iv = setInterval(() => { val = Math.min(val + step, target); el.textContent = val; if (val >= target) clearInterval(iv); }, 28);
}

document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement === document.getElementById('repoUrl')) runAnalysis();
});