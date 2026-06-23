// App Configuration and State
const CONFIG = {
    backendUrl: window.location.origin,
    maxChartPoints: 15,
    matrixCols: 16,
    timeBucketSizeMs: 10000 // 10s bins
};

let telemetryChart = null;

let state = {
    totalEvents: 0,
    anomaliesCount: 0,
    activeIncidents: 0,
    resolvedIncidentsCount: 0,
    hosts: {},             // Map of host -> latest health stats
    telemetryData: [],     // Array of raw telemetry
    anomalies: [],         // Array of anomalies
    incidents: [],         // Array of incidents
    activeFilters: {       // Click filter configurations
        host: null,
        region: null,
        threat: null
    }
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabs();
    initCharts();
    fetchInitialData();
    connectSseStream();
    setupEventHandlers();
});

// Clock Utility (UTC)
function initClock() {
    const clockEl = document.getElementById('clock');
    const updateTime = () => {
        const now = new Date();
        clockEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toISOString().replace('T', ' ').substring(0, 19)} UTC`;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Sidebar Tab Router
function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');

            navItems.forEach(nav => nav.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            item.classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // Header labels
            const titles = {
                explorer: { main: "Anomaly Explorer", sub: "Analyze behavior anomalies and pinpoint security threat root causes" },
                scanner: { main: "Intrusive Asset Scanner", sub: "Run active configuration audits and threat tests on infrastructure nodes" },
                incidents: { main: "Incident Control Center", sub: "Correlate anomalies into threat incidents and monitor defense responses" },
                simulator: { main: "Simulation Command Center", sub: "Inject telemetry scenarios to stress test AI scoring and defenses" }
            };
            
            document.getElementById('tab-title').innerText = titles[tabId].main;
            document.getElementById('tab-subtitle').innerText = titles[tabId].sub;

            if (tabId === 'scanner') {
                populateScannerHosts();
            }
        });
    });
}

// ChartJS Configuration
function initCharts() {
    const telCtx = document.getElementById('telemetryChart').getContext('2d');
    
    // Set global styles for ivory light theme
    Chart.defaults.color = '#5a606a';
    Chart.defaults.font.family = '"FiraCode Nerd Font", monospace';
    Chart.defaults.font.size = 9;

    telemetryChart = new Chart(telCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CPU (%)',
                    borderColor: '#6f42c1', // Purple
                    backgroundColor: 'rgba(111, 66, 193, 0.05)',
                    borderWidth: 1.5,
                    data: [],
                    tension: 0.2,
                    fill: true,
                    pointRadius: 2
                },
                {
                    label: 'Memory (%)',
                    borderColor: '#005ec4', // Blue
                    backgroundColor: 'rgba(0, 94, 196, 0.05)',
                    borderWidth: 1.5,
                    data: [],
                    tension: 0.2,
                    fill: true,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, position: 'top', align: 'end' } },
            scales: {
                y: { min: 0, max: 100, grid: { color: '#e5dec9' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// Fetch initial historical telemetry & incident logs
async function fetchInitialData() {
    try {
        // 1. Fetch telemetry
        const resTelemetry = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/recent-telemetry`);
        state.telemetryData = await resTelemetry.json();
        state.totalEvents = state.telemetryData.length;
        document.getElementById('stat-total-events').innerText = state.totalEvents;

        // Feed charts
        const lastEvents = state.telemetryData.slice(-CONFIG.maxChartPoints);
        lastEvents.forEach(e => {
            const timeLabel = new Date(e.receivedAt || e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            addChartData(telemetryChart, timeLabel, [e.cpu, e.memory]);
        });

        // 2. Fetch incidents
        const resIncidents = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/incidents`);
        state.incidents = await resIncidents.json();
        renderIncidents();

        // 3. Fetch anomalies
        const resAnomalies = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/anomalies`);
        state.anomalies = await resAnomalies.json();
        state.anomaliesCount = state.anomalies.length;
        document.getElementById('stat-anomalies').innerText = state.anomaliesCount;

        // Populate widgets
        recalculateInfluencers();
        renderTimelineMatrix();
        renderAnomaliesTable();
        populateScannerHosts();
    } catch (e) {
        console.error("Error loading initial platform metrics:", e);
    }
}

