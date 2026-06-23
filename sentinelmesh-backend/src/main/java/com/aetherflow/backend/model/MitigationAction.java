package com.aetherflow.backend.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Entity
@Table(name = "mitigation_actions")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MitigationAction {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_id")
    private Long incidentId;

    @Column(name = "action_type")
    private String actionType;

    @Column(name = "executed_at")
    private Instant executedAt;

    private String result;
    private String details;
}
