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
        console.log(data);
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

   Data reality from the API:
   - rawChanges have NO affectedCu — changes are not linked to files
   - affectedProcessMap[proc] = array of CodeUnit (file objects with .classes[])
   - Each CodeUnit has: filename, language, classes[] → each class has methods[]
   - We derive file↔file edges by finding method names that appear in BOTH
     a rawChange AND two different files' class method lists
   - We derive file↔change edges directly (change symbol matches a method in file)
───────────────────────────────────────── */

const PROC_PALETTE = [
    '#c0392b', '#2d6a4f', '#b7580a', '#2c4a7c',
    '#7b3f6e', '#4a6741', '#8c4a2f', '#1a5c6b',
];
function procColor(i) { return PROC_PALETTE[i % PROC_PALETTE.length]; }

function buildGraph() {
    // no-op — rendered on tab open
}

function renderGraph() {
    const container = document.getElementById('graphContainer');
    if (cy) { cy.destroy(); cy = null; }
    if (activeGraph === 'process') renderProcessGraph(container);
    else renderFileGraph(container);
}

/* ── Derive which symbols (method names) belong to each file ──
   CodeUnit.classes[] → each class has methods[] (array of strings or objects).
   We extract all method names from a file's class list.                        */
function extractFileSymbols(codeUnit) {
    const symbols = new Set();
    (codeUnit.classes || []).forEach(cls => {
        (cls.methods || []).forEach(m => {
            // method might be a string or { name: '...' }
            const name = typeof m === 'string' ? m : (m.name || '');
            if (name) symbols.add(name);
        });
        // also grab the class name itself
        const cname = typeof cls === 'string' ? cls : (cls.name || cls.className || '');
        if (cname) symbols.add(cname);
    });
    return symbols;
}

/* ── All changed symbol names from rawChanges ── */
function allChangedSymbols() {
    return new Set(
        allChanges
            .map(c => c.changeType === 'ADDITION' ? c.newParameter : c.oldParameter)
            .filter(Boolean)
    );
}

/* ── Process graph ──
   Nodes  = processes
   Edges  = two processes share ≥1 changed symbol that appears in both their files */
