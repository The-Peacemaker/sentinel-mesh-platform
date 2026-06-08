import time
import random
import requests
import sys

INGESTION_URL = "http://localhost:8081/api/v1/telemetry"

def get_random_host(region_code="us"):
    # Generate hosts like app-us-01, web-eu-04, db-ap-02
    num = random.randint(1, 4)
    return f"server-{region_code}-{num:02d}"

def send_telemetry(payload):
    try:
        response = requests.post(INGESTION_URL, json=payload, timeout=2.0)
        print(f"[{payload['host']}] Sent -> HTTP {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Error sending telemetry: {e}")

def run_simulator(mode):
    print(f"\nSimulator started in MODE: {mode}. Press Ctrl+C to stop.")
    
    memory_leak_val = 40.0
    cpu_exh_val = 30.0

    while True:
        try:
            payload = {}

            if mode == "1":
                # NORMAL TRAFFIC
                host = get_random_host(random.choice(["us", "eu", "ap"]))
                payload = {
                    "host": host,
                    "cpu": round(random.normalvariate(35, 6), 2),
                    "memory": round(random.normalvariate(50, 4), 2),
                    "disk": round(random.normalvariate(60, 2), 2),
                    "networkPackets": random.randint(500, 1200),
                    "failedLogins": random.choices([0, 1, 2], weights=[90, 8, 2])[0],
                    "requestRate": random.randint(100, 300),
                    "responseTime": round(random.normalvariate(120, 20), 2)
                }
                # Clip values to valid percentages
                payload["cpu"] = max(5.0, min(95.0, payload["cpu"]))
                payload["memory"] = max(10.0, min(95.0, payload["memory"]))
                time.sleep(1.5)

            elif mode == "2":
                # DDOS ATTACK
                # Flood a targeted app host (say server-us-01) with massive traffic
                host = "server-us-01"
                payload = {
                    "host": host,
                    "cpu": round(random.normalvariate(85, 5), 2),
                    "memory": round(random.normalvariate(78, 3), 2),
                    "disk": 64.2,
                    "networkPackets": random.randint(16000, 24000), # Rule: threshold is 15000
                    "failedLogins": 0,
                    "requestRate": random.randint(4000, 6000),
                    "responseTime": round(random.normalvariate(950, 150), 2)
                }
                payload["cpu"] = max(5.0, min(100.0, payload["cpu"]))
                time.sleep(0.5) # High frequency

            elif mode == "3":
                # BRUTE FORCE ATTACK
                # Target auth endpoint on db-ap-01 with login failures
                host = "server-ap-01"
                payload = {
                    "host": host,
                    "cpu": round(random.normalvariate(45, 5), 2),
                    "memory": round(random.normalvariate(55, 2), 2),
                    "disk": 52.8,
                    "networkPackets": random.randint(1200, 2200),
                    "failedLogins": random.randint(22, 35), # Rule: threshold is 20
                    "requestRate": random.randint(150, 400),
                    "responseTime": round(random.normalvariate(210, 40), 2)
                }
                time.sleep(1.0)

            elif mode == "4":
                # MEMORY LEAK SIMULATION
                host = "server-eu-02"
                memory_leak_val += random.uniform(1.5, 4.0)
                if memory_leak_val > 99.0:
                    memory_leak_val = 99.0
                payload = {
                    "host": host,
                    "cpu": round(random.normalvariate(40, 5), 2),
                    "memory": round(memory_leak_val, 2),
                    "disk": 72.1,
                    "networkPackets": random.randint(600, 1100),
                    "failedLogins": 0,
                    "requestRate": random.randint(120, 220),
                    "responseTime": round(random.normalvariate(150, 15), 2)
                }
                print(f"[Simulation] Memory Leak Progress on {host}: {memory_leak_val:.2f}%")
                time.sleep(2.0)

            elif mode == "5":
                # RESOURCE EXHAUSTION (CPU)
                host = "server-us-03"
                cpu_exh_val += random.uniform(5.0, 10.0)
                if cpu_exh_val > 100.0:
                    cpu_exh_val = 100.0
                payload = {
                    "host": host,
                    "cpu": round(cpu_exh_val, 2),
                    "memory": 60.5,
                    "disk": 58.4,
                    "networkPackets": random.randint(800, 1400),
                    "failedLogins": 0,
                    "requestRate": random.randint(180, 280),
                    "responseTime": round(random.normalvariate(180, 20), 2)
                }
                print(f"[Simulation] CPU Saturation Progress on {host}: {cpu_exh_val:.2f}%")
                time.sleep(2.0)
                
            else:
                print("Unknown mode. Stopping.")
                break

            send_telemetry(payload)

        except KeyboardInterrupt:
            print("\nSimulator stopped by user.")
            break

if __name__ == "__main__":
    print("==================================================")
    print("         SentinelMesh Anomaly Telemetry Simulator    ")
    print("==================================================")
    print("Select Simulation Scenario Mode:")
    print("  1 - Normal Traffic (Mixed Nodes, Stable Metrics)")
    print("  2 - Volumetric DDoS Attack (Spike in Network Packets on server-us-01)")
    print("  3 - Brute Force Authentication Abuse (Spike in Logins on server-ap-01)")
    print("  4 - System Memory Leak (Increasing RAM consumption on server-eu-02)")
    print("  5 - Resource Exhaustion (Increasing CPU workload on server-us-03)")
    print("==================================================")
    
    choice = input("Enter choice (1-5): ").strip()
    if choice in ["1", "2", "3", "4", "5"]:
        run_simulator(choice)
    else:
        print("Invalid choice. Exiting.")