// Connect SSE stream
function connectSseStream() {
    const streamIndicator = document.getElementById('stream-indicator');
    const streamText = document.getElementById('stream-text');
    const sse = new EventSource(`${CONFIG.backendUrl}/api/v1/events`);

    sse.onopen = () => {
        streamIndicator.className = 'status-indicator online';
        streamText.innerText = 'Live Engine Online';
    };

    sse.onerror = () => {
        streamIndicator.className = 'status-indicator offline';
        streamText.innerText = 'Engine Reconnecting...';
    };

    sse.addEventListener('telemetry', (e) => {
        const data = JSON.parse(e.data);
        state.totalEvents++;
        document.getElementById('stat-total-events').innerText = state.totalEvents;
        
        // Add to state
        state.telemetryData.push(data);
        if (state.telemetryData.length > 500) state.telemetryData.shift();

        // Update charts
        const timeLabel = new Date(data.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        addChartData(telemetryChart, timeLabel, [data.cpu, data.memory]);

        // Add raw log row
        appendLogEntry("telemetry", timeLabel, data.host, `CPU: ${data.cpu.toFixed(1)}% | RAM: ${data.memory.toFixed(1)}% | Ingress: ${data.networkPackets} p/s | Failed Logins: ${data.failedLogins}`);
        
        // Check scanner logs if active
        checkScannerLiveFeed(data);
    });

    sse.addEventListener('anomaly', (e) => {
        const data = JSON.parse(e.data);
        state.anomaliesCount++;
        document.getElementById('stat-anomalies').innerText = state.anomaliesCount;

        // Add to anomalies list
        state.anomalies.unshift(data);
        if (state.anomalies.length > 100) state.anomalies.pop();

        const timeLabel = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        appendLogEntry("anomaly", timeLabel, data.host, `󰒎 ANOMALY DETECTED: Risk Score ${data.riskScore.toFixed(2)} - ${data.reason}`);

        // Update view
        recalculateInfluencers();
        renderTimelineMatrix();
        renderAnomaliesTable();
    });

    sse.addEventListener('incident', (e) => {
        const data = JSON.parse(e.data);
        const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        appendLogEntry("incident-alert", timeLabel, data.host, `🚨 THREAT INCIDENT: Status changed to ${data.status} (${data.description})`);

        // Check if incident exists
        const index = state.incidents.findIndex(i => i.incidentUuid === data.incidentUuid);
        if (index > -1) {
            state.incidents[index] = data;
        } else {
            state.incidents.unshift(data);
        }

        renderIncidents();
    });

    sse.addEventListener('mitigation', (e) => {
        const data = JSON.parse(e.data);
        const timeLabel = new Date(data.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        appendLogEntry("mitigation-run", timeLabel, "System", `⚡ MITIGATION RUNNING: ${data.actionType} - ${data.details}`);
        
        // Refresh incidents
        fetch(`${CONFIG.backendUrl}/api/v1/metrics/incidents`)
            .then(res => res.json())
            .then(data => {
                state.incidents = data;
                renderIncidents();
            });
    });
}

// Helpers: Add charts data points safely
function addChartData(chart, label, dataArray) {
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(dataArray[0]);
    chart.data.datasets[1].data.push(dataArray[1]);

    if (chart.data.labels.length > CONFIG.maxChartPoints) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        chart.data.datasets[1].data.shift();
    }
    chart.update('quiet');
}

// Append log rows to mini console feed
function appendLogEntry(type, time, host, message) {
    const feed = document.getElementById('live-logs-feed');
    const placeholder = feed.querySelector('.log-placeholder');
    if (placeholder) {
        feed.removeChild(placeholder);
    }

    const row = document.createElement('div');
    row.className = `log-row ${type}`;
    row.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-host">${host}</span>
        <span class="log-msg">${message}</span>
    `;

    feed.insertBefore(row, feed.firstChild);

    if (feed.children.length > 50) {
        feed.removeChild(feed.lastChild);
    }
}

// Event Handlers Setup
function setupEventHandlers() {
    document.getElementById('clear-logs').addEventListener('click', () => {
        document.getElementById('live-logs-feed').innerHTML = '<div class="log-placeholder">Waiting for telemetry stream...</div>';
    });

    document.getElementById('btn-refresh').addEventListener('click', () => {
        fetchInitialData();
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
        state.activeFilters.host = null;
        state.activeFilters.region = null;
        state.activeFilters.threat = null;
        document.getElementById('reset-filters').style.display = 'none';
        
        // Remove active CSS classes
        document.querySelectorAll('.influencer-row').forEach(el => el.classList.remove('active'));
        
        renderAnomaliesTable();
        renderTimelineMatrix();
    });

    // Close Modal
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('json-modal').style.display = 'none';
    });

    // Run Scan
    document.getElementById('btn-start-scan').addEventListener('click', () => {
        runScannerAudit();
    });

    // Trigger mitigation manually
    document.getElementById('btn-trigger-remediation').addEventListener('click', () => {
        const btn = document.getElementById('btn-trigger-remediation');
        const uuid = btn.getAttribute('data-incident-uuid');
        if (uuid) {
            triggerMitigationRest(uuid);
        }
    });

    // Query filter input box
    document.getElementById('filter-query').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        filterTableAndMatrix(q);
    });
}

// Analyze loaded anomalies and count influencers
function recalculateInfluencers() {
    let hostsCount = {};
    let regionsCount = {};
    let threatsCount = {};

    state.anomalies.forEach(a => {
        hostsCount[a.host] = (hostsCount[a.host] || 0) + 1;
        
        // Find region from telemetry
        const telMatch = state.telemetryData.find(t => t.host === a.host);
        const region = telMatch ? telMatch.region : 'us-east-1';
        regionsCount[region] = (regionsCount[region] || 0) + 1;

        // Threat type extraction
        let threat = "Unknown Pattern";
        const reason = a.reason.toLowerCase();
        if (reason.contains("login") || reason.contains("failed")) threat = "Brute Force";
        else if (reason.contains("packet") || reason.contains("volume")) threat = "Volumetric DDoS";
        else if (reason.contains("memory") || reason.contains("leak")) threat = "Memory Leak";
        else if (reason.contains("cpu") || reason.contains("saturation")) threat = "CPU Saturation";
        
        threatsCount[threat] = (threatsCount[threat] || 0) + 1;
    });

    renderInfluencerPanel('influencer-host', hostsCount, 'host');
    renderInfluencerPanel('influencer-region', regionsCount, 'region');
    renderInfluencerPanel('influencer-threat', threatsCount, 'threat');
}

function renderInfluencerPanel(elementId, countMap, filterKey) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';

    const sorted = Object.entries(countMap).sort((a,b) => b[1] - a[1]);
    const maxVal = sorted.length > 0 ? sorted[0][1] : 1;

    if (sorted.length === 0) {
        list.innerHTML = '<div class="influencer-placeholder">No influencers found.</div>';
        return;
    }

    sorted.forEach(([name, count]) => {
        const pct = (count / maxVal) * 100;
        const row = document.createElement('div');
        row.className = `influencer-row ${state.activeFilters[filterKey] === name ? 'active' : ''}`;
        row.innerHTML = `
            <div class="influencer-meta">
                <span class="influencer-name">${name}</span>
                <span class="influencer-score">${pct.toFixed(0)}%</span>
            </div>
            <div class="influencer-bar-bg">
                <div class="influencer-bar-fill" style="width: ${pct}%"></div>
            </div>
        `;

        row.addEventListener('click', () => {
            if (state.activeFilters[filterKey] === name) {
                state.activeFilters[filterKey] = null;
                row.classList.remove('active');
            } else {
                // Reset this type
                document.querySelectorAll(`#${elementId} .influencer-row`).forEach(el => el.classList.remove('active'));
                state.activeFilters[filterKey] = name;
                row.classList.add('active');
            }

            // Show clear button if any filter is set
            const hasFilter = Object.values(state.activeFilters).some(v => v !== null);
            document.getElementById('reset-filters').style.display = hasFilter ? 'block' : 'none';

            renderAnomaliesTable();
            renderTimelineMatrix();
        });

        list.appendChild(row);
    });
}

