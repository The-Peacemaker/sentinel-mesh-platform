package com.aetherflow.backend.service;

import com.aetherflow.backend.model.Incident;
import com.aetherflow.backend.model.MitigationAction;
import com.aetherflow.backend.repository.IncidentRepository;
import com.aetherflow.backend.repository.MitigationActionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@EnableAsync
@RequiredArgsConstructor
public class MitigationService {

    private final IncidentRepository incidentRepository;
    private final MitigationActionRepository mitigationActionRepository;
    private final SseBroadcaster sseBroadcaster;

    @Async
    public CompletableFuture<Void> triggerMitigation(Incident incident) {
        log.info("Triggering mitigation workflow for incident UUID: {}", incident.getIncidentUuid());

        // Update incident status to MITIGATING
        incident.setStatus("MITIGATING");
        incidentRepository.save(incident);
        sseBroadcaster.broadcast("incident", incident);

        // Sleep to simulate processing time
        try {
            Thread.sleep(6000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        // Determine action based on description
        String actionType = "MOCK_RESTART_SERVICES";
        String details = "Gracefully restarted failed services on host " + incident.getHost();

        String desc = incident.getDescription().toLowerCase();
        if (desc.contains("brute force") || desc.contains("auth")) {
            actionType = "MOCK_BLOCK_IP";
            details = "Added firewall rule blocking source IP address attacking host " + incident.getHost();
        } else if (desc.contains("ddos") || desc.contains("network")) {
            actionType = "MOCK_RATE_LIMIT_IP";
            details = "Enabled edge rate limiter to throttle incoming connection floods to " + incident.getHost();
        } else if (desc.contains("memory") || desc.contains("leak") || desc.contains("cpu") || desc.contains("saturation")) {
            actionType = "MOCK_SCALE_UP";
            details = "Triggered auto-scaling group; provisioned redundant node for host " + incident.getHost();
        }

        MitigationAction action = MitigationAction.builder()
                .incidentId(incident.getId())
                .actionType(actionType)
                .executedAt(Instant.now())
                .result("SUCCESS")
                .details(details)
                .build();

        mitigationActionRepository.save(action);
        sseBroadcaster.broadcast("mitigation", action);

        // Resolve incident
        incident.setStatus("RESOLVED");
        incident.setResolvedAt(Instant.now());
        incidentRepository.save(incident);
        sseBroadcaster.broadcast("incident", incident);

        log.info("Mitigation successfully executed and incident resolved for: {}", incident.getIncidentUuid());
        return CompletableFuture.completedFuture(null);
    }
}
