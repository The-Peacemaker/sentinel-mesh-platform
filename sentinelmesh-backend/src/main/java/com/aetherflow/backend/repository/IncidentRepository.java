package com.aetherflow.backend.repository;

import com.aetherflow.backend.model.Incident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface IncidentRepository extends JpaRepository<Incident, Long> {
    Optional<Incident> findFirstByHostAndStatusOrderByIdDesc(String host, String status);
    List<Incident> findTop50ByOrderByIdDesc();
    Optional<Incident> findByIncidentUuid(String incidentUuid);
}
