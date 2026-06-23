package com.aetherflow.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Data
@Entity
@Table(name = "incidents")
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ToString(exclude = "anomalies")
public class Incident {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_uuid", unique = true, nullable = false)
    private String incidentUuid;

    private String host;
    private String severity;
    private String description;
    private String status;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Builder.Default
    @OneToMany(mappedBy = "incident", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnore
    private List<Anomaly> anomalies = new ArrayList<>();
}
