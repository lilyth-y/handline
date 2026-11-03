"""Train YOLO11n-seg on palm lines. Logs per-epoch metrics, a weights log CSV and pushes backups."""
import os, sys, csv, yaml, time, subprocess, argparse
from ultralytics import YOLO, settings
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync_backup import sync
ap = argparse.ArgumentParser(); ap.add_argument("--config", default=f"{ROOT}/configs/train_v1.yaml")
ap.add_argument("--push", action="store_true"); ap.add_argument("--push_every", type=int, default=5)
a = ap.parse_args()
os.chdir(ROOT)
settings.update({"tensorboard": True})
cfg = yaml.safe_load(open(a.config))
model = YOLO(cfg.pop("model"))
WLOG = f"{ROOT}/logs/weights_log.csv"
os.makedirs(f"{ROOT}/logs", exist_ok=True)
if not os.path.exists(WLOG):
    csv.writer(open(WLOG, "w", newline="")).writerow(["epoch", "file", "size_bytes", "mask_mAP50", "mask_mAP50-95", "box_mAP50", "fitness", "time"])
T0 = time.time()
def on_fit_epoch_end(tr):
    ep = tr.epoch + 1; m = tr.metrics or {}
    wdir = str(tr.wdir); files = ["last.pt"]
    if tr.best_fitness is not None and tr.fitness == tr.best_fitness: files.append("best.pt")
    if tr.args.save_period > 0 and ep % tr.args.save_period == 0: files.append(f"epoch{ep}.pt")
    with open(WLOG, "a", newline="") as fh:
        w = csv.writer(fh)
        for f in files:
            p = os.path.join(wdir, f)
            if os.path.exists(p):
                w.writerow([ep, f, os.path.getsize(p), round(m.get("metrics/mAP50(M)", 0), 5), round(m.get("metrics/mAP50-95(M)", 0), 5),
                            round(m.get("metrics/mAP50(B)", 0), 5), round(float(tr.fitness or 0), 5), time.strftime("%Y-%m-%d %H:%M:%S")])
    print(f"[epoch {ep}] {time.time()-T0:.0f}s elapsed, mask mAP50={m.get('metrics/mAP50(M)',0):.4f}", flush=True)
    if a.push and ep % a.push_every == 0:
        sync(str(tr.save_dir), push=True, msg=f"Training backup: epoch {ep}")
model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
model.train(**cfg)
print(f"TRAINING_DONE {time.time()-T0:.0f}s", flush=True)
