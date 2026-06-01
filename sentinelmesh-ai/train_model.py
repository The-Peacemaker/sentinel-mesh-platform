import numpy as np
from sklearn.ensemble import IsolationForest
import pickle
import os

def train_and_save_model():
    print("Generating simulated normal telemetry training data...")
    np.random.seed(42)
    n_samples = 1000

    # Normal profiles:
    # CPU (20% to 50%)
    cpu = np.random.normal(35, 8, n_samples)
    cpu = np.clip(cpu, 5, 80)

    # Memory (40% to 65%)
    memory = np.random.normal(50, 5, n_samples)
    memory = np.clip(memory, 20, 85)

    # Response Time (50ms to 200ms)
    response_time = np.random.normal(120, 30, n_samples)
    response_time = np.clip(response_time, 20, 450)

    # Network Packets (200 to 1200 packets/sec)
    network_packets = np.random.normal(700, 150, n_samples)
    network_packets = np.clip(network_packets, 100, 2000)

    # Failed Logins (0 to 3 failed attempts)
    failed_logins = np.random.poisson(0.5, n_samples)

    # Combine into feature matrix: shape (1000, 5)
    X_train = np.column_stack((cpu, memory, response_time, network_packets, failed_logins))

    print(f"Features: CPU, Memory, Response Time, Network Packets, Failed Logins. Training shape: {X_train.shape}")

    # Train Isolation Forest (contamination = 0.02 means we estimate ~2% noise/anomaly in normal environment)
    clf = IsolationForest(contamination=0.02, random_state=42)
    clf.fit(X_train)

    model_path = "isolation_forest.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(clf, f)

    print(f"Isolation Forest model trained successfully and serialized to '{os.path.abspath(model_path)}'!")

if __name__ == "__main__":
    train_and_save_model()

