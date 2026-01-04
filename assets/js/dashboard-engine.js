/**
 * 🎓 Unified Grade Boundary Dashboard Engine
 * Handles CSV parsing, DataTables, and Chart.js for all exam boards.
 * Supports both A-Level (A*-E) and IGCSE (A*-G) grade scales.
 * Author: Fire-Frog-Fuel & ChessMastermind
 */

// --- 1. Shared Utilities & Constants ---
const MONTH_MAP = { 
    jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 
};

// A-Level grades (A*-E)
const GRADE_COLORS_ALEVEL = { 
    'a*': '#2ECC71', a: '#F4A261', b: '#E9C46A', c: '#E63946', d: '#264653', e: '#6D597A', u: '#999999' 
};

// IGCSE grades (A*-G) - extended color palette
const GRADE_COLORS_IGCSE = { 
    'a*': '#2ECC71', a: '#27AE60', b: '#F4A261', c: '#E9C46A', d: '#E76F51', e: '#E63946', f: '#264653', g: '#6D597A', u: '#999999' 
};

// IGCSE 9-1 numeric grades (Edexcel) - color palette
const GRADE_COLORS_IGCSE_NUMERIC = {
    '9': '#2ECC71', '8': '#27AE60', '7': '#F4A261', '6': '#E9C46A', '5': '#E76F51', '4': '#E63946', '3': '#264653', '2': '#6D597A', '1': '#999999'
};

// Default to A-Level colors (will be overridden per config)
let GRADE_COLORS = GRADE_COLORS_ALEVEL;

// Custom DataTable Sorter for "Year Month" strings
if (window.jQuery && jQuery.fn.dataTable) {
    jQuery.fn.dataTable.ext.type.order["session-pre"] = function (cell) {
        if (!cell) return 0;
        const clean = String(cell).toLowerCase().replace(/[-_]/g, " ").trim();
        const tokens = clean.split(/\s+/);
        if (tokens.length < 2) return 0;
        
        let y = 0, m = 0;
        // Handle "2025 June" vs "June 2025"
        if (/^\d{4}$/.test(tokens[0])) { y = parseInt(tokens[0]); m = MONTH_MAP[tokens[1].slice(0,3)] || 0; }
        else if (/^\d{4}$/.test(tokens[1])) { y = parseInt(tokens[1]); m = MONTH_MAP[tokens[0].slice(0,3)] || 0; }
        
        return y * 100 + m;
    };
}

// --- 2. Main Initialization Function ---
async function initExamDashboard(config) {
    console.log(`🚀 Initializing Dashboard for ${config.chart.title}...`);
    
    // Set grade colors based on config (IGCSE vs A-Level)
    const isIGCSE = config.isIGCSE || false;
    const isNumericGrades = config.isNumericGrades || false; // Edexcel IGCSE uses 9-1
    const gradeColors = isNumericGrades ? GRADE_COLORS_IGCSE_NUMERIC : (isIGCSE ? GRADE_COLORS_IGCSE : GRADE_COLORS_ALEVEL);
    const gradeScale = isNumericGrades ? ['9','8','7','6','5','4','3','2','1'] : (isIGCSE ? ['a*','a','b','c','d','e','f','g','u'] : ['a*','a','b','c','d','e','u']);

    try {
        // Fetch and Parse CSV
        const response = await fetch(config.csvUrl);
        if (!response.ok) throw new Error(`CSV not found: ${config.csvUrl}`);
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                // Initialize Table and Chart with parsed data
                // Pass meta.fields to preserve original CSV column order (Object.keys reorders numeric keys)
                const csvHeaders = results.meta.fields || [];
                setupDashboard(results.data, csvText, config, { gradeColors, gradeScale, isIGCSE, isNumericGrades, csvHeaders });
            }
        });
    } catch (err) {
        console.error("Dashboard Load Error:", err);
        const tableBody = document.querySelector(config.dom.table + ' tbody') || document.querySelector(config.dom.table);
        if(tableBody) tableBody.innerHTML = `<tr><td colspan="100%" class="text-center py-4 text-red-500">Failed to load data. Please try refreshing.</td></tr>`;
    }
}

