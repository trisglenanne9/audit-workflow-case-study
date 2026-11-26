"""Load Qwen3-ASR-1.7B in bf16 (low memory), then convert layer by layer to dynamic int8 (Linear) + fp32 (rest)."""
import os, torch, torch.nn as nn, gc
from torch.ao.quantization import quantize_dynamic
from qwen_asr import Qwen3ASRModel

def load_int8(path=os.environ.get("QWEN_MODEL", "Qwen/Qwen3-ASR-1.7B"), max_new_tokens=400, bs=1):
    m = Qwen3ASRModel.from_pretrained(path, dtype=torch.bfloat16, device_map="cpu",
                                      max_new_tokens=max_new_tokens, max_inference_batch_size=bs)
    root = m.model
    def walk(mod):
        for name, child in list(mod.named_children()):
            if isinstance(child, nn.Linear):
                child.float()
                q = quantize_dynamic(nn.Sequential(child), {nn.Linear}, dtype=torch.qint8)[0]
                setattr(mod, name, q)
                del child
            else:
                walk(child)
                for p in child.parameters(recurse=False): p.data = p.data.float()
                for k, b in child.named_buffers(recurse=False):
                    if b.dtype in (torch.bfloat16, torch.float16): child._buffers[k] = b.float()
        gc.collect()
    walk(root)
    for p in root.parameters(recurse=False): p.data = p.data.float()
    root.config.torch_dtype = torch.float32
    return m
