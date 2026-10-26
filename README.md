# OpenPost

AI anime video generation experiments, built to run on free / cheap GPUs.

## Quickstart

Free Kaggle GPU (2 × T4, 16 GB each) + **Wan 2.2 TI2V-5B** (Apache-2.0):

1. Open [`kaggle/anime_video_kaggle.ipynb`](kaggle/anime_video_kaggle.ipynb) in a Kaggle notebook
2. Settings → **Accelerator: GPU T4 ×2**, **Internet: On**
3. *(optional)* Add-ons → **Secrets** → add `HF_TOKEN`
4. Run all — first clip in ~10–30 min after a one-time ~20 GB model download

Model choice, hardware limits, secret locations and timings: **[`kaggle/README.md`](kaggle/README.md)**.

## Secrets

| Where | For what | Link |
|---|---|---|
| Kaggle → notebook → **Add-ons → Secrets** | `HF_TOKEN` (gated/private models), read via `UserSecretsClient` | notebook editor menu |
| GitHub → repo → **Settings → Secrets and variables → Actions** | `KAGGLE_USERNAME`, `KAGGLE_API_TOKEN` — CI that drives Kaggle only | <https://github.com/SriAkhilSJ/OpenPost/settings/secrets/actions> |

## Repo layout

```
kaggle/
├── anime_video_kaggle.ipynb   # text→video, image→video, batch, animatics
├── kernel-metadata.json       # CLI push config (pins GPU T4 ×2)
└── README.md                  # research: models, VRAM, quotas, troubleshooting
.github/workflows/
└── kaggle-smoke-test.yml      # manual check that Kaggle credentials work
```
