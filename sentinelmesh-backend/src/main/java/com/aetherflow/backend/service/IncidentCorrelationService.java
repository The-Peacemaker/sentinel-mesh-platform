package com.aetherflow.backend.service;

import com.aetherflow.backend.model.Anomaly;
import com.aetherflow.backend.model.Incident;
import com.aetherflow.backend.repository.AnomalyRepository;
import com.aetherflow.backend.repository.IncidentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class IncidentCorrelationService {

    private final IncidentRepository incidentRepository;
    private final AnomalyRepository anomalyRepository;
    private final MitigationService mitigationService;
    private final SseBroadcaster sseBroadcaster;

    @Transactional
    public Incident correlateAnomaly(Anomaly newAnomaly) {
        String host = newAnomaly.getHost();
        log.info("Correlating anomaly for host: {} (Risk: {})", host, newAnomaly.getRiskScore());

        // 1. Check if there is an active incident for this host
        Incident activeIncident = incidentRepository
                .findFirstByHostAndStatusOrderByIdDesc(host, "ACTIVE")
                .orElse(incidentRepository.findFirstByHostAndStatusOrderByIdDesc(host, "MITIGATING").orElse(null));

        if (activeIncident != null) {
            log.info("Associating anomaly with existing active incident ID: {}", activeIncident.getIncidentUuid());
            newAnomaly.setIncident(activeIncident);
            anomalyRepository.save(newAnomaly);
            
            // Re-evaluate severity
            if (newAnomaly.getRiskScore() > 0.90 && !"CRITICAL".equals(activeIncident.getSeverity())) {
                activeIncident.setSeverity("CRITICAL");
                incidentRepository.save(activeIncident);
            }
            sseBroadcaster.broadcast("incident", activeIncident);
            return null;
        }

        // 2. Fetch unassociated anomalies in the last 1 minute
        Instant cutoff = Instant.now().minusSeconds(60);
        List<Anomaly> unassociated = anomalyRepository.findByHostAndIncidentIsNullAndTimestampAfter(host, cutoff);
        
        // Add the current anomaly to the list
        unassociated.add(newAnomaly);

        log.info("Found {} unassociated anomalies for host {} in the last 60 seconds", unassociated.size(), host);

        if (unassociated.size() >= 2) {
            log.warn("Anomaly threshold reached! Creating a new Correlated Incident for host: {}", host);
            
            // Determine severity & description
            double maxRisk = unassociated.stream().mapToDouble(Anomaly::getRiskScore).max().orElse(0.0);
            boolean isBruteForce = unassociated.stream().anyMatch(a -> a.getReason().toLowerCase().contains("login") || a.getReason().toLowerCase().contains("auth"));
            boolean isDdos = unassociated.stream().anyMatch(a -> a.getReason().toLowerCase().contains("ddos") || a.getReason().toLowerCase().contains("network"));
            
            String severity = "MEDIUM";
            String description = "Unusual activity detected on host " + host;

            if (maxRisk > 0.90) {
                severity = "CRITICAL";
            } else if (maxRisk > 0.75) {
                severity = "HIGH";
            }

            if (isBruteForce) {
                description = "Brute Force Authentication Abuse Incident on host " + host;
            } else if (isDdos) {
                description = "Volumetric DDoS Traffic Spike Incident on host " + host;
            } else if (unassociated.stream().anyMatch(a -> a.getReason().toLowerCase().contains("leak") || a.getReason().toLowerCase().contains("ram"))) {
                description = "System Memory Saturation Incident on host " + host;
            } else if (unassociated.stream().anyMatch(a -> a.getReason().toLowerCase().contains("cpu") || a.getReason().toLowerCase().contains("exhaust"))) {
                description = "Resource Exhaustion (CPU Saturation) Incident on host " + host;
            }

            Incident incident = Incident.builder()
                    .incidentUuid(UUID.randomUUID().toString())
                    .host(host)
                    .severity(severity)
                    .description(description)
                    .status("ACTIVE")
                    .createdAt(Instant.now())
                    .build();

            Incident savedIncident = incidentRepository.save(incident);

            // Associate anomalies
            for (Anomaly anomaly : unassociated) {
                anomaly.setIncident(savedIncident);
                anomalyRepository.save(anomaly);
            }

            sseBroadcaster.broadcast("incident", savedIncident);
            return savedIncident;
        } else {
            // Keep anomaly unassociated, just save it
            anomalyRepository.save(newAnomaly);
            return null;
        }
    }
}
