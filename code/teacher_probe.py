"""Run palm-line-reader (MIT) ONNX student on PLSU images to get per-class line maps."""
import numpy as np, onnxruntime as ort, sys
from PIL import Image
SESS = None
MEAN = np.array([0.485,0.456,0.406],np.float32); STD=np.array([0.229,0.224,0.225],np.float32)
def sess(path):
    global SESS
    if SESS is None:
        so=ort.SessionOptions(); so.intra_op_num_threads=8
        SESS=ort.InferenceSession(path,so,providers=["CPUExecutionProvider"])
    return SESS
def hand_bbox(rgb, margin=40):
    g = rgb.astype(np.int32)
    fg = (g.min(axis=2) < 200)  # non-white background
    ys, xs = np.where(fg)
    h, w = fg.shape
    if len(xs)==0: return 0,0,w,h
    x0,x1 = np.percentile(xs,[0.5,99.5]); y0,y1=np.percentile(ys,[0.5,99.5])
    return max(0,int(x0)-margin),max(0,int(y0)-margin),min(w,int(x1)+margin),min(h,int(y1)+margin)
def probs(model, crop_rgb):
    x = np.array(Image.fromarray(crop_rgb).resize((512,512),Image.BILINEAR),np.float32)/255.
    x = ((x-MEAN)/STD).transpose(2,0,1)[None].astype(np.float32)
    lg = sess(model).run(None,{"input":x})[0][0]
    e = np.exp(lg-lg.max(0,keepdims=True)); return e/e.sum(0,keepdims=True)
def teacher_classmap(model, rgb):
    """Returns (H,W,4) prob map in full-image coords, trying both mirror orientations."""
    x0,y0,x1,y1 = hand_bbox(rgb); crop = rgb[y0:y1,x0:x1]
    p1 = probs(model, crop); p2 = probs(model, crop[:, ::-1].copy())[:, :, ::-1]
    s1 = p1[1:].max(0).mean(); s2 = p2[1:].max(0).mean()
    p = p1 if s1>=s2 else p2
    full = np.zeros((4,)+rgb.shape[:2],np.float32); full[0]=1
    ch,cw = crop.shape[:2]
    for c in range(4):
        full[c,y0:y1,x0:x1] = np.array(Image.fromarray(p[c]).resize((cw,ch),Image.BILINEAR))
    return full, (s1>=s2)
