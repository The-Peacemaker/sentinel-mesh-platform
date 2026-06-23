// App State and Config
const CONFIG = {
    backendUrl: window.location.origin,
    maxChartPoints: 20
};

let telemetryChart = null;
let riskChart = null;

let state = {
    totalEvents: 0,
    anomaliesCount: 0,
    activeIncidents: 0,
    resolvedIncidentsCount: 0,
    hosts: {},
    recentTelemetry: [],
    incidents: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabs();
    initCharts();
    fetchInitialData();
    connectSseStream();
    
    document.getElementById('clear-logs').addEventListener('click', () => {
        const feed = document.getElementById('live-logs-feed');
        feed.innerHTML = '<div class="log-placeholder">Waiting for telemetry stream...</div>';
    });
});

// Real-Time Clock Utility
function initClock() {
    const clockEl = document.getElementById('clock');
    const updateTime = () => {
        const now = new Date();
        clockEl.innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toISOString().replace('T', ' ').substring(0, 19)} UTC`;
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Navigation Tab Router
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

            // Header titles update
            const titles = {
                dashboard: { main: "System Dashboard", sub: "Real-time ML-driven telemetry overview" },
                hosts: { main: "Infrastructure Topology", sub: "Visual host health map and capacity tracking" },
                incidents: { main: "Incident Control Center", sub: "Correlated alert timeline and auto-mitigation workflows" },
                simulator: { main: "Telemetry Workload Simulator", sub: "Inject custom infrastructure profiles and trigger security scripts" }
            };
            
            document.getElementById('tab-title').innerText = titles[tabId].main;
            document.getElementById('tab-subtitle').innerText = titles[tabId].sub;

            if (tabId === 'hosts') {
                refreshHostsView();
            }
        });
    });
}

// Initialize ChartJS canvases
function initCharts() {
    // 1. Telemetry Chart (CPU & Memory)
    const telCtx = document.getElementById('telemetryChart').getContext('2d');
    telemetryChart = new Chart(telCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CPU Usage (%)',
                    borderColor: '#8257e5',
                    backgroundColor: 'rgba(130, 87, 229, 0.1)',
                    borderWidth: 2,
                    data: [],
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Memory Usage (%)',
                    borderColor: '#0070f3',
                    backgroundColor: 'rgba(0, 112, 243, 0.1)',
                    borderWidth: 2,
                    data: [],
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 100, grid: { color: '#1d2138' }, ticks: { color: '#8c93a9' } },
                x: { grid: { color: '#1d2138' }, ticks: { color: '#8c93a9', maxRotation: 0 } }
            }
        }
    });

    // 2. Risk Level Chart
    const riskCtx = document.getElementById('riskChart').getContext('2d');
    riskChart = new Chart(riskCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Risk Score',
                backgroundColor: 'rgba(255, 23, 68, 0.5)',
                borderColor: '#ff1744',
                borderWidth: 1,
                data: []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0.0, max: 1.0, grid: { color: '#1d2138' }, ticks: { color: '#8c93a9' } },
                x: { grid: { color: '#1d2138' }, ticks: { color: '#8c93a9' } }
            }
        }
    });
}

// Fetch Initial Metrics
async function fetchInitialData() {
    try {
        // 1. Fetch recent telemetry to pre-populate charts
        const resTelemetry = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/recent-telemetry`);
        const telData = await resTelemetry.json();
        
        state.totalEvents = telData.length;
        document.getElementById('stat-total-events').innerText = state.totalEvents;

        // Feed charts (take last 20 events)
        const lastEvents = telData.slice(-CONFIG.maxChartPoints);
        lastEvents.forEach(e => {
            const timeLabel = new Date(e.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            addChartData(telemetryChart, timeLabel, [e.cpu, e.memory]);
        });

        // 2. Fetch incidents
        const resIncidents = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/incidents`);
        state.incidents = await resIncidents.json();
        renderIncidents();

        // 3. Fetch anomalies to get stats count
        const resAnomalies = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/anomalies`);
        const anomalies = await resAnomalies.json();
        state.anomaliesCount = anomalies.length;
        document.getElementById('stat-anomalies').innerText = state.anomaliesCount;

        // Feed Risk Chart
        const lastAnomalies = anomalies.slice(-6).reverse();
        lastAnomalies.forEach(a => {
            const label = a.host;
            addBarChartData(riskChart, label, a.riskScore);
        });

        // 4. Fetch host health to generate topology grid
        refreshHostsView();
    } catch (e) {
        console.error("Error fetching initial metric state:", e);
    }
}

