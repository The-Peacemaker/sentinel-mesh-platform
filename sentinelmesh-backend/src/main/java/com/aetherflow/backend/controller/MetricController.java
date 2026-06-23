package com.aetherflow.backend.controller;

import com.aetherflow.backend.model.Anomaly;
import com.aetherflow.backend.model.Incident;
import com.aetherflow.backend.model.MitigationAction;
import com.aetherflow.backend.model.TelemetryEvent;
import com.aetherflow.backend.repository.AnomalyRepository;
import com.aetherflow.backend.repository.IncidentRepository;
import com.aetherflow.backend.repository.MitigationActionRepository;
import com.aetherflow.backend.repository.TelemetryEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/v1/metrics")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class MetricController {

    private final TelemetryEventRepository telemetryEventRepository;
    private final AnomalyRepository anomalyRepository;
    private final IncidentRepository incidentRepository;
    private final MitigationActionRepository mitigationActionRepository;
    private final com.aetherflow.backend.service.MitigationService mitigationService;

    @PostMapping("/incidents/{uuid}/mitigate")
    public Map<String, Object> triggerMitigation(@PathVariable String uuid) {
        log.info("REST trigger mitigation for incident: {}", uuid);
        Map<String, Object> response = new HashMap<>();
        Incident incident = incidentRepository.findByIncidentUuid(uuid).orElse(null);
        if (incident == null) {
            response.put("status", "ERROR");
            response.put("message", "Incident not found");
            return response;
        }
        if ("RESOLVED".equals(incident.getStatus()) || "MITIGATING".equals(incident.getStatus())) {
            response.put("status", "IGNORED");
            response.put("message", "Incident is already in status " + incident.getStatus());
            return response;
        }
        mitigationService.triggerMitigation(incident);
        response.put("status", "TRIGGERED");
        response.put("message", "Mitigation workflow asynchronously triggered");
        return response;
    }

    @GetMapping("/recent-telemetry")
    public List<TelemetryEvent> getRecentTelemetry() {
        // Return events in the last 15 minutes, or top 100 if database is small
        Instant cutoff = Instant.now().minusSeconds(900);
        List<TelemetryEvent> events = telemetryEventRepository.findEventsSince(cutoff);
        if (events.isEmpty()) {
            return telemetryEventRepository.findAll();
        }
        return events;
    }

    @GetMapping("/incidents")
    public List<Incident> getRecentIncidents() {
        return incidentRepository.findTop50ByOrderByIdDesc();
    }

    @GetMapping("/anomalies")
    public List<Anomaly> getRecentAnomalies() {
        return anomalyRepository.findTop50ByOrderByTimestampDesc();
    }

    @GetMapping("/mitigations")
    public List<MitigationAction> getRecentMitigations() {
        return mitigationActionRepository.findTop50ByOrderByExecutedAtDesc();
    }

    @GetMapping("/host-health")
    public List<Map<String, Object>> getHostHealth() {
        // Get all telemetry events, group by host, and calculate latest average metrics
        List<TelemetryEvent> allEvents = telemetryEventRepository.findAll();
        Map<String, List<TelemetryEvent>> grouped = allEvents.stream()
                .collect(Collectors.groupingBy(TelemetryEvent::getHost));

        return grouped.entrySet().stream().map(entry -> {
            String host = entry.getKey();
            List<TelemetryEvent> hostEvents = entry.getValue();

            double avgCpu = hostEvents.stream().mapToDouble(TelemetryEvent::getCpu).average().orElse(0.0);
            double avgMem = hostEvents.stream().mapToDouble(TelemetryEvent::getMemory).average().orElse(0.0);
            double avgResp = hostEvents.stream().mapToDouble(TelemetryEvent::getResponseTime).average().orElse(0.0);
            long totalLogins = hostEvents.stream().mapToLong(TelemetryEvent::getFailedLogins).sum();

            // Determine host health state based on recent incidents
            boolean hasActiveIncident = incidentRepository.findFirstByHostAndStatusOrderByIdDesc(host, "ACTIVE").isPresent();
            boolean hasMitigatingIncident = incidentRepository.findFirstByHostAndStatusOrderByIdDesc(host, "MITIGATING").isPresent();

            String status = "HEALTHY";
            if (hasActiveIncident) {
                status = "CRITICAL";
            } else if (hasMitigatingIncident) {
                status = "WARNING";
            }

            Map<String, Object> stats = new HashMap<>();
            stats.put("host", host);
            stats.put("avgCpu", avgCpu);
            stats.put("avgMemory", avgMem);
            stats.put("avgResponseTime", avgResp);
            stats.put("totalFailedLogins", totalLogins);
            stats.put("status", status);
            return stats;
        }).collect(Collectors.toList());
    }
}
