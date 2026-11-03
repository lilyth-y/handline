"""Copy run artifacts into the repo layout (logs/, weights/) and optionally git commit + push."""
import os, shutil, glob, subprocess, sys, csv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def sync(run_dir, push=False, msg="backup", weights_dir="weights", logs_dir="logs"):
    W, LG = weights_dir, logs_dir  # repo-relative destinations (v1: weights/, logs/; v2: weights/v2/, logs/v2/)
    os.makedirs(f"{ROOT}/{W}", exist_ok=True); os.makedirs(f"{ROOT}/{LG}/tensorboard", exist_ok=True)
    for f in glob.glob(f"{run_dir}/weights/*.pt"):
        shutil.copy2(f, f"{ROOT}/{W}/")
    for f in ["results.csv", "results.png", "args.yaml"] + [os.path.basename(p) for p in glob.glob(f"{run_dir}/*.png") + glob.glob(f"{run_dir}/*.jpg")]:
        if os.path.exists(f"{run_dir}/{f}"):
            dst = LG if f in ("results.csv", "results.png", "args.yaml") else f"{LG}/plots"
            os.makedirs(f"{ROOT}/{dst}", exist_ok=True); shutil.copy2(f"{run_dir}/{f}", f"{ROOT}/{dst}/")
    for f in glob.glob(f"{run_dir}/events.out.tfevents.*"):
        shutil.copy2(f, f"{ROOT}/{LG}/tensorboard/")
    if push:
        g = lambda *a: subprocess.run(["git", "-C", ROOT, *a], capture_output=True, text=True)
        g("add", "-A")
        r = g("commit", "-m", msg)
        p = g("push", "origin", "main")
        h = g("rev-parse", "--short", "HEAD").stdout.strip()
        with open(f"{ROOT}/{LG}/push_log.txt", "a") as fh:
            fh.write(f"{h}\t{msg}\tcommit_rc={r.returncode}\tpush_rc={p.returncode}\t{p.stderr.strip()[-200:]}\n")
if __name__ == "__main__":
    sync(sys.argv[1], push="--push" in sys.argv, msg=(sys.argv[sys.argv.index('-m')+1] if '-m' in sys.argv else "backup"))
