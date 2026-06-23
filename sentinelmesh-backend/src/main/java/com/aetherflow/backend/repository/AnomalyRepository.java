package com.aetherflow.backend.repository;

import com.aetherflow.backend.model.Anomaly;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AnomalyRepository extends JpaRepository<Anomaly, Long> {
    List<Anomaly> findByHostAndIncidentIsNullAndTimestampAfter(String host, Instant timestamp);
    List<Anomaly> findTop50ByOrderByTimestampDesc();
}
