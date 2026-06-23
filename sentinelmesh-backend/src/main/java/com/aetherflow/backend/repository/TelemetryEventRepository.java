package com.aetherflow.backend.repository;

import com.aetherflow.backend.model.TelemetryEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface TelemetryEventRepository extends JpaRepository<TelemetryEvent, Long> {
    List<TelemetryEvent> findTop50ByHostOrderByTimestampDesc(String host);

    @Query("SELECT e FROM TelemetryEvent e WHERE e.timestamp >= :time ORDER BY e.timestamp ASC")
    List<TelemetryEvent> findEventsSince(@Param("time") Instant time);
}