// Render Hosts grid on map tab
async function refreshHostsView() {
    try {
        const res = await fetch(`${CONFIG.backendUrl}/api/v1/metrics/host-health`);
        const hostsList = await res.json();
        const container = document.getElementById('hosts-container');
        container.innerHTML = '';

        if (hostsList.length === 0) {
            container.innerHTML = '<div class="no-incidents">No hosts reporting telemetry. Start the simulator.</div>';
            return;
        }

        hostsList.forEach(h => {
            const card = document.createElement('div');
            card.className = `host-card status-${h.status.toLowerCase()}`;

            card.innerHTML = `
                <div class="host-card-header">
                    <span class="host-name"><i class="fa-solid fa-server"></i> ${h.host}</span>
                    <span class="host-status-badge">${h.status}</span>
                </div>
                <div class="host-metrics">
                    <div class="metric-bar-group">
                        <div class="metric-bar-header">
                            <span>CPU Avg</span>
                            <span>${h.avgCpu.toFixed(1)}%</span>
                        </div>
                        <div class="metric-bar-bg">
                            <div class="metric-bar-fill" style="width: ${h.avgCpu}%"></div>
                        </div>
                    </div>
                    <div class="metric-bar-group">
                        <div class="metric-bar-header">
                            <span>Memory Avg</span>
                            <span>${h.avgMemory.toFixed(1)}%</span>
                        </div>
                        <div class="metric-bar-bg">
                            <div class="metric-bar-fill mem" style="width: ${h.avgMemory}%"></div>
                        </div>
                    </div>
                </div>
                <div class="host-metadata">
                    <span>Response Time: ${h.avgResponseTime.toFixed(0)} ms</span>
                    <span>Fail Logins: ${h.totalFailedLogins}</span>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error("Error building hosts view:", e);
    }
}

// Render incident timeline elements
function renderIncidents() {
    const feed = document.getElementById('incidents-timeline-feed');
    feed.innerHTML = '';

    const active = state.incidents.filter(i => i.status !== 'RESOLVED');
    state.activeIncidents = active.length;
    document.getElementById('stat-active-incidents').innerText = state.activeIncidents;

    const resolvedCount = state.incidents.filter(i => i.status === 'RESOLVED').length;
    document.getElementById('stat-incidents-summary').innerText = `${resolvedCount} resolved automatically`;

    // Sidebar badge logic
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
                <div class="mitigation-steps">
                    <span class="mitigation-step-header">Automated Response Actions</span>
                    <div class="mitigation-step-row">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>Auto-remediation successful. Host restored to healthy state at ${resolvedTime}.</span>
                    </div>
                </div>
            `;
        } else if (inc.status === 'MITIGATING') {
            stepsHtml = `
                <div class="mitigation-steps">
                    <span class="mitigation-step-header">Automated Response Actions</span>
                    <div class="mitigation-step-row" style="color: var(--neon-orange); background: rgba(255,145,0,0.02); border-color: rgba(255,145,0,0.2)">
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        <span>Mitigation script executing in background...</span>
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="incident-header">
                <div class="incident-title">
                    <h4>${inc.description}</h4>
                    <div class="incident-meta">
                        <span><i class="fa-solid fa-server"></i> Target: ${inc.host}</span>
                        <span><i class="fa-regular fa-clock"></i> Opened: ${createdTime}</span>
                        ${resolvedTime ? `<span><i class="fa-solid fa-check-double"></i> Resolved: ${resolvedTime}</span>` : ''}
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="severity-pill">${inc.severity}</span>
                    <span class="incident-status-pill ${inc.status.toLowerCase()}">${inc.status}</span>
                </div>
            </div>
            ${stepsHtml}
        `;
        feed.appendChild(card);
    });
}

// Establish Server-Sent Events stream connection to Backend
function connectSseStream() {
    const streamIndicator = document.getElementById('stream-indicator');
    const streamText = document.getElementById('stream-text');

    console.log("Opening SSE Stream to:", `${CONFIG.backendUrl}/api/v1/events`);
    const sse = new EventSource(`${CONFIG.backendUrl}/api/v1/events`);

    sse.onopen = () => {
        streamIndicator.className = 'status-indicator online';
        streamText.innerText = 'Live Engine Online';
        console.log("SSE Stream connected successfully!");
    };

    sse.onerror = (e) => {
        streamIndicator.className = 'status-indicator offline';
        streamText.innerText = 'Engine Reconnecting...';
        console.log("SSE connection error, retrying...", e);
    };

    // Live Telemetry Event
    sse.addEventListener('telemetry', (e) => {
        const data = JSON.parse(e.data);
        state.totalEvents++;
        document.getElementById('stat-total-events').innerText = state.totalEvents;

        const timeLabel = new Date(data.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        addChartData(telemetryChart, timeLabel, [data.cpu, data.memory]);

        appendLogEntry("telemetry", timeLabel, data.host, `CPU: ${data.cpu.toFixed(1)}% | RAM: ${data.memory.toFixed(1)}% | Net: ${data.networkPackets} p/s | Fail Logins: ${data.failedLogins}`);
    });

    // Anomaly Alert Event
    sse.addEventListener('anomaly', (e) => {
        const data = JSON.parse(e.data);
        state.anomaliesCount++;
        document.getElementById('stat-anomalies').innerText = state.anomaliesCount;

        const timeLabel = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        appendLogEntry("anomaly", timeLabel, data.host, `🔥 ANOMALY FLAG: Risk Score ${data.riskScore.toFixed(2)} - ${data.reason}`);

        // Update Risk Chart
        addBarChartData(riskChart, data.host, data.riskScore);
    });

    // Incident Correlation Event
    sse.addEventListener('incident', (e) => {
        const data = JSON.parse(e.data);
        console.log("Incident alert:", data);

        const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        appendLogEntry("incident-alert", timeLabel, data.host, `🚨 INCIDENT CREATED: Status changed to ${data.status} (${data.description})`);

        // Check if incident exists in state to replace it, or add new
        const index = state.incidents.findIndex(i => i.incidentUuid === data.incidentUuid);
        if (index > -1) {
            state.incidents[index] = data;
        } else {
            state.incidents.unshift(data);
        }

        renderIncidents();
        refreshHostsView();
    });

    // Mitigation Trigger Event
    sse.addEventListener('mitigation', (e) => {
        const data = JSON.parse(e.data);
        console.log("Mitigation action:", data);

        const timeLabel = new Date(data.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        appendLogEntry("mitigation-run", timeLabel, `System`, `⚡ AUTONOMOUS MITIGATION TRIGGERED: ${data.actionType} - ${data.details}`);
        
        // Refresh incidents since mitigation changes incident status
        fetch(`${CONFIG.backendUrl}/api/v1/metrics/incidents`)
            .then(res => res.json())
            .then(data => {
                state.incidents = data;
                renderIncidents();
                refreshHostsView();
            });
    });
}

// Chart Helpers
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

function addBarChartData(chart, label, score) {
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(score);

    if (chart.data.labels.length > 6) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.update();
}

// Append rows in console logs window
function appendLogEntry(type, time, host, message) {
    const feed = document.getElementById('live-logs-feed');
    
    // Remove placeholder
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

    // Limit log rows to 100
    if (feed.children.length > 100) {
        feed.removeChild(feed.lastChild);
    }
}