// Render Timeline Matrix (Grid cells)
function renderTimelineMatrix() {
    const gridEl = document.getElementById('matrix-grid');
    const hostsEl = document.getElementById('matrix-hosts');
    gridEl.innerHTML = '';
    hostsEl.innerHTML = '';

    // Get active host names
    const hosts = [...new Set(state.telemetryData.map(t => t.host))].sort();
    if (hosts.length === 0) {
        gridEl.innerHTML = '<div class="influencer-placeholder">Waiting for host registration...</div>';
        return;
    }

    hosts.forEach(host => {
        // Label
        const lbl = document.createElement('span');
        lbl.className = 'matrix-host-label';
        lbl.innerText = host;
        lbl.title = host;
        hostsEl.appendChild(lbl);

        // Row
        const row = document.createElement('div');
        row.className = 'matrix-row';

        // Time buckets: 16 columns of 10s width
        const now = Date.now();
        for (let i = CONFIG.matrixCols - 1; i >= 0; i--) {
            const bucketEnd = now - (i * CONFIG.timeBucketSizeMs);
            const bucketStart = bucketEnd - CONFIG.timeBucketSizeMs;

            // Find max risk score anomaly for this host in this time range
            const hostAnoms = state.anomalies.filter(a => {
                const ts = new Date(a.timestamp).getTime();
                return a.host === host && ts >= bucketStart && ts < bucketEnd;
            });

            let maxRisk = 0;
            let anomalyObj = null;
            hostAnoms.forEach(a => {
                if (a.riskScore > maxRisk) {
                    maxRisk = a.riskScore;
                    anomalyObj = a;
                }
            });

            // Cell styling
            const cell = document.createElement('div');
            cell.className = 'matrix-cell';
            
            if (maxRisk > 0) {
                if (maxRisk >= 0.90) cell.classList.add('r-critical');
                else if (maxRisk >= 0.70) cell.classList.add('r-high');
                else if (maxRisk >= 0.40) cell.classList.add('r-moderate');
                else cell.classList.add('r-minor');

                cell.title = `Host: ${host}\nSeverity: Risk ${maxRisk.toFixed(2)}\nAnomaly: ${anomalyObj.reason}`;
                
                // Add click handler to filter by this cell's host
                cell.addEventListener('click', () => {
                    state.activeFilters.host = host;
                    document.getElementById('reset-filters').style.display = 'block';
                    renderAnomaliesTable();
                });
            } else {
                cell.classList.add('r-normal');
                cell.title = `Host: ${host}\nStatus: Healthy`;
            }

            row.appendChild(cell);
        }
        gridEl.appendChild(row);
    });
}

