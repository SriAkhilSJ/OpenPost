# Anime video on Kaggle's free GPU — model research + starter kit

Everything here is built for the **free Kaggle Notebook accelerators as of Oct 2026**.

---

## TL;DR

| Question | Answer |
|---|---|
| Best model for AI **anime** video that fits Kaggle? | **`Wan-AI/Wan2.2-TI2V-5B`** (Alibaba, Apache-2.0) |
| Why? | Wan 2.2 is the community's clear leader for cel-shaded / hand-drawn looks, the 5B variant is the only SOTA-class open model that fits a 16 GB T4, and one checkpoint does both text→video and image→video |
| Where do the GPU and secrets live? | GPU: **Kaggle → notebook → Settings → Accelerator → GPU T4 ×2**. Secrets: **Kaggle notebook → Add-ons → Secrets** (not GitHub) |
| What if I want the absolute best anime quality? | `Wan2.2-I2V-A14B` + an anime LoRA — does **not** fit a T4; rent a 24 GB+ card (RunPod/Vast) for final renders |
| Starter notebook | [`anime_video_kaggle.ipynb`](anime_video_kaggle.ipynb) |

---

## 1 · What Kaggle actually gives you (Oct 2026)

| Resource | Value | Notes |
|---|---|---|
| Accelerator | **GPU T4 × 2** — 2 × 16 GB | `sm_75` Turing: fp16 ✅, **bf16 ❌**, FlashAttention-2 ❌ |
| Deprecated | ~~GPU P100~~ | **Retired 15 Sep 2026** — do not target it |
| RAM / vCPU | 29 GB / 4 | enough for CPU-offload |
| Session | ~9–12 h max | but the real cap is the weekly quota |
| Quota | **30 GPU-h / week** | shared across all your notebooks |
| Disk | 20 GB `/kaggle/working`, `/kaggle/temp` scratch | keep model caches out of `working` |
| Internet | toggle in the Settings panel | **must be On** for weights + pip |

> ⚠️ The two T4s are **two separate cards, not a 32 GB pool**. A single diffusers pipeline only uses GPU 0.
> To use both, run two processes with `CUDA_VISIBLE_DEVICES=0` and `CUDA_VISIBLE_DEVICES=1`.
> Note that T4 has no `bf16` — using bf16 there silently yields NaN/black frames. Pin **fp16**.

---

## 2 · Model landscape (anime video, open weights)

| Model | Params | Min VRAM | Fits T4? | Anime / stylised | Native audio | Licence | Verdict for Kaggle |
|---|---|---|---|---|---|---|---|
| **Wan 2.2 TI2V-5B** | 5B | ~8 GB w/ offload | ✅ | ★★★★☆ | ❌ | Apache-2.0 | **Pick this.** T2V + I2V in one 5B checkpoint, 720p@24fps capable |
| Wan 2.2 T2V / I2V A14B | 27B MoE (14B active) | 24 GB FP8, 80 GB official | ❌ | ★★★★★ | ❌ | Apache-2.0 | Best anime quality + biggest LoRA ecosystem; far too slow on a T4 |
| Wan 2.2 **Animate-14B** | 14B | 24 GB+ | ❌ | ★★★★★ | ❌ | Apache-2.0 | Character/motion transfer from a driving clip — "make my OC do this dance" |
| LTX-2.x | 22B | 16–32 GB FP8/GGUF | ❌/⚠️ | ★★☆☆☆ | ✅ | LTX-2 community licence | Fast, long clips, audio — weak on hand-drawn style |
| HunyuanVideo 1.5 | 8–13B | 14 GB offloaded / 24 GB comfy | ⚠️ | ★★★☆☆ | ❌ | Apache-2.0 | Cinematic realism, not anime |
| AnimateDiff-Lightning + anime SD1.5 | ~1.8B | 6–8 GB | ✅✅ | ★★★☆☆ | ❌ | Apache-2.0 / open | 4–8 steps, 16 frames, 512² — seconds per clip, animatics only |
| CogVideoX-1.5 | 5B | 24 GB | ❌ | ★★☆☆☆ | ❌ | Apache-2.0 | Superseded |

**Why Wan 2.2 wins for anime:** it is trained with curated aesthetic/video data, has the deepest LoRA + motion-LoRA
ecosystem of any open video model, and its 5B TI2V variant is the only one that runs inside 16 GB with CPU offload.
Community comparisons consistently rank it first for cel-shaded/hand-drawn output. Descriptive style prefixes
(`1990s cel animation, flat cel shading, hand-inked lineart`) plus an anti-realism negative prompt do most of the work.

**Quality ladder, cheapest → best:**
1. AnimateDiff-Lightning (512², 16 frames) — blocking out motion, seconds per clip
2. **Wan 2.2 TI2V-5B @ 480p** — the default; ~10–30 min per 2 s clip on a T4
3. Wan 2.2 TI2V-5B @ 704p + anime LoRA — slow on T4, better on a rented 4090
4. Wan 2.2 I2V-A14B + anime LoRA (24 GB+) — production quality
5. Wan 2.2 Animate-14B — when you need *specific* motion from a reference video

---

## 3 · Where the secrets go (two different stores — don't mix them up)

### A. Kaggle notebook secrets (what this pipeline needs)