function renderProcessGraph(container) {
    const entries = Object.entries(affectedProcessMap);
    if (!entries.length) { showGraphEmpty(container, 'No processes in response.'); return; }

    const changed = allChangedSymbols();

    // Build per-process symbol set (intersection of changed symbols ∩ file symbols)
    const procSymbols = {};
    entries.forEach(([proc, files]) => {
        procSymbols[proc] = new Set();
        files.forEach(f => {
            extractFileSymbols(f).forEach(s => {
                if (changed.has(s)) procSymbols[proc].add(s);
            });
        });
        // If no class/method data, fall back: every changed symbol touches this process
        if (procSymbols[proc].size === 0) {
            changed.forEach(s => procSymbols[proc].add(s));
        }
    });

    const nodes = entries.map(([proc, files], i) => ({
        data: {
            id: proc, label: proc,
            fileCount: files.length,
            symbolCount: procSymbols[proc].size,
            color: procColor(i),
        }
    }));

    // Also add change nodes — each unique changed symbol is a node
    const changeNodes = [];
    const addSymbols  = new Set(allChanges.filter(c => c.changeType === 'ADDITION').map(c => c.newParameter).filter(Boolean));
    const remSymbols  = new Set(allChanges.filter(c => c.changeType === 'REMOVAL').map(c => c.oldParameter).filter(Boolean));

    changed.forEach(sym => {
        changeNodes.push({
            data: {
                id: `sym::${sym}`,
                label: sym,
                isChange: true,
                changeKind: addSymbols.has(sym) && remSymbols.has(sym) ? 'both'
                    : addSymbols.has(sym) ? 'add' : 'rem',
            }
        });
    });

    // Edges: process → symbol (if that symbol touches the process)
    const edges = [];
    let eid = 0;
    entries.forEach(([proc]) => {
        procSymbols[proc].forEach(sym => {
            edges.push({ data: {
                    id: `e${eid++}`, source: proc, target: `sym::${sym}`,
                }});
        });
    });

    cy = cytoscape({
        container,
        elements: { nodes: [...nodes, ...changeNodes], edges },
        style: [
            // Process nodes
            {
                selector: 'node[!isChange]',
                style: {
                    'background-color': 'data(color)',
                    'background-opacity': 0.85,
                    'label': 'data(label)',
                    'color': '#f0ece4',
                    'font-size': '12px',
                    'font-family': 'Martian Mono, monospace',
                    'font-weight': '700',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-wrap': 'wrap',
                    'text-max-width': '100px',
                    'width': 'mapData(fileCount, 1, 6, 70, 120)',
                    'height': 'mapData(fileCount, 1, 6, 70, 120)',
                    'shape': 'ellipse',
                    'border-width': 2,
                    'border-color': 'rgba(255,255,255,0.15)',
                }
            },
            // Change/symbol nodes
            {
                selector: 'node[isChange][changeKind="add"]',
                style: {
                    'background-color': '#1a3326',
                    'border-width': 1.5,
                    'border-color': '#4caf82',
                    'label': 'data(label)',
                    'color': '#4caf82',
                    'font-size': '9px',
                    'font-family': 'Martian Mono, monospace',
                    'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'text-max-width': '80px',
                    'width': 20, 'height': 20, 'shape': 'diamond',
                }
            },
            {
                selector: 'node[isChange][changeKind="rem"]',
                style: {
                    'background-color': '#331a1a',
                    'border-width': 1.5,
                    'border-color': '#e0705a',
                    'label': 'data(label)',
                    'color': '#e0705a',
                    'font-size': '9px',
                    'font-family': 'Martian Mono, monospace',
                    'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'text-max-width': '80px',
                    'width': 20, 'height': 20, 'shape': 'diamond',
                }
            },
            {
                selector: 'node[isChange][changeKind="both"]',
                style: {
                    'background-color': '#2a2010',
                    'border-width': 1.5,
                    'border-color': '#e8c97a',
                    'label': 'data(label)',
                    'color': '#e8c97a',
                    'font-size': '9px',
                    'font-family': 'Martian Mono, monospace',
                    'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'text-max-width': '80px',
                    'width': 20, 'height': 20, 'shape': 'diamond',
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1.5, 'line-color': '#4a4540',
                    'target-arrow-color': '#4a4540',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier', 'opacity': 0.7,
                }
            },
            { selector: 'edge:hover', style: { 'line-color': '#a09080', 'target-arrow-color': '#a09080', 'opacity': 1, 'width': 2 } },
            { selector: 'node:selected', style: { 'border-width': 3, 'border-color': 'rgba(255,255,255,0.6)' } },
        ],
        layout: {
            name: 'cose',
            animate: true, animationDuration: 600,
            nodeRepulsion: 12000, idealEdgeLength: 160,
            nodeOverlap: 20, padding: 60, randomize: false,
        },
        userZoomingEnabled: true, userPanningEnabled: true,
    });

    attachTooltip(cy,
        node => node.data('isChange')
            ? `<div class="tooltip-title">${node.data('label')}</div>
         <div class="tooltip-row">Type: <span>${node.data('changeKind') === 'add' ? 'Addition' : node.data('changeKind') === 'rem' ? 'Removal' : 'Modified'}</span></div>`
            : `<div class="tooltip-title">${node.data('label')}</div>
         <div class="tooltip-row">Files: <span>${node.data('fileCount')}</span></div>
         <div class="tooltip-row">Changed symbols: <span>${node.data('symbolCount')}</span></div>`,
        edge => `<div class="tooltip-title">dependency</div>
             <div class="tooltip-row">${edge.data('source')} → ${edge.data('target').replace('sym::', '')}</div>`
    );

    document.getElementById('graphLegend').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:#c0392b"></div> Process (size = file count)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#1a3326;border:1.5px solid #4caf82;border-radius:2px;transform:rotate(45deg)"></div> Added symbol</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#331a1a;border:1.5px solid #e0705a;border-radius:2px;transform:rotate(45deg)"></div> Removed symbol</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#2a2010;border:1.5px solid #e8c97a;border-radius:2px;transform:rotate(45deg)"></div> Modified (add+remove)</div>
  `;
}

/* ── File graph ──
   Nodes  = files (grouped by process via compound nodes) + change symbols
   Edges  = file → symbol (if that symbol appears in the file's class methods)  */
function renderFileGraph(container) {
    const entries = Object.entries(affectedProcessMap);
    if (!entries.length) { showGraphEmpty(container, 'No processes in response.'); return; }

    const changed = allChangedSymbols();
    const addSymbols = new Set(allChanges.filter(c => c.changeType === 'ADDITION').map(c => c.newParameter).filter(Boolean));
    const remSymbols = new Set(allChanges.filter(c => c.changeType === 'REMOVAL').map(c => c.oldParameter).filter(Boolean));

    const nodes = [];
    const edges = [];
    let eid = 0;

    // Process compound parent nodes
    entries.forEach(([proc, files], i) => {
        nodes.push({
            data: { id: `proc::${proc}`, label: proc, isProcess: true, color: procColor(i) }
        });

        files.forEach(f => {
            const fname  = f.filename || 'unknown';
            const lang   = (f.language || '').toLowerCase();
            const fcolor = lang === 'java' ? '#8b3620' : '#7a600a';
            const fileSymbols = extractFileSymbols(f);

            // Count how many changed symbols this file touches
            const hits = [...fileSymbols].filter(s => changed.has(s));

            nodes.push({
                data: {
                    id: fname,
                    label: fname.replace(/\.(java|js)$/, ''),
                    parent: `proc::${proc}`,
                    lang, color: fcolor,
                    process: proc,
                    hitCount: hits.length,
                    hitSymbols: hits.slice(0, 5).join(', ') || '—',
                }
            });

            // File → changed symbol edges
            hits.forEach(sym => {
                // Add the symbol node if not already added
                if (!nodes.find(n => n.data.id === `sym::${sym}`)) {
                    const kind = addSymbols.has(sym) && remSymbols.has(sym) ? 'both'
                        : addSymbols.has(sym) ? 'add' : 'rem';
                    nodes.push({
                        data: { id: `sym::${sym}`, label: sym, isChange: true, changeKind: kind }
                    });
                }
                edges.push({ data: { id: `fe${eid++}`, source: fname, target: `sym::${sym}` } });
            });
        });
    });

    // If no file→symbol edges were created (no class/method data in response),
    // fall back: connect every file in the process to every changed symbol
    if (edges.length === 0) {
        changed.forEach(sym => {
            if (!nodes.find(n => n.data.id === `sym::${sym}`)) {
                const kind = addSymbols.has(sym) && remSymbols.has(sym) ? 'both'
                    : addSymbols.has(sym) ? 'add' : 'rem';
                nodes.push({ data: { id: `sym::${sym}`, label: sym, isChange: true, changeKind: kind } });
            }
        });
        entries.forEach(([, files]) => {
            files.forEach(f => {
                const fname = f.filename || 'unknown';
                changed.forEach(sym => {
                    edges.push({ data: { id: `fe${eid++}`, source: fname, target: `sym::${sym}` } });
                });
            });
        });
    }

    cy = cytoscape({
        container,
        elements: { nodes, edges },
        style: [
            // Process compound
            {
                selector: 'node[isProcess]',
                style: {
                    'background-color': 'data(color)', 'background-opacity': 0.06,
                    'border-width': 1.5, 'border-color': 'data(color)', 'border-opacity': 0.5,
                    'label': 'data(label)', 'color': 'data(color)',
                    'font-size': '11px', 'font-family': 'Martian Mono, monospace', 'font-weight': '700',
                    'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -10,
                    'shape': 'roundrectangle', 'padding': '28px',
                }
            },
            // File nodes
            {
                selector: 'node:not([isProcess]):not([isChange])',
                style: {
                    'background-color': 'data(color)', 'background-opacity': 0.9,
                    'label': 'data(label)', 'color': '#f0ece4',
                    'font-size': '9px', 'font-family': 'Martian Mono, monospace', 'font-weight': '500',
                    'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'text-max-width': '80px',
                    'width': 88, 'height': 34, 'shape': 'roundrectangle',
                    'border-width': 0,
                }
            },
            // Change symbol nodes
            {
                selector: 'node[isChange][changeKind="add"]',
                style: {
                    'background-color': '#1a3326', 'border-width': 1.5, 'border-color': '#4caf82',
                    'label': 'data(label)', 'color': '#4caf82',
                    'font-size': '9px', 'font-family': 'Martian Mono, monospace',
                    'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'text-max-width': '80px',
                    'width': 22, 'height': 22, 'shape': 'diamond',
                }
            },
            {
                selector: 'node[isChange][changeKind="rem"]',
                style: {
                    'background-color': '#331a1a', 'border-width': 1.5, 'border-color': '#e0705a',
                    'label': 'data(label)', 'color': '#e0705a',
                    'font-size': '9px', 'font-family': 'Martian Mono, monospace',
                    'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'text-max-width': '80px',
                    'width': 22, 'height': 22, 'shape': 'diamond',
                }
            },
            {
                selector: 'node[isChange][changeKind="both"]',
                style: {
                    'background-color': '#2a2010', 'border-width': 1.5, 'border-color': '#e8c97a',
                    'label': 'data(label)', 'color': '#e8c97a',
                    'font-size': '9px', 'font-family': 'Martian Mono, monospace',
                    'text-valign': 'center', 'text-halign': 'center',
                    'text-wrap': 'wrap', 'text-max-width': '80px',
                    'width': 22, 'height': 22, 'shape': 'diamond',
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 1.5, 'line-color': '#4a4540',
                    'target-arrow-color': '#4a4540', 'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier', 'opacity': 0.65,
                }
            },
            { selector: 'edge:hover', style: { 'line-color': '#a09080', 'target-arrow-color': '#a09080', 'opacity': 1, 'width': 2 } },
            { selector: 'node:selected', style: { 'border-width': 2, 'border-color': 'rgba(255,255,255,0.6)' } },
        ],
        layout: {
            name: 'cose',
            animate: true, animationDuration: 700,
            nodeRepulsion: 8000, idealEdgeLength: 130,
            nodeOverlap: 10, padding: 50, componentSpacing: 80,
        },
        userZoomingEnabled: true, userPanningEnabled: true,
    });

    attachTooltip(cy,
        node => node.data('isChange')
            ? `<div class="tooltip-title">${node.data('label')}</div>
         <div class="tooltip-row">Type: <span>${node.data('changeKind') === 'add' ? 'Addition' : node.data('changeKind') === 'rem' ? 'Removal' : 'Modified'}</span></div>`
            : `<div class="tooltip-title">${node.data('label')}</div>
         <div class="tooltip-row">Process: <span>${node.data('process')}</span></div>
         <div class="tooltip-row">Language: <span>${(node.data('lang') || '').toUpperCase()}</span></div>
         <div class="tooltip-row">Symbols touched: <span>${node.data('hitCount')}</span></div>`,
        edge => `<div class="tooltip-title">touches</div>
             <div class="tooltip-row">${edge.data('source').replace(/\.(java|js)$/, '')} → ${edge.data('target').replace('sym::', '')}</div>`
    );

    document.getElementById('graphLegend').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:#8b3620"></div> Java file</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#7a600a"></div> JS file</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#1a3326;border:1.5px solid #4caf82;border-radius:2px;transform:rotate(45deg)"></div> Added symbol</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#331a1a;border:1.5px solid #e0705a;border-radius:2px;transform:rotate(45deg)"></div> Removed symbol</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#2a2010;border:1.5px solid #e8c97a;border-radius:2px;transform:rotate(45deg)"></div> Modified (add+rem)</div>
  `;
}

function showGraphEmpty(container, msg) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#786a5a;font-family:Martian Mono,monospace;font-size:12px;">${msg}</div>`;
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