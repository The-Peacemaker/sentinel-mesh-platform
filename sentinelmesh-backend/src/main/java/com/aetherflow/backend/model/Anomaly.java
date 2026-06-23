package com.aetherflow.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Entity
@Table(name = "anomalies")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Anomaly {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String host;

    @Column(name = "risk_score")
    private double riskScore;

    private String reason;
    private Instant timestamp;

    private double cpu;
    private double memory;

    @Column(name = "response_time")
    private double responseTime;

    @Column(name = "failed_logins")
    private int failedLogins;

    @Column(name = "network_packets")
    private long networkPackets;

    @ManyToOne
    @JoinColumn(name = "incident_id")
    private Incident incident;
}
