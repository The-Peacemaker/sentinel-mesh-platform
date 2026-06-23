package com.aetherflow.backend.grpc;

import io.grpc.Server;
import io.grpc.ServerBuilder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class GrpcServerRunner implements CommandLineRunner {

    private final AnomalyGrpcService anomalyGrpcService;
    private Server server;

    @Override
    public void run(String... args) throws Exception {
        int port = 9090;
        log.info("Starting gRPC Server on port {}...", port);

        server = ServerBuilder.forPort(port)
                .addService(anomalyGrpcService)
                .build();

        server.start();
        log.info("gRPC Server started successfully on port {}", port);

        // Keep server running in a separate daemon thread
        Thread grpcThread = new Thread(() -> {
            try {
                server.awaitTermination();
            } catch (InterruptedException e) {
                log.warn("gRPC Server execution interrupted: {}", e.getMessage());
                Thread.currentThread().interrupt();
            }
        });
        grpcThread.setDaemon(true);
        grpcThread.start();

        // Register JVM shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("Shutting down gRPC Server...");
            if (server != null) {
                server.shutdown();
                log.info("gRPC Server shut down.");
            }
        }));
    }
}