Kaggle notebook editor → **Add-ons → Secrets → Add a secret** (top menu bar). Then tick the secret for the notebook
and read it in code:

```python
from kaggle_secrets import UserSecretsClient
secret = UserSecretsClient().get_secret("HF_TOKEN")
```

| Label | Needed for | Required? |
|---|---|---|
| `HF_TOKEN` | gated/private Hugging Face repos, private LoRAs you host on HF | optional — Wan 2.2 is ungated |
| `KAGGLE_API_TOKEN` | only if you trigger Kaggle from CI (not readable by the notebook itself) | optional |

There is **no CLI/API to create Kaggle secrets** — it must be done in the notebook editor UI once.

### B. GitHub Actions secrets (only for CI that drives Kaggle)

Repo → **Settings → Secrets and variables → Actions** →
<https://github.com/SriAkhilSJ/OpenPost/settings/secrets/actions>

| Secret | Value | Used by |
|---|---|---|
| `KAGGLE_USERNAME` | `sriakhilsj` | `.github/workflows/kaggle-smoke-test.yml` |
| `KAGGLE_API_TOKEN` | token from <https://www.kaggle.com/settings/api> | same |

> `kaggle >= 2.2` authenticates **only** with `KAGGLE_API_TOKEN` (env var or `~/.kaggle/access_token`).
> The legacy `KAGGLE_USERNAME` + `KAGGLE_KEY` pair is ignored by 2.x — if you must use it, pin `kaggle<2`.
> GitHub Actions secrets are **never** visible to a Kaggle notebook; the notebook reads Add-ons → Secrets.

---

## 4 · Run it

### Option 1 — manual (fastest to try)
1. Kaggle → **Create → Notebook → File → Import Notebook** → upload `anime_video_kaggle.ipynb`
2. Right panel: **Accelerator = GPU T4 ×2**, **Internet = On**
3. *(optional)* Add-ons → Secrets → `HF_TOKEN`
4. **Run all**

### Option 2 — CLI push (this is what `kernel-metadata.json` is for)

```bash
pip install -U "kaggle>=2.2"
export KAGGLE_USERNAME=sriakhilsj
export KAGGLE_API_TOKEN=...            # kaggle.com/settings/api

kaggle kernels push   -p kaggle/       # uses kaggle/kernel-metadata.json
kaggle kernels status sriakhilsj/openpost-anime-video
kaggle kernels output sriakhilsj/openpost-anime-video -p ./out
```

`kernel-metadata.json` already pins `"machine_shape": "NvidiaTeslaT4"`. **Do not rely on `enable_gpu: true` alone** —
without `machine_shape` the CLI has historically defaulted notebooks to the wrong (now retired) GPU shape.

---

## 5 · Expected timings & budget

Rough, single T4, 832×480, 30 steps, 49 frames (~2 s @ 24 fps):

| Model / path | Per clip | Notes |
|---|---|---|
| AnimateDiff-Lightning 8-step | **5–20 s** | 512², 16 frames — animatics |
| Wan 2.2 TI2V-5B @ 480p | **10–30 min** | the default in the notebook |
| Wan 2.2 TI2V-5B @ 704p | 45–90 min | usually not worth it on a T4 |
| Wan 2.2 A14B (GGUF/block-swap) | 2–6 h | don't — rent a 24 GB card instead |

At 30 GPU-h/week that is roughly **60–150 finished clips per week** at 480p. First session costs an extra
~5–10 min to download ~20 GB of weights (cached for the life of the VM, not across sessions unless you
save them as a Kaggle Dataset / Model).

---

## 6 · Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `torch.cuda.OutOfMemoryError` | 480p/49f is borderline on 16 GB | `height=352, width=640`, `num_frames=33`, keep `enable_model_cpu_offload()` |
| Black / grey frames | bf16 on Turing, or fp16 VAE decode | keep `DTYPE=torch.float16` for the transformer, **fp32 VAE + `enable_tiling()`** (already set) |
| `ImportError: cannot import name 'WanPipeline'` | Kaggle's preinstalled diffusers is old | run the `%pip install -U "diffusers>=0.35"` cell, then **Runtime → Restart**, re-run from cell 3 |
| `num_frames must satisfy 4k+1` | VAE temporal stride 4 | `snap4k1()` in the notebook handles it; 49 / 81 / 121 are the good values |
| Shape mismatch on width/height | VAE ×16 × patch 2 → multiples of 32 | `snap32()` handles it; 832×480, 1280×704 |
| Disk full in `/kaggle/working` | weights cached there | `HF_HOME=/kaggle/temp/hf` (already set in cell 1) |
| Kernel dies ~9–12 h in | session cap | batch loop has a `MAX_MINUTES` guard; commit output to a Kaggle Dataset |
| Only one GPU is busy | diffusers pipelines are single-device | run a 2nd process with `CUDA_VISIBLE_DEVICES=1` |

---

## 7 · Files

```
kaggle/
├── anime_video_kaggle.ipynb   # the pipeline: env → secrets → config → render → batch → i2v → animatics
├── kernel-metadata.json       # `kaggle kernels push -p kaggle/`
└── README.md                  # this file
.github/workflows/
└── kaggle-smoke-test.yml      # verifies the Actions secrets authenticate against the Kaggle API
```