// Render Anomalies Table (Elastic style)
function renderAnomaliesTable() {
    const tbody = document.getElementById('anomalies-table-body');
    tbody.innerHTML = '';

    // Apply active filters
    let filtered = state.anomalies.filter(a => {
        if (state.activeFilters.host && a.host !== state.activeFilters.host) return false;
        
        if (state.activeFilters.region) {
            const telMatch = state.telemetryData.find(t => t.host === a.host);
            const region = telMatch ? telMatch.region : 'us-east-1';
            if (region !== state.activeFilters.region) return false;
        }

        if (state.activeFilters.threat) {
            let threat = "Unknown Pattern";
            const reason = a.reason.toLowerCase();
            if (reason.contains("login") || reason.contains("failed")) threat = "Brute Force";
            else if (reason.contains("packet") || reason.contains("volume")) threat = "Volumetric DDoS";
            else if (reason.contains("memory") || reason.contains("leak")) threat = "Memory Leak";
            else if (reason.contains("cpu") || reason.contains("saturation")) threat = "CPU Saturation";
            
            if (threat !== state.activeFilters.threat) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No anomalies recorded matching filters.</td></tr>';
        return;
    }

    filtered.forEach(anom => {
        const row = document.createElement('tr');
        const timeStr = new Date(anom.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let sevClass = 'minor';
        if (anom.riskScore >= 0.90) sevClass = 'critical';
        else if (anom.riskScore >= 0.70) sevClass = 'high';
        else if (anom.riskScore >= 0.40) sevClass = 'medium';

        // Actual vs Typical values
        let actVsTyp = 'N/A';
        const r = anom.reason.toLowerCase();
        if (r.contains("packets") || r.contains("volume")) {
            actVsTyp = `${anom.networkPackets.toLocaleString()} p/s vs 120 p/s`;
        } else if (r.contains("failed logins") || r.contains("failed")) {
            actVsTyp = `${anom.failedLogins} logins vs 0`;
        } else if (r.contains("memory") || r.contains("ram")) {
            actVsTyp = `RAM: ${anom.memory.toFixed(1)}% vs 60.0%`;
        } else if (r.contains("cpu") || r.contains("saturation")) {
            actVsTyp = `CPU: ${anom.cpu.toFixed(1)}% vs 35.0%`;
        }

        row.innerHTML = `
            <td>${timeStr}</td>
            <td><span class="severity-badge ${sevClass}">${sevClass}</span></td>
            <td class="font-bold cursor-pointer" onclick="filterByHost('${anom.host}')">${anom.host}</td>
            <td>${anom.reason}</td>
            <td class="font-bold">${anom.riskScore.toFixed(2)}</td>
            <td>${actVsTyp}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="showScanTarget('${anom.host}')"><i class="fa-solid fa-radar-shield"></i> Audit</button>
                <button class="btn btn-outline btn-sm" onclick="viewRawAnomaly(${anom.id})"><i class="fa-solid fa-code"></i> Inspect</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Global functions exposed to inline events
window.filterByHost = function(hostName) {
    state.activeFilters.host = hostName;
    document.getElementById('reset-filters').style.display = 'block';
    renderAnomaliesTable();
    renderTimelineMatrix();
};

window.viewRawAnomaly = function(id) {
    const anom = state.anomalies.find(a => a.id === id);
    if (!anom) return;

    const display = document.getElementById('json-display');
    display.innerText = JSON.stringify(anom, null, 2);
    document.getElementById('json-modal').style.display = 'block';
};

window.showScanTarget = function(hostName) {
    // Switch to scanner tab
    const scannerTabItem = document.querySelector('.nav-item[data-tab="scanner"]');
    if (scannerTabItem) {
        scannerTabItem.click();
        
        // Wait a small timeout for host list to populate then select it
        setTimeout(() => {
            const select = document.getElementById('scanner-host-select');
            select.value = hostName;
        }, 100);
    }
};

// Search filtering on input
function filterTableAndMatrix(query) {
    let tbody = document.getElementById('anomalies-table-body');
    if (!query) {
        renderAnomaliesTable();
        return;
    }

    let filtered = state.anomalies.filter(a => {
        return a.host.toLowerCase().includes(query) || 
               a.reason.toLowerCase().includes(query) ||
               a.riskScore.toString().includes(query);
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No anomalies matching search query.</td></tr>';
        return;
    }

    filtered.forEach(anom => {
        const row = document.createElement('tr');
        const timeStr = new Date(anom.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let sevClass = 'minor';
        if (anom.riskScore >= 0.90) sevClass = 'critical';
        else if (anom.riskScore >= 0.70) sevClass = 'high';
        else if (anom.riskScore >= 0.40) sevClass = 'medium';

        let actVsTyp = 'N/A';
        const r = anom.reason.toLowerCase();
        if (r.contains("packets") || r.contains("volume")) {
            actVsTyp = `${anom.networkPackets.toLocaleString()} p/s vs 120 p/s`;
        } else if (r.contains("failed logins")) {
            actVsTyp = `${anom.failedLogins} logins vs 0`;
        } else if (r.contains("memory")) {
            actVsTyp = `RAM: ${anom.memory.toFixed(1)}% vs 60.0%`;
        } else if (r.contains("cpu")) {
            actVsTyp = `CPU: ${anom.cpu.toFixed(1)}% vs 35.0%`;
        }

        row.innerHTML = `
            <td>${timeStr}</td>
            <td><span class="severity-badge ${sevClass}">${sevClass}</span></td>
            <td class="font-bold cursor-pointer" onclick="filterByHost('${anom.host}')">${anom.host}</td>
            <td>${anom.reason}</td>
            <td class="font-bold">${anom.riskScore.toFixed(2)}</td>
            <td>${actVsTyp}</td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="showScanTarget('${anom.host}')"><i class="fa-solid fa-radar-shield"></i> Audit</button>
                <button class="btn btn-outline btn-sm" onclick="viewRawAnomaly(${anom.id})"><i class="fa-solid fa-code"></i> Inspect</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Populate host selection dropdown in scanner
function populateScannerHosts() {
    const select = document.getElementById('scanner-host-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="">Select an infrastructure host...</option>';

    // Extract unique hosts
    const hosts = [...new Set(state.telemetryData.map(t => t.host))].sort();
    hosts.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.innerText = h;
        select.appendChild(opt);
    });

    if (hosts.includes(currentVal)) {
        select.value = currentVal;
    }
}

// Render Incidents Manager Timeline
function renderIncidents() {
    const feed = document.getElementById('incidents-timeline-feed');
    feed.innerHTML = '';

    const active = state.incidents.filter(i => i.status !== 'RESOLVED');
    state.activeIncidents = active.length;
    document.getElementById('stat-active-incidents').innerText = state.activeIncidents;

    const resolvedCount = state.incidents.filter(i => i.status === 'RESOLVED').length;
    document.getElementById('stat-incidents-summary').innerText = `${resolvedCount} resolved automatically`;

    // Active badge alert
    const badge = document.getElementById('active-incidents-badge');
    if (state.activeIncidents > 0) {
        badge.innerText = state.activeIncidents;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }

    if (state.incidents.length === 0) {
        feed.innerHTML = '<div class="no-incidents">No security incidents detected. System is running cleanly.</div>';
        return;
    }

    state.incidents.forEach(inc => {
        const card = document.createElement('div');
        card.className = `incident-card severity-${inc.severity.toLowerCase()}`;

        const createdTime = new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const resolvedTime = inc.resolvedAt ? new Date(inc.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

        let stepsHtml = '';
        if (inc.status === 'RESOLVED') {
            stepsHtml = `
                <div class="mitigation-timeline-box">
                    <span class="mitigation-title-label">Auto Mitigation Flow</span>
                    <div class="mitigation-status-row success">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>Threat vector resolved dynamically. Core services restored. [Resolved at ${resolvedTime}]</span>
                    </div>
                </div>
            `;
        } else if (inc.status === 'MITIGATING') {
            stepsHtml = `
                <div class="mitigation-timeline-box">
                    <span class="mitigation-title-label">Auto Mitigation Flow</span>
                    <div class="mitigation-status-row running">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        <span>Asynchronous mitigation workflow executing in background...</span>
                    </div>
                </div>
            `;
        } else {
            // Active and pending manual triggers
            stepsHtml = `
                <div class="mitigation-timeline-box">
                    <span class="mitigation-title-label">Remediation Status</span>
                    <div class="mitigation-status-row" style="color: var(--alert-critical-text); border-color: rgba(203, 36, 49, 0.3)">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>Threat Active. Select 'Intrusion Scanner' or click below to force remediation.</span>
                    </div>
                    <button class="btn btn-danger btn-sm" style="margin-top: 6px; width: fit-content;" onclick="triggerMitigationRest('${inc.incidentUuid}')">
                        <i class="fa-solid fa-shield-halved"></i> Force Incident Mitigation
                    </button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="incident-header-row">
                <div class="incident-title-block">
                    <h4>${inc.description}</h4>
                    <div class="incident-meta-info">
                        <span><i class="fa-solid fa-server"></i> Host: ${inc.host}</span>
                        <span><i class="fa-regular fa-clock"></i> Inception: ${createdTime}</span>
                        ${resolvedTime ? `<span><i class="fa-solid fa-circle-check"></i> Resolved: ${resolvedTime}</span>` : ''}
                    </div>
                </div>
                <div class="incident-pills">
                    <span class="severity-badge ${inc.severity.toLowerCase()}">${inc.severity}</span>
                    <span class="incident-status-pill ${inc.status.toLowerCase()}">${inc.status}</span>
                </div>
            </div>
            <div class="incident-desc-body">
                Incident correlated from AI anomaly engine triggers. Detected metrics violation patterns on host target ${inc.host}.
            </div>
            ${stepsHtml}
        `;
        feed.appendChild(card);
    });
}

// REST call: Trigger manual mitigation
async function triggerMitigationRest(uuid) {
    try {
        appendLogEntry("mitigation-run", new Date().toLocaleTimeString(), "REST API", `Initializing manual mitigation workflow for incident: ${uuid}`);
        
        const res = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/incidents/${uuid}/mitigate`, {
            method: 'POST'
        });
        const result = await res.json();
        
        if (result.status === 'TRIGGERED') {
            appendLogEntry("mitigation-run", new Date().toLocaleTimeString(), "REST API", `Mitigation successfully started: ${result.message}`);
            // Fetch updated incidents list
            const resIncidents = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/incidents`);
            state.incidents = await resIncidents.json();
            renderIncidents();
        } else {
            appendLogEntry("anomaly", new Date().toLocaleTimeString(), "REST API", `Mitigation request ignored: ${result.message}`);
        }
    } catch (e) {
        console.error("Error triggering manual mitigation:", e);
    }
}

// ----------------------------------------------------
// Interactive System & Intrusion Scanner Logic
// ----------------------------------------------------
let scanInterval = null;
let liveScanTarget = null;

function runScannerAudit() {
    const targetSelect = document.getElementById('scanner-host-select');
    const target = targetSelect.value;
    const terminal = document.getElementById('scanner-terminal');
    const statusBadge = document.getElementById('scan-status-badge');
    const progressWrapper = document.getElementById('scan-progress-wrapper');
    const progressBar = document.getElementById('scan-progress-bar');
    const resultsSummary = document.getElementById('scan-results-summary');

    if (!target) {
        alert("Please select a target asset node first!");
        return;
    }

    // Reset view states
    resultsSummary.style.display = 'none';
    progressBar.style.width = '0%';
    progressWrapper.style.display = 'block';
    statusBadge.innerText = "SCANNING";
    statusBadge.className = "badge badge-warning";
    terminal.innerHTML = '';
    
    liveScanTarget = target;

    // Define scanning script events
    const scanSteps = [
        { msg: `Initializing secure audit stream console to host endpoint [${target}]...`, type: 'info', delay: 400 },
        { msg: `Resolving routing table records... Target IP registered in local topology cache.`, type: 'info', delay: 700 },
        { msg: `Verifying SentinelMesh agents... Handshake validated (v1.0.0, SSL active).`, type: 'success', delay: 1100 },
        { msg: `Pinging system services... Ports open: SSH (22), HTTP (8081, 8082), gRPC (9090), Redis (6379).`, type: 'info', delay: 1600 },
        { msg: `Starting Heuristic telemetry extraction... Ingesting latest resource telemetry logs...`, type: 'info', delay: 2000 },
        { msg: `Analyzing CPU, Memory, Disk and packet network flow vectors...`, type: 'info', delay: 2700 },
        { msg: `Querying active Redis tokens bucket rates for DDoS flood verification...`, type: 'info', delay: 3200 },
        { msg: `Applying Isolation Forest scoring heuristics... Model probability calculations running...`, type: 'info', delay: 4000 },
        { msg: `Correlating results with active PostgreSQL system incidents...`, type: 'info', delay: 4600 },
        { msg: `Scan sequence complete. Evaluating diagnostics final summary...`, type: 'success', delay: 5200 }
    ];

    // Trigger step-by-step logs printing
    scanSteps.forEach(step => {
        setTimeout(() => {
            printTerminalLine(step.msg, step.type);
            const progress = (step.delay / 5200) * 100;
            progressBar.style.width = `${progress}%`;
        }, step.delay);
    });

    // Final result reveal
    setTimeout(() => {
        progressWrapper.style.display = 'none';
        displayScannerVerdict(target);
    }, 5500);
}

function printTerminalLine(msg, type = 'info') {
    const terminal = document.getElementById('scanner-terminal');
    const line = document.createElement('div');
    line.className = `term-line ${type}`;
    line.innerText = msg;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

// Print metric details during active scan
function checkScannerLiveFeed(telemetry) {
    if (liveScanTarget && telemetry.host === liveScanTarget) {
        const terminal = document.getElementById('scanner-terminal');
        const badge = document.getElementById('scan-status-badge');
        if (badge.innerText === "SCANNING") {
            printTerminalLine(`[RAW METRIC INGESTED] CPU: ${telemetry.cpu.toFixed(1)}% | RAM: ${telemetry.memory.toFixed(1)}% | Packets: ${telemetry.networkPackets} p/s`, 'info');
        }
    }
}

// Compile scan diagnostics from real state
function displayScannerVerdict(host) {
    const statusBadge = document.getElementById('scan-status-badge');
    const resultsSummary = document.getElementById('scan-results-summary');
    const verdictBanner = document.getElementById('verdict-banner');
    const verdictTitle = document.getElementById('verdict-title');
    const verdictDesc = document.getElementById('verdict-desc');
    const threatActionBlock = document.getElementById('threat-action-block');

    statusBadge.innerText = "COMPLETE";
    statusBadge.className = "badge badge-success";
    resultsSummary.style.display = 'block';

    // Find host current metrics from last telemetry
    const hostTelemetry = state.telemetryData.filter(t => t.host === host);
    const latest = hostTelemetry.length > 0 ? hostTelemetry[hostTelemetry.length - 1] : { cpu: 32.1, memory: 58.4, networkPackets: 85, failedLogins: 0 };

    document.getElementById('val-scan-cpu').innerText = `${latest.cpu.toFixed(1)}%`;
    document.getElementById('val-scan-mem').innerText = `${latest.memory.toFixed(1)}%`;
    document.getElementById('val-scan-net').innerText = `${latest.networkPackets.toLocaleString()} p/s`;
    document.getElementById('val-scan-logins').innerText = latest.failedLogins;

    // Check if host has an active incident or high risk score anomaly
    const activeIncident = state.incidents.find(i => i.host === host && i.status !== 'RESOLVED');
    const hostAnomalies = state.anomalies.filter(a => a.host === host);
    const hasRecentAnom = hostAnomalies.length > 0 && (Date.now() - new Date(hostAnomalies[0].timestamp).getTime() < 60000);

    if (activeIncident) {
        // Critical intrusion alert
        verdictBanner.className = "verdict-banner danger";
        verdictTitle.innerText = "CRITICAL RESOURCE INTRUSION DETECTED";
        verdictDesc.innerText = `Active threat correlated: ${activeIncident.description}`;
        printTerminalLine(`CRITICAL: Host matches active threat signatures. Resolution workflow required.`, 'error');

        // Setup manual mitigation button
        threatActionBlock.style.display = 'block';
        document.getElementById('remediation-action-name').innerText = activeIncident.description;
        document.getElementById('remediation-action-details').innerText = `Target Host: ${host} // Current Status: ${activeIncident.status}`;
        document.getElementById('btn-trigger-remediation').setAttribute('data-incident-uuid', activeIncident.incidentUuid);

    } else if (hasRecentAnom) {
        // Warning: anomaly detected but not correlated yet
        const latestAnom = hostAnomalies[0];
        verdictBanner.className = "verdict-banner danger";
        verdictTitle.innerText = "SECURITY ANOMALY DETECTED BY AI";
        verdictDesc.innerText = `ML score: ${latestAnom.riskScore.toFixed(2)} - ${latestAnom.reason}`;
        printTerminalLine(`WARNING: AI Engine scored anomaly above threshold. Verifying system vectors...`, 'warn');
        threatActionBlock.style.display = 'none';

    } else {
        // System healthy
        verdictBanner.className = "verdict-banner";
        verdictTitle.innerText = "NODE OPERATIONS SECURE";
        verdictDesc.innerText = "Asset metrics match standard operational baselines. No threats detected.";
        printTerminalLine(`AUDIT COMPLETE: Node [${host}] verified SECURE.`, 'success');
        threatActionBlock.style.display = 'none';
    }
}

// Utility string helper for older JS support
if (!String.prototype.contains) {
    String.prototype.contains = function(str) {
        return this.indexOf(str) !== -1;
    };
}
