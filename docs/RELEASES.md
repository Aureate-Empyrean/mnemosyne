# Mnemosyne releases and provenance

## Version control history

Development from 1.2.3 (commit `539ca29`) to 1.5.0 was not committed as it happened. Intermediate versions have no history and none was reconstructed. Commits and tags carry their true creation date, which is after deployment.

## 1.5.0

| | |
| --- | --- |
| Tag | `v1.5.0` (annotated, tag object `731548d838b9a4482e85e87c4fdef70161479067`) |
| Baseline commit | `a307e210993ee194bc12574153eff2a77b8c2459`, created 2026-11-09 after deployment |
| Deployed image | `sha256:b21ccd24ce087546e4a5e349b611e1cb0613685873291e3c6c969138e338bc8b` |
| Image config | `sha256:efe3728f1f5ed11e07682f5a07ecd03e9f2402cd604412924fc24d3462d3467b` |
| Image built | 2026-11-09T08:43:38.561166065Z |
| Deployed | Exodus, 2026-11-09. The running container's image was read back on 2026-11-09 and matches the digest above |

### What has been demonstrated

Checked on 2026-11-09 from a clean clone of the tagged commit, against the image archive saved at release time.

- Of 16 non-compiled files in the image's `/app`, 5 are byte-identical to the tag and 11 differ only in line endings.
- The image was rebuilt with `deploy/Dockerfile`. Every file outside `/app` that is not a compiled `.pyc` is identical. Entrypoint, environment and user are the same.
- The unit suite passes on the clone: 34 passed.

### What has not been demonstrated

The build is **not reproducible to the digest**. Two rebuilds gave two different digests, sharing 5 of 11 layers with the deployed image.

- The deployed image was built from a Windows working tree, so 11 text files have CRLF line endings there and LF here.
- The deployed image holds 3 extra `.pyc` files under `/app`, copied from local test runs because `.dockerignore` does not exclude `__pycache__`. A clean checkout has none.
- 771 `.pyc` files from installed packages differ between builds, because they embed build-time data.
- The commit was made after the image was built. It records matching content, not the build's actual input.

## Conventions

Create the tag before deploying and build from a clean checkout of it. Record the commit and image digest in the deployment record. Do not move a published tag.

## Rewritten commit identifiers

This repository's history was rewritten on 2026-11-10. Earlier entries keep the identifiers recorded at the time. The tables give the current ones.

| Old commit | New commit |
| --- | --- |
| `a307e21099` | `5e0484ecc8` |
| `c751dc25cf` | `df58a17a0f` |
| `e9b1dbf0dc` | `6717859496` |
| `293752894f` | `6858230d73` |
| `7424e3b555` | `a869d8b006` |

| Tag | Old object | New object |
| --- | --- | --- |
| `v1.5.0` | `731548d838` | `9877c705d2` |
| `v1.5.1` | `c84283cf88` | `148e296770` |