function setupDashboard(data, rawCsv, config, gradeConfig = {}) {
    const { dom, columns, chart: chartConfig } = config;
    const { gradeColors = GRADE_COLORS_ALEVEL, gradeScale = ['a*','a','b','c','d','e','u'], isIGCSE = false, isNumericGrades = false, csvHeaders = [] } = gradeConfig;
    const $table = $(dom.table);

    // --- A. Setup DataTable ---
    // Use csvHeaders from PapaParse meta.fields to preserve original CSV column order
    // (Object.keys reorders numeric keys like '1','2','9' in ascending order)
    const headers = csvHeaders.length > 0 ? csvHeaders : Object.keys(data[0] || {});
    // Filter out columns if needed (e.g., hiding internal codes), currently showing all
    const dtColumns = headers.map(h => ({ data: h, title: h }));
    
    // Auto-detect Session column index for sorting
    const sessionIdx = headers.findIndex(h => /session|series/i.test(h));

    const dataTable = $table.DataTable({
        data: data,
        columns: dtColumns,
        columnDefs: sessionIdx > -1 ? [{ targets: sessionIdx, type: "session" }] : [],
        order: sessionIdx > -1 ? [[sessionIdx, "asc"]] : [],
        responsive: true,
        deferRender: true,
        pageLength: 10,
        autoWidth: false
    });

    // Inject "Component" Filter into Table Controls (Only if component col exists)
    if (columns.component) {
        const compColIdx = headers.indexOf(columns.component);
        if (compColIdx > -1) {
            const uniqueComps = new Set(data.map(r => r[columns.component]).filter(Boolean));
            const filterId = `dt-filter-${Math.random().toString(36).substr(2,5)}`;
            
            // Append generic filter input to DataTables wrapper
            $(dom.table + '_filter').append(`
                <label class="ml-4 font-semibold text-sm">Component: 
                    <input id="${filterId}" list="${filterId}-list" class="border rounded px-2 py-1 ml-1 w-24 sm:w-32 bg-gray-50 dark:bg-gray-700 dark:border-gray-600" placeholder="Filter">
                </label>
                <datalist id="${filterId}-list"></datalist>
            `);
            
            uniqueComps.forEach(c => $(`#${filterId}-list`).append(`<option value="${c}">`));
            
            // Bind search logic
            $(`#${filterId}`).on('input', function() {
                dataTable.column(compColIdx).search(this.value).draw();
            });
        }
    }

    // --- B. Process Data for Chart ---
    const chartData = {}; // structure: [Subject][Component][Session] -> {grades...}

    data.forEach(row => {
        // 1. Identify Subject
        const subj = String(row[columns.code] || row['SubjectCode'] || row['code'] || '').trim();
        if (!subj) return;

        // 2. Identify Component (Default to "Main" for boards without components)
        let comp = "Main";
        if (columns.component && row[columns.component]) {
            comp = String(row[columns.component]).trim();
        }

        // 3. Identify Session (Handles "Series" vs "Year+Session")
        let sessionStr = "";
        if (columns.series) {
            sessionStr = String(row[columns.series] || "").trim(); // CIE style
        } else {
            const y = row[columns.year] || "";
            const s = row[columns.session] || "";
            sessionStr = `${y} ${s}`.trim(); // Edexcel/OCR/AQA style
        }
        
        // Normalize session to "YYYY Mon" for consistent sorting
        const sessionKey = normalizeSession(sessionStr); 
        if (!sessionKey) return;

        // 4. Build Structure
        chartData[subj] ??= {};
        chartData[subj][comp] ??= {};
        chartData[subj][comp][sessionKey] ??= {};
        const entry = chartData[subj][comp][sessionKey];

        // 5. Extract Values (supports both A-Level and IGCSE grade scales)
        gradeScale.forEach(g => {
            // Try lowercase key first, then uppercase
            const val = parseFloat(row[g] ?? row[g.toUpperCase()]);
            if (!isNaN(val)) entry[g] = val;
        });

        const maxMark = parseFloat(row[columns.maxMark] ?? row['MaxMark']);
        if (!isNaN(maxMark)) entry.max_mark = maxMark;

        if (columns.ums) {
            const ums = parseFloat(row[columns.ums]);
            if (!isNaN(ums)) entry.ums = ums;
        }
    });

    // --- C. Setup Chart Controls ---
    const subjSelect = document.querySelector(dom.subjectSearch);
    // component controls are optional (some boards are unit-only)
    const compSelect = dom.componentSearch ? document.querySelector(dom.componentSearch) : null;
    const subjList = document.querySelector(dom.subjectList);
    const compList = dom.componentList ? document.querySelector(dom.componentList) : null;

    // Provide safe fallbacks so pages without component inputs don't throw
    const _compSelect = compSelect || { value: '', disabled: true, placeholder: '', addEventListener: function(){} };
    const _compList = compList || { innerHTML: '', appendChild: function(){}, value: '' };
    
    // Populate Subjects
    Object.keys(chartData).sort().forEach(s => {
        if (subjList) subjList.appendChild(new Option(s, s)); // Uses <option value="s">s</option> logic
    });

    // Helper: Update Component List based on Subject
    function updateComponents(subject) {
        if (_compList) _compList.innerHTML = "";
        _compSelect.value = "";

        if (!subject || !chartData[subject]) {
            _compSelect.disabled = true;
            return;
        }

        const comps = Object.keys(chartData[subject]).sort();

        // If "Main" is the only component (Edexcel/AQA), lock the input
        if (comps.length === 1 && comps[0] === "Main") {
            _compSelect.value = "Main"; // Internal value
            _compSelect.disabled = true; // Visual disable
            // Optional: Set placeholder to "N/A"
            _compSelect.placeholder = "N/A";
        } else {
            _compSelect.disabled = false;
            _compSelect.placeholder = "Select...";
            comps.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                if (_compList && _compList.appendChild) _compList.appendChild(opt);
            });
            _compSelect.value = comps[0]; // Default to first
        }
    }

    // --- D. Chart Rendering ---
    const ctx = document.querySelector(dom.chart).getContext('2d');
    let chartInstance = null;

    function renderChart() {
        const s = subjSelect.value.trim();
        // If component is disabled/empty, use "Main", otherwise use input value
        const c = _compSelect.disabled ? "Main" : _compSelect.value.trim();

        if (!s || !chartData[s] || !chartData[s][c]) {
            if (chartInstance) chartInstance.destroy();
            return;
        }

        const dataObj = chartData[s][c];
        const sessions = Object.keys(dataObj).sort(sessionSorter);
        
        // Determine grades to show based on grading type
        let baseGrades, gradesToShow;
        if (isNumericGrades) {
            // 9-1 numeric grading (Edexcel IGCSE) - show all except 1 (lowest)
            baseGrades = ['9','8','7','6','5','4','3','2'];
            // Check if grade 9 exists in dataset
            const hasNine = sessions.some(k => dataObj[k]['9'] !== undefined);
            gradesToShow = baseGrades.filter(g => g !== '9' || hasNine);
        } else {
            // Check if A* exists in this dataset (to hide it if unused)
            const hasAStar = sessions.some(k => dataObj[k]['a*'] !== undefined);
            // Use appropriate grade scale (IGCSE: A*-G, A-Level: A*-E), filter out U for chart
            baseGrades = isIGCSE ? ['a*','a','b','c','d','e','f','g'] : ['a*','a','b','c','d','e'];
            gradesToShow = baseGrades.filter(g => g !== 'a*' || hasAStar);
        }

        // Build Datasets
        const datasets = [];

        // 1. Max Mark (Dashed Gray)
        datasets.push({
            label: 'Max Mark',
            data: sessions.map(k => dataObj[k].max_mark ?? null),
            borderColor: '#999999',
            borderDash: [5,5],
            pointRadius: 0,
            fill: false,
            order: 10 // Draw behind lines
        });

        // 2. UMS Cap (Gold - AQA Only)
        if (chartConfig.showUms) {
            datasets.push({
                label: '100 UMS',
                data: sessions.map(k => dataObj[k].ums ?? null),
                borderColor: '#FFD700',
                backgroundColor: '#FFD700',
                borderDash: [2,2],
                pointStyle: 'star',
                pointRadius: 6,
                fill: false
            });
        }

        // 3. Grades
        gradesToShow.forEach(g => {
            datasets.push({
                label: g.toUpperCase(),
                data: sessions.map(k => dataObj[k][g] ?? null),
                borderColor: gradeColors[g],
                tension: 0.2,
                fill: false,
                order: 1
            });
        });

        if (chartInstance) chartInstance.destroy();

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: sessions, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    title: { 
                        display: true, 
                        text: `${chartConfig.title} — ${s} ${!_compSelect.disabled ? '('+c+')' : ''}`,
                        font: { size: 16 }
                    },
                    legend: { position: 'bottom', labels: {} },
                    tooltip: {
                        position: 'nearest',
                        itemSort: (a, b) => a.datasetIndex - b.datasetIndex // Keeps Max Mark at top of tooltip list usually
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Exam Session' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Marks' } }
                }
            }
        });
    }

    // --- E. Event Listeners ---
    if (subjSelect) subjSelect.addEventListener('input', () => {
        // Convert to uppercase for case-insensitive matching (e.g., 4ea1 -> 4EA1)
        subjSelect.value = subjSelect.value.toUpperCase();
        updateComponents(subjSelect.value);
        renderChart();
    });
    if (compSelect) compSelect.addEventListener('input', renderChart);

    // Initial Trigger — pick popular subject/component by frequency
    if (Object.keys(chartData).length > 0) {
        // Compute popularity (number of sessions) per subject
        const subjectCounts = Object.keys(chartData).map(s => {
            const comps = chartData[s];
            let total = 0;
            Object.keys(comps).forEach(c => { total += Object.keys(comps[c] || {}).length; });
            return { subject: s, count: total };
        }).sort((a,b) => b.count - a.count);

        const popular = subjectCounts[0].subject;
        if (subjSelect) {
            subjSelect.value = popular;
            updateComponents(popular);
        }

        // If components are available, pick the most common one for this subject
        if (chartData[popular]) {
            const compCounts = Object.keys(chartData[popular]).map(c => ({ comp: c, count: Object.keys(chartData[popular][c]||{}).length }));
            compCounts.sort((a,b) => b.count - a.count);
            const popularComp = compCounts.length ? compCounts[0].comp : null;
            if (compSelect && popularComp) {
                compSelect.value = popularComp;
            } else {
                _compSelect.value = popularComp || "Main";
            }
        }

        renderChart();
    }

    // CSV Download Button
    const btnCSV = document.getElementById('downloadCSV');
    if (btnCSV) {
        btnCSV.onclick = () => {
            // Prepend a metadata comment to the downloaded CSV to indicate source
            const header = `# DATA SOURCE: ${chartConfig.title}. Processed by GradeBoundaries.com for educational use.\n`;
            const content = header + rawCsv;
            const blob = new Blob([content], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${chartConfig.title.split(' ')[0]}_Data.csv`;
            a.click();
            URL.revokeObjectURL(url);
        };
    }
}

// --- 3. Helpers ---
function normalizeSession(str) {
    if (!str) return null;
    str = str.toLowerCase().replace(/[-_]/g, " ");
    const t = str.split(/\s+/);
    
    // Attempt to standardize "2023 June" or "June 2023" to "2023 Jun"
    if (t.length === 2) {
        let y, m;
        if (/^\d{4}$/.test(t[0])) { y = t[0]; m = t[1]; }
        else if (/^\d{4}$/.test(t[1])) { y = t[1]; m = t[0]; }
        
        if (y && m) {
            const mShort = m.slice(0,3);
            if (MONTH_MAP[mShort]) return `${y} ${capitalize(mShort)}`;
        }
    }
    // Fallback
    return capitalize(str);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function sessionSorter(a, b) {
    const [ya, ma] = a.split(" ");
    const [yb, mb] = b.split(" ");
    const yearDiff = parseInt(ya) - parseInt(yb);
    if (yearDiff !== 0) return yearDiff;
    return (MONTH_MAP[ma.toLowerCase()] || 0) - (MONTH_MAP[mb.toLowerCase()] || 0);
}