/* ─────────────────────────────────────────
   State
───────────────────────────────────────── */
let allChanges      = [];
let affectedProcessMap = {};
let activeFilter    = 'all';
let activeGraph     = 'process';
let cy              = null;

const API = 'https://cia-production-3b2a.up.railway.app/api/analyze';

/* ─────────────────────────────────────────
   Analysis
───────────────────────────────────────── */
async function runAnalysis() {
    const url  = document.getElementById('repoUrl').value.trim();
    const btn  = document.getElementById('runBtn');
    const err  = document.getElementById('errorMsg');

    err.classList.remove('visible');

    if (!url) {
        showError('Please enter a repository URL.'); return;
    }
    if (!url.endsWith('.git')) {
        showError('URL must end in .git\ne.g. https://github.com/user/repo.git'); return;
    }

    btn.classList.add('btn-loading');
    btn.disabled = true;
    setStatus('running', 'analyzing…');

    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `HTTP ${res.status}`);
        }

        const data = await res.json();
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

    // Stat cards
    counter('statAdd',  add);
    counter('statRem',  rem);
    counter('statProc', proc);

    // Sidebar summary
    document.getElementById('sumAdd').textContent   = '+' + add;
    document.getElementById('sumRem').textContent   = '−' + rem;
    document.getElementById('sumProc').textContent  = proc;
    document.getElementById('sumTotal').textContent = allChanges.length;
    document.getElementById('summarySection').style.display = 'block';

    // Render all panels
    renderChangesTable(allChanges);
    renderProcesses(affectedProcessMap);
    buildGraph();     // pre-build both graphs

    // Show results
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('results').style.display    = 'block';

    // Default to changes view
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
        const isAdd = c.changeType === 'ADDITION';
        const param = isAdd ? (c.newParameter || '') : (c.oldParameter || '');
        const cat   = guessCategory(param);
        const fname = c.affectedCu ? (c.affectedCu.filename || '') : '';

        const row = document.createElement('div');
        row.className  = 'change-row';
        row.dataset.type     = c.changeType;
        row.dataset.category = cat;
        row.dataset.param    = param.toLowerCase();
        row.style.animationDelay = Math.min(i * 10, 250) + 'ms';

        row.innerHTML = `
      <span class="change-sign ${isAdd ? 'add' : 'rem'}">${isAdd ? '+' : '−'}</span>
      <span class="change-cat">${cat}</span>
      <span class="change-param" title="${esc(param)}">${esc(param)}</span>
      <span class="change-file" title="${esc(fname)}">${esc(fname)}</span>
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
        // Count additions/removals per file
        const fileChangeCounts = {};
        files.forEach(f => {
            const fname = f.filename || 'unknown';
            fileChangeCounts[fname] = allChanges.filter(c =>
                c.affectedCu && c.affectedCu.filename === fname
            ).length;
        });

        const card = document.createElement('div');
        card.className = 'process-card';
        card.style.animationDelay = i * 40 + 'ms';

        const filesHtml = files.map(f => {
            const fname = f.filename || 'unknown';
            const lang  = (f.language || '').toLowerCase();
            const count = fileChangeCounts[fname] || 0;
            return `
        <div class="process-file-row">
          <span class="file-lang-badge ${lang}">${lang.toUpperCase()}</span>
          <span class="file-name">${esc(fname)}</span>
          <span class="file-changes">${count} change${count !== 1 ? 's' : ''}</span>
        </div>
      `;
        }).join('');

        card.innerHTML = `
      <div class="process-card-header">
        <span class="process-card-name">${esc(proc)}</span>
        <span class="tag">${files.length} file${files.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="process-card-body">${filesHtml}</div>
    `;

        grid.appendChild(card);
    });
}

/* ─────────────────────────────────────────
   Graph (Cytoscape)
───────────────────────────────────────── */

// Warm palette — no neon
const PROC_PALETTE = [
    '#c0392b', '#2d6a4f', '#b7580a', '#2c4a7c',
    '#7b3f6e', '#4a6741', '#8c4a2f', '#1a5c6b',
];

function procColor(i) { return PROC_PALETTE[i % PROC_PALETTE.length]; }

function buildGraph() {
    // called when data arrives; actual render happens when graph tab is opened
}

function renderGraph() {
    const container = document.getElementById('graphContainer');
    if (cy) { cy.destroy(); cy = null; }

    if (activeGraph === 'process') {
        renderProcessGraph(container);
    } else {
        renderFileGraph(container);
    }
}

/* ── Process graph ── */
function renderProcessGraph(container) {
    const entries = Object.entries(affectedProcessMap);
    if (!entries.length) return;

    // Build method→processes map for edge inference
    const procMethods = {};
    entries.forEach(([proc, files]) => {
        procMethods[proc] = new Set();
        files.forEach(f => {
            allChanges
                .filter(c => c.affectedCu && c.affectedCu.filename === (f.filename || ''))
                .forEach(c => {
                    const p = c.changeType === 'ADDITION' ? c.newParameter : c.oldParameter;
                    if (p) procMethods[proc].add(p);
                });
        });
    });

    const nodes = entries.map(([proc, files], i) => ({
        data: {
            id: proc,
            label: proc,
            fileCount: files.length,
            changeCount: files.reduce((acc, f) =>
                acc + allChanges.filter(c => c.affectedCu && c.affectedCu.filename === (f.filename || '')).length, 0
            ),
            color: procColor(i),
        }
    }));

    const edges = [];
    let eid = 0;
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            const [a] = entries[i], [b] = entries[j];
            const shared = [...procMethods[a]].filter(m => procMethods[b].has(m));
            if (shared.length) {
                edges.push({ data: {
                        id: `e${eid++}`, source: a, target: b,
                        sharedLabel: shared.slice(0, 2).join(', '),
                        weight: shared.length,
                    }});
            }
        }
    }

    cy = cytoscape({
        container,
        elements: { nodes, edges },
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': 'data(color)',
                    'background-opacity': 0.9,
                    'label': 'data(label)',
                    'color': '#f0ece4',
                    'font-size': '11px',
                    'font-family': 'Martian Mono, monospace',
                    'font-weight': '600',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': '90px',
                    'width': 'mapData(fileCount, 1, 6, 64, 110)',
                    'height': 'mapData(fileCount, 1, 6, 64, 110)',
                    'border-width': 2,
                    'border-color': 'rgba(255,255,255,0.12)',
                    'shape': 'ellipse',
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 3,
                    'border-color': 'rgba(255,255,255,0.5)',
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 'mapData(weight, 1, 5, 1, 3)',
                    'line-color': '#3a3630',
                    'target-arrow-color': '#3a3630',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'opacity': 0.8,
                }
            },
            {
                selector: 'edge:hover',
                style: {
                    'line-color': '#786a5a',
                    'target-arrow-color': '#786a5a',
                    'opacity': 1, 'width': 2,
                }
            }
        ],
        layout: {
            name: nodes.length <= 2 ? 'circle' : 'cose',
            animate: true, animationDuration: 500,
            nodeRepulsion: 10000, idealEdgeLength: 200,
            nodeOverlap: 20, padding: 60,
            randomize: false,
        },
        userZoomingEnabled: true, userPanningEnabled: true,
    });

    attachTooltip(cy, node => `
    <div class="tooltip-title">${node.data('label')}</div>
    <div class="tooltip-row">Files affected: <span>${node.data('fileCount')}</span></div>
    <div class="tooltip-row">Total changes: <span>${node.data('changeCount')}</span></div>
  `, edge => `
    <div class="tooltip-title">${edge.data('source')} ↔ ${edge.data('target')}</div>
    <div class="tooltip-row">Shared symbols: <span>${edge.data('sharedLabel')}</span></div>
  `);

    // Legend
    document.getElementById('graphLegend').innerHTML = `
    <div class="legend-item">
      <div class="legend-swatch" style="background:#c0392b"></div> Process (size = file count)
    </div>
    <div class="legend-item">
      <div class="legend-line-swatch" style="background:#3a3630"></div> Shared symbol
    </div>
  `;
}

/* ── File graph ── */
function renderFileGraph(container) {
    const entries = Object.entries(affectedProcessMap);
    if (!entries.length) return;

    const nodes = [];
    const edges = [];

    // Process compound nodes
    entries.forEach(([proc, files], i) => {
        nodes.push({
            data: { id: `proc::${proc}`, label: proc, isProcess: true, color: procColor(i) }
        });

        files.forEach(f => {
            const fname = f.filename || 'unknown';
            const lang  = (f.language || '').toLowerCase();
            const color = lang === 'java' ? '#c0602a' : '#a08020';
            const changeCount = allChanges.filter(c =>
                c.affectedCu && c.affectedCu.filename === fname
            ).length;

            nodes.push({
                data: {
                    id: fname,
                    label: fname.replace(/\.(java|js)$/, ''),
                    parent: `proc::${proc}`,
                    lang, color, process: proc,
                    changeCount,
                }
            });
        });
    });

    // File-to-file edges via shared changed symbols
    const fileSymbols = {};
    nodes.filter(n => !n.data.isProcess).forEach(n => {
        const fname = n.data.id;
        fileSymbols[fname] = new Set(
            allChanges
                .filter(c => c.affectedCu && c.affectedCu.filename === fname)
                .map(c => c.changeType === 'ADDITION' ? c.newParameter : c.oldParameter)
                .filter(Boolean)
        );
    });

    const fileIds = Object.keys(fileSymbols);
    let eid = 0;
    for (let i = 0; i < fileIds.length; i++) {
        for (let j = i + 1; j < fileIds.length; j++) {
            const a = fileIds[i], b = fileIds[j];
            const shared = [...fileSymbols[a]].filter(s => fileSymbols[b].has(s));
            if (shared.length) {
                edges.push({ data: {
                        id: `fe${eid++}`, source: a, target: b,
                        sharedLabel: shared.slice(0, 2).join(', '),
                    }});
            }
        }
    }

    cy = cytoscape({
        container,
        elements: { nodes, edges },
        style: [
            {
                selector: 'node[isProcess]',
                style: {
                    'background-color': 'data(color)',
                    'background-opacity': 0.07,
                    'border-width': 1.5,
                    'border-color': 'data(color)',
                    'border-opacity': 0.5,
                    'label': 'data(label)',
                    'color': 'data(color)',
                    'font-size': '11px',
                    'font-family': 'Martian Mono, monospace',
                    'font-weight': '700',
                    'text-valign': 'top',
                    'text-halign': 'center',
                    'text-margin-y': -10,
                    'shape': 'roundrectangle',
                    'padding': '24px',
                }
            },
            {
                selector: 'node:not([isProcess])',
                style: {
                    'background-color': 'data(color)',
                    'background-opacity': 0.9,
                    'label': 'data(label)',
                    'color': '#f0ece4',
                    'font-size': '9px',
                    'font-family': 'Martian Mono, monospace',
                    'font-weight': '500',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': '80px',
                    'width': 80, 'height': 32,
                    'shape': 'roundrectangle',
                }
            },
            {
                selector: 'node:not([isProcess]):selected',
                style: { 'border-width': 2, 'border-color': 'rgba(255,255,255,0.5)' }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1.5, 'line-color': '#4a4540',
                    'line-style': 'dashed', 'line-dash-pattern': [5, 3],
                    'target-arrow-shape': 'none', 'curve-style': 'bezier',
                    'opacity': 0.6,
                }
            },
            {
                selector: 'edge:hover',
                style: { 'line-color': '#786a5a', 'opacity': 1, 'width': 2 }
            }
        ],
        layout: {
            name: 'cose',
            animate: true, animationDuration: 600,
            nodeRepulsion: 8000, idealEdgeLength: 120,
            nodeOverlap: 10, padding: 50,
            componentSpacing: 80,
        },
        userZoomingEnabled: true, userPanningEnabled: true,
    });

    attachTooltip(cy, node => `
    <div class="tooltip-title">${node.data('label')}.${node.data('lang')}</div>
    <div class="tooltip-row">Process: <span>${node.data('process')}</span></div>
    <div class="tooltip-row">Changes: <span>${node.data('changeCount')}</span></div>
  `, edge => `
    <div class="tooltip-title">${edge.data('source').split('/').pop()} ↔ ${edge.data('target').split('/').pop()}</div>
    <div class="tooltip-row">Shared: <span>${edge.data('sharedLabel')}</span></div>
  `);

    document.getElementById('graphLegend').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:#c0602a"></div> Java file</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#a08020"></div> JS file</div>
    <div class="legend-item"><div class="legend-swatch square" style="background:#c0392b;opacity:0.3;border:1.5px solid #c0392b"></div> Process group</div>
    <div class="legend-item"><div class="legend-line-swatch" style="background:#4a4540;border-top:1.5px dashed #4a4540"></div> Shared symbol</div>
  `;
}

