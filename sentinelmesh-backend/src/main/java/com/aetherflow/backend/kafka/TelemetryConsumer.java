package com.aetherflow.backend.kafka;

import com.aetherflow.backend.model.TelemetryEvent;
import com.aetherflow.backend.repository.TelemetryEventRepository;
import com.aetherflow.backend.service.SseBroadcaster;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class TelemetryConsumer {

    private final TelemetryEventRepository telemetryEventRepository;
    private final SseBroadcaster sseBroadcaster;
    private final ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    @KafkaListener(topics = "telemetry.raw", groupId = "aetherflow-backend-group")
    public void consumeTelemetry(String message) {
        log.debug("Consumed raw telemetry message: {}", message);
        try {
            // Parse message
            TelemetryEvent event = objectMapper.readValue(message, TelemetryEvent.class);
            
            // If timestamp is not set, set it
            if (event.getTimestamp() == null) {
                event.setTimestamp(Instant.now());
            }
            if (event.getReceivedAt() == null) {
                event.setReceivedAt(Instant.now());
            }

            // Save to Database
            TelemetryEvent savedEvent = telemetryEventRepository.save(event);

            // Broadcast to SSE clients for real-time visualization
            sseBroadcaster.broadcast("telemetry", savedEvent);

        } catch (Exception e) {
            log.error("Failed to parse/save telemetry message: {}, error: {}", message, e.getMessage());
        }
    }
}
