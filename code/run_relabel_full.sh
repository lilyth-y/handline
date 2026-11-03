#!/bin/bash
# Resumable full relabel loop: reruns until all images have v2 labels (max 6 passes).
cd "$(dirname "$0")/.." && source .venv/bin/activate
# same as pilots: disable Nemotron reasoning mode (otherwise up to 6000 reasoning tokens / call, often truncated)
export VLM_EXTRA_BODY='{"chat_template_kwargs":{"enable_thinking":false}}'
for pass in 1 2 3 4 5 6; do
  echo "=== pass $pass $(date)"
  python code/ai_relabel.py full --model nvidia/nemotron-3.5-super-vl-120b-a12b --hint --shuffle --policy hybrid --workers 4
  have=$(ls data/palm_lines_yolo_v2/labels/train data/palm_lines_yolo_v2/labels/val | grep -c '\.txt$')
  echo "labels: $have / 1039"
  [ "$have" -ge 1039 ] && break
  sleep 60
done
echo "=== DONE $(date)"
