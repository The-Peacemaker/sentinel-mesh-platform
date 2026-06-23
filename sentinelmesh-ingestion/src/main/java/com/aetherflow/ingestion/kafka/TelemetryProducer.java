package com.aetherflow.ingestion.kafka;

import com.aetherflow.ingestion.model.TelemetryData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class TelemetryProducer {

    private static final String TOPIC = "telemetry.raw";
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public void sendTelemetry(TelemetryData data) {
        log.info("Publishing raw telemetry for host: {}", data.getHost());
        kafkaTemplate.send(TOPIC, data.getHost(), data);
    }
}
