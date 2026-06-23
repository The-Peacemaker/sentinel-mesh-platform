package com.aetherflow.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Entity
@Table(name = "telemetry_events")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String host;
    private String region;
    private double cpu;
    private double memory;
    private double disk;
    
    @Column(name = "network_packets")
    private long networkPackets;

    @Column(name = "failed_logins")
    private int failedLogins;

    @Column(name = "request_rate")
    private long requestRate;

    @Column(name = "response_time")
    private double responseTime;

    private Instant timestamp;

    @Column(name = "received_at")
    private Instant receivedAt;
}
