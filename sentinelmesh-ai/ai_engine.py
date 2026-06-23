import json
import time
import os
import pickle
import numpy as np
import grpc
from kafka import KafkaConsumer

# Import generated gRPC stubs
import telemetry_pb2
import telemetry_pb2_grpc

KAFKA_BROKER = "localhost:9092"
KAFKA_TOPIC = "telemetry.raw"
BACKEND_GRPC_SERVER = "localhost:9090"
MODEL_PATH = "isolation_forest.pkl"
ANOMALY_THRESHOLD = 0.70

def load_ml_model():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"ML model file not found at '{MODEL_PATH}'. Run train_model.py first.")
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)

def run_ai_engine():
    print("--------------------------------------------------")
    print("         SentinelMesh AI Anomaly Engine Starting     ")
    print("--------------------------------------------------")

    # 1. Load ML Model
    try:
        clf = load_ml_model()
        print(f"Loaded ML model: {clf}")
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    # 2. Establish gRPC Channel
    print(f"Connecting to Backend gRPC server at {BACKEND_GRPC_SERVER}...")
    channel = grpc.insecure_channel(BACKEND_GRPC_SERVER)
    grpc_stub = telemetry_pb2_grpc.AnomalyServiceStub(channel)

    # 3. Establish Kafka Consumer Connection
    print(f"Subscribing to Kafka topic '{KAFKA_TOPIC}' on {KAFKA_BROKER}...")
    consumer = None
    retries = 5
    while retries > 0:
        try:
            consumer = KafkaConsumer(
                KAFKA_TOPIC,
                bootstrap_servers=[KAFKA_BROKER],
                value_deserializer=lambda m: json.loads(m.decode('utf-8')),
                auto_offset_reset='latest'
            )
            print("Successfully connected to Kafka!")
            break
        except Exception as e:
            print(f"Failed to connect to Kafka, retrying in 5s... ({retries} left). Error: {e}")
            retries -= 1
            time.sleep(5)

    if not consumer:
        print("Could not connect to Kafka. Exiting.")
        return

    print("AI Anomaly Engine is running and listening for streams...")
    print("--------------------------------------------------")

    # 4. Main Event Processing Loop
    for message in consumer:
        try:
            data = message.value
            host = data.get("host")
            cpu = data.get("cpu", 0.0)
            memory = data.get("memory", 0.0)
            disk = data.get("disk", 0.0)
            network_packets = data.get("networkPackets", 0)
            failed_logins = data.get("failedLogins", 0)
            request_rate = data.get("requestRate", 0)
            response_time = data.get("responseTime", 0.0)
            timestamp_str = data.get("timestamp")
            received_at = data.get("receivedAt", int(time.time() * 1000))

            # Feature vector: [cpu, memory, response_time, network_packets, failed_logins]
            features = np.array([[cpu, memory, response_time, network_packets, failed_logins]])

            # Unsupervised anomaly prediction: 1 = normal, -1 = anomalous
            prediction = clf.predict(features)[0]
            decision_score = clf.decision_function(features)[0]

            # Map decision score to risk score (0.0 to 1.0)
            # Isolation forest decision score is negative for anomalies.
            # Normal scores are around 0.1 to 0.25. Anomalies are < 0.
            risk_score = 0.0
            if prediction == -1:
                # Simple linear mapping: from decision score [-0.5, 0.0] to [1.0, 0.5]
                risk_score = min(1.0, max(0.5, 0.5 + (-decision_score * 4)))
            else:
                # Normal events have small positive scores, map to 0.0 - 0.35 risk
                risk_score = min(0.35, max(0.0, 0.20 - decision_score))

            # Apply pattern correlation rules (expert system overrides)
            reason = "Anomaly detected by Isolation Forest model"
            rule_triggered = False

            if failed_logins >= 20:
                risk_score = max(risk_score, 0.90)
                reason = f"Security Rule: High auth failures detected ({failed_logins} failed logins)"
                rule_triggered = True
            elif network_packets >= 15000:
                risk_score = max(risk_score, 0.95)
                reason = f"Security Rule: Volume spike detected ({network_packets} packets/s)"
                rule_triggered = True
            elif cpu >= 90 and memory >= 90:
                risk_score = max(risk_score, 0.88)
                reason = f"Resource Rule: Multi-resource saturation (CPU: {cpu}%, RAM: {memory}%)"
                rule_triggered = True
            elif memory >= 92:
                risk_score = max(risk_score, 0.78)
                reason = f"Performance Rule: High memory leak pattern (RAM: {memory}%)"
                rule_triggered = True

            # If risk is above threshold, execute mitigation warning via gRPC alert
            is_anomaly = risk_score >= ANOMALY_THRESHOLD or rule_triggered
            print(f"[Host: {host}] - ML Prediction: {'ANOMALY' if prediction == -1 else 'NORMAL'}, Risk Score: {risk_score:.2f}, Reason: {reason}")

            if is_anomaly:
                print(f"[ALERT] Flagged Anomaly! Initiating gRPC Incident Alert to {BACKEND_GRPC_SERVER}...")
                try:
                    request = telemetry_pb2.AnomalyRequest(
                        host=host,
                        riskScore=risk_score,
                        reason=reason,
                        eventTimestamp=received_at,
                        cpu=cpu,
                        memory=memory,
                        responseTime=response_time,
                        failedLogins=failed_logins,
                        networkPackets=network_packets
                    )
                    response = grpc_stub.ReportAnomaly(request, timeout=3.0)
                    print(f"[SUCCESS] Alert Received by Backend. Status: {response.status}, Action: {response.mitigationAction}")
                except grpc.RpcError as e:
                    print(f"[ERROR] Failed to send gRPC alert: {e.code()} - {e.details()}")

        except Exception as e:
            print(f"Error processing telemetry event: {e}")

if __name__ == "__main__":
    run_ai_engine()