/* ── Tooltip helper ── */
function attachTooltip(cyInstance, nodeHtml, edgeHtml) {
    const tooltip = document.getElementById('graphTooltip');
    const container = document.getElementById('graphContainer');

    cyInstance.on('mouseover', 'node:not([isProcess])', evt => {
        const pos = evt.renderedPosition;
        const rect = container.getBoundingClientRect();
        tooltip.innerHTML = nodeHtml(evt.target);
        tooltip.style.left = (pos.x + 12) + 'px';
        tooltip.style.top  = (pos.y - 10) + 'px';
        tooltip.classList.add('visible');
    });

    cyInstance.on('mouseover', 'edge', evt => {
        const pos = evt.renderedPosition;
        tooltip.innerHTML = edgeHtml(evt.target);
        tooltip.style.left = (pos.x + 12) + 'px';
        tooltip.style.top  = (pos.y - 10) + 'px';
        tooltip.classList.add('visible');
    });

    cyInstance.on('mouseout', 'node, edge', () => tooltip.classList.remove('visible'));
}

/* ─────────────────────────────────────────
   Graph controls
───────────────────────────────────────── */
function fitGraph()  { if (cy) cy.fit(undefined, 40); }
function zoomIn()    { if (cy) cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }); }
function zoomOut()   { if (cy) cy.zoom({ level: cy.zoom() * 0.8,  renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }); }

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

    if (view === 'graph') {
        // small delay so container has dimensions
        setTimeout(renderGraph, 80);
    }
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
        const typeMatch = activeFilter === 'all'
            || row.dataset.type === activeFilter
            || row.dataset.category === activeFilter;
        const searchMatch = !search || row.dataset.param.includes(search);
        row.style.display = typeMatch && searchMatch ? 'grid' : 'none';
    });
}

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */
function guessCategory(p) {
    if (!p) return 'unknown';
    if (p.includes('.') && /^[a-z]/.test(p)) return 'import';
    if (/^[A-Z]/.test(p)) return 'class';
    return 'method';
}

function setStatus(cls, label) {
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot ' + cls;
    document.getElementById('statusLabel').textContent = label;
}

function showError(msg) {
    const el = document.getElementById('errorMsg');
    el.textContent = msg;
    el.classList.add('visible');
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function counter(id, target) {
    const el = document.getElementById(id);
    let val = 0;
    const step = Math.max(1, Math.ceil(target / 18));
    const iv = setInterval(() => {
        val = Math.min(val + step, target);
        el.textContent = val;
        if (val >= target) clearInterval(iv);
    }, 28);
}

/* ─────────────────────────────────────────
   Keyboard shortcuts
───────────────────────────────────────── */
document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement === document.getElementById('repoUrl')) {
        runAnalysis();
    }
});