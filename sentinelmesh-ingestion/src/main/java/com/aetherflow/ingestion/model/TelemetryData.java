package com.aetherflow.ingestion.model;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryData {
    @NotBlank(message = "Host identifier is required")
    private String host;

    private String timestamp; // ISO 8601 string or epoch mills
    
    @Min(value = 0, message = "CPU usage cannot be negative")
    @Max(value = 100, message = "CPU usage cannot exceed 100%")
    private double cpu;

    @Min(value = 0, message = "Memory usage cannot be negative")
    @Max(value = 100, message = "Memory usage cannot exceed 100%")
    private double memory;

    @Min(value = 0, message = "Disk usage cannot be negative")
    @Max(value = 100, message = "Disk usage cannot exceed 100%")
    private double disk;

    private long networkPackets;
    private int failedLogins;
    private long requestRate;
    private double responseTime;

    // Enriched fields injected by Ingestion Service
    private String region;
    private long receivedAt;
}
