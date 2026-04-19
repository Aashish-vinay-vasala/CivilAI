import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import random
import mlflow
from datetime import datetime

try:
    from torch_geometric.nn import GCNConv, GATConv
    from torch_geometric.data import Data, DataLoader
    HAS_GEOMETRIC = True
except ImportError:
    HAS_GEOMETRIC = False

class GNNRiskModel(nn.Module):
    def __init__(self, node_features=8, hidden_dim=64, output_dim=3):
        super().__init__()
        if HAS_GEOMETRIC:
            self.conv1 = GCNConv(node_features, hidden_dim)
            self.conv2 = GCNConv(hidden_dim, hidden_dim)
            self.conv3 = GATConv(hidden_dim, hidden_dim // 4, heads=4)
            self.fc1 = nn.Linear(hidden_dim, 32)
            self.fc2 = nn.Linear(32, output_dim)
            self.dropout = nn.Dropout(0.3)

    def forward(self, x, edge_index):
        if not HAS_GEOMETRIC:
            return torch.zeros(x.shape[0], 3)
        x = F.relu(self.conv1(x, edge_index))
        x = self.dropout(x)
        x = F.relu(self.conv2(x, edge_index))
        x = self.dropout(x)
        x = F.elu(self.conv3(x, edge_index))
        x = F.relu(self.fc1(x))
        return torch.sigmoid(self.fc2(x))


def generate_training_project(seed: int) -> Data:
    """Generate synthetic construction project graph for training"""
    random.seed(seed)
    np.random.seed(seed)

    num_tasks = random.randint(3, 8)
    num_equipment = random.randint(1, 4)
    num_incidents = random.randint(0, 3)
    nodes = []
    labels = []

    # Task nodes
    for i in range(num_tasks):
        delay = random.uniform(0, 0.9)
        progress = random.uniform(0, 1)
        status_risk = random.uniform(0, 0.9)
        priority = random.choice([0.2, 0.5, 1.0])
        features = [progress, delay, status_risk, priority, 0, 0, 0, 0]
        nodes.append(features)
        risk_label = min(delay * 0.5 + status_risk * 0.3 + (1 - progress) * 0.2, 0.99)
        labels.append([risk_label, min(risk_label * 1.2, 0.99), min(risk_label * 0.8, 0.99)])

    # Equipment nodes
    for i in range(num_equipment):
        health = random.uniform(0.3, 1.0)
        eq_risk = random.uniform(0, 0.8)
        features = [health, eq_risk, random.uniform(0, 1), 0, 0, 0, 0, 0]
        nodes.append(features)
        risk = (1 - health) * 0.6 + eq_risk * 0.4
        labels.append([risk, min(risk * 1.3, 0.99), min(risk * 0.7, 0.99)])

    # Safety nodes
    for i in range(num_incidents):
        sev = random.uniform(0.2, 0.9)
        open_status = random.choice([0, 1])
        features = [sev, open_status, 0, 0, 0, 0, 0, 0]
        nodes.append(features)
        risk = sev * 0.7 + open_status * 0.3
        labels.append([risk, min(risk * 1.4, 0.99), min(risk * 0.6, 0.99)])

    # Cost node
    overrun = random.uniform(0.5, 1.5)
    features = [overrun / 2, 0, 0, 0, 0, 0, 0, 0]
    nodes.append(features)
    cost_risk = max(0, overrun - 1.0) * 0.9
    labels.append([cost_risk, min(cost_risk * 1.2, 0.99), min(cost_risk * 0.8, 0.99)])

    n = len(nodes)
    if n < 2:
        return None

    # Build edges
    edge_sources, edge_targets = [], []
    for i in range(min(num_tasks - 1, n - 1)):
        edge_sources.append(i); edge_targets.append(i + 1)
        edge_sources.append(i + 1); edge_targets.append(i)

    for i in range(num_tasks, num_tasks + num_equipment):
        target = random.randint(0, num_tasks - 1)
        edge_sources.append(i); edge_targets.append(target)
        edge_sources.append(target); edge_targets.append(i)

    # All connect to cost
    cost_idx = n - 1
    for i in range(n - 1):
        if random.random() > 0.5:
            edge_sources.append(i); edge_targets.append(cost_idx)

    if not edge_sources:
        edge_sources = [0]; edge_targets = [min(1, n-1)]

    x = torch.tensor(nodes, dtype=torch.float)
    edge_index = torch.tensor([edge_sources, edge_targets], dtype=torch.long)
    y = torch.tensor(labels, dtype=torch.float)

    return Data(x=x, edge_index=edge_index, y=y)


def train_gnn():
    """Train GNN Risk Model on synthetic construction data"""
    if not HAS_GEOMETRIC:
        print("torch_geometric not available — using rule-based fallback")
        return False

    print("🧠 Training GNN Risk Model...")
    print(f"   PyTorch: {torch.__version__}")

    # Generate training data
    print("📊 Generating synthetic construction project graphs...")
    train_data = []
    for seed in range(500):
        d = generate_training_project(seed)
        if d is not None:
            train_data.append(d)

    val_data = []
    for seed in range(500, 600):
        d = generate_training_project(seed)
        if d is not None:
            val_data.append(d)

    print(f"   Training graphs: {len(train_data)}")
    print(f"   Validation graphs: {len(val_data)}")

    # Model
    model = GNNRiskModel(node_features=8, hidden_dim=64, output_dim=3)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=20, gamma=0.5)
    criterion = nn.MSELoss()

    # MLflow tracking
    mlflow.set_tracking_uri("sqlite:///mlflow.db")
    mlflow.set_experiment("CivilAI_Construction_ML")

    best_val_loss = float("inf")
    train_losses = []
    val_losses = []

    with mlflow.start_run(run_name="gnn_risk_model_v1"):
        mlflow.set_tag("model_type", "GNN")
        mlflow.set_tag("architecture", "GCN+GAT")
        mlflow.log_param("hidden_dim", 64)
        mlflow.log_param("node_features", 8)
        mlflow.log_param("output_dim", 3)
        mlflow.log_param("epochs", 50)
        mlflow.log_param("train_graphs", len(train_data))

        print("\n🚀 Training...")
        for epoch in range(50):
            model.train()
            total_loss = 0
            random.shuffle(train_data)

            for data in train_data:
                optimizer.zero_grad()
                out = model(data.x, data.edge_index)
                loss = criterion(out, data.y)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                total_loss += loss.item()

            avg_train_loss = total_loss / len(train_data)
            train_losses.append(avg_train_loss)

            # Validation
            model.eval()
            val_loss = 0
            with torch.no_grad():
                for data in val_data:
                    out = model(data.x, data.edge_index)
                    val_loss += criterion(out, data.y).item()
            avg_val_loss = val_loss / len(val_data)
            val_losses.append(avg_val_loss)

            scheduler.step()

            mlflow.log_metric("train_loss", avg_train_loss, step=epoch)
            mlflow.log_metric("val_loss", avg_val_loss, step=epoch)

            if avg_val_loss < best_val_loss:
                best_val_loss = avg_val_loss
                torch.save(model.state_dict(), "models/saved/gnn_risk_model.pt")

            if (epoch + 1) % 10 == 0:
                print(f"   Epoch {epoch+1:3d}/50 | Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f}")

        mlflow.log_metric("best_val_loss", best_val_loss)
        mlflow.log_metric("final_train_loss", train_losses[-1])
        print(f"\n✅ Training complete! Best val loss: {best_val_loss:.4f}")
        print(f"   Model saved to models/saved/gnn_risk_model.pt")

    return True


if __name__ == "__main__":
    train_gnn()