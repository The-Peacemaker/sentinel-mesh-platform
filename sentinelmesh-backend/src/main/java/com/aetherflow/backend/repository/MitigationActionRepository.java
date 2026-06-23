package com.aetherflow.backend.repository;

import com.aetherflow.backend.model.MitigationAction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MitigationActionRepository extends JpaRepository<MitigationAction, Long> {
    List<MitigationAction> findByIncidentId(Long incidentId);
    List<MitigationAction> findTop50ByOrderByExecutedAtDesc();
}
