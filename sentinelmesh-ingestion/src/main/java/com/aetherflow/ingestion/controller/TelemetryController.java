package com.aetherflow.ingestion.controller;

import com.aetherflow.ingestion.kafka.TelemetryProducer;
import com.aetherflow.ingestion.model.TelemetryData;
import com.aetherflow.ingestion.service.RateLimiterService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@Slf4j
@RestController
@RequestMapping("/api/v1/telemetry")
@RequiredArgsConstructor
public class TelemetryController {

    private final TelemetryProducer telemetryProducer;
    private final RateLimiterService rateLimiterService;

    @PostMapping
    public ResponseEntity<String> ingestTelemetry(@Valid @RequestBody TelemetryData data) {
        String host = data.getHost();

        // 1. Rate Limiting Check
        if (!rateLimiterService.isAllowed(host)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body("Rate limit exceeded for host: " + host);
        }

        // 2. Data Enrichment
        data.setReceivedAt(Instant.now().toEpochMilli());
        if (data.getTimestamp() == null || data.getTimestamp().isEmpty()) {
            data.setTimestamp(Instant.now().toString());
        }
        
        // Simple heuristic for region enrichment
        if (host.contains("us-")) {
            data.setRegion("us-east-1");
        } else if (host.contains("eu-")) {
            data.setRegion("eu-central-1");
        } else {
            data.setRegion("ap-south-1");
        }

        // 3. Publish to Kafka raw topic
        telemetryProducer.sendTelemetry(data);

        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body("Telemetry accepted for host: " + host);
    }
}
