package com.aetherflow.backend.grpc;

import com.aetherflow.backend.model.Anomaly;
import com.aetherflow.backend.model.Incident;
import com.aetherflow.backend.service.IncidentCorrelationService;
import com.aetherflow.backend.service.MitigationService;
import com.aetherflow.backend.service.SseBroadcaster;
import io.grpc.stub.StreamObserver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnomalyGrpcService extends AnomalyServiceGrpc.AnomalyServiceImplBase {

    private final IncidentCorrelationService incidentCorrelationService;
    private final MitigationService mitigationService;
    private final SseBroadcaster sseBroadcaster;

    @Override
    public void reportAnomaly(AnomalyRequest request, StreamObserver<AnomalyResponse> responseObserver) {
        log.info("gRPC received Anomaly Alert from AI Engine for host: {}", request.getHost());

        try {
            // Convert protobuf request to JPA Entity
            Anomaly anomaly = Anomaly.builder()
                    .host(request.getHost())
                    .riskScore(request.getRiskScore())
                    .reason(request.getReason())
                    .timestamp(Instant.ofEpochMilli(request.getEventTimestamp()))
                    .cpu(request.getCpu())
                    .memory(request.getMemory())
                    .responseTime(request.getResponseTime())
                    .failedLogins(request.getFailedLogins())
                    .networkPackets(request.getNetworkPackets())
                    .build();

            // Broadast the raw anomaly immediately
            sseBroadcaster.broadcast("anomaly", anomaly);

            // Send to correlation engine
            Incident incident = incidentCorrelationService.correlateAnomaly(anomaly);
            if (incident != null) {
                mitigationService.triggerMitigation(incident);
            }

            // Construct response
            AnomalyResponse response = AnomalyResponse.newBuilder()
                    .setStatus("ACCEPTED")
                    .setMitigationAction("Correlating incident...")
                    .build();

            responseObserver.onNext(response);
            responseObserver.onCompleted();

        } catch (Exception e) {
            log.error("Error processing gRPC anomaly report: {}", e.getMessage(), e);
            responseObserver.onError(io.grpc.Status.INTERNAL
                     .withDescription("Internal server error: " + e.getMessage())
                     .asRuntimeException());
        }
    }
}
