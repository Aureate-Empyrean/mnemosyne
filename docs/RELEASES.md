# Mnemosyne releases and provenance

## Version control history

Development from 1.2.3 (commit `539ca29`) to 1.5.0 was not committed as it happened. Intermediate versions have no history and none was reconstructed. Commits and tags carry their true creation date, which is after deployment.

## 1.5.1

| | |
| --- | --- |
| Tag | `v1.5.1` (annotated, tag object `c84283cf88410268c4370402d655165153cb6029`) |
| Release commit | `e9b1dbf0dc4fd5d5ef8cb5d4570788c37b5f3d27`, created 2026-11-09 before any deployment |
| Release image | `sha256:6e36535991d20cb3f44c9d14b46f9a853341b28f8a415303689fd07220732faf`, built from a clean clone of this commit |
| Image built | 2026-11-09T18:14:51.888629218Z |
| Deployed | **Not deployed to Exodus.** This image runs on aetest |
| CI | This repository has no GitHub Actions workflow. The equivalent checks ran locally from a clean clone |

### What has been demonstrated

Checked on 2026-11-09. Evidence is in `VALIDATION_P1_NAVIGATION_AETEST_2026-11-09.md` at the workspace root.

- All 14 files under the image's `/app/backend` and `/app/frontend` are byte-identical to this commit.
- Against the working-tree build first validated on aetest, those files match except for line endings: 5 byte-identical and 9 differing only in line endings.
- This exact image was then installed on aetest, and the universal navigation journeys passed against it in Chromium, WebKit and Firefox on Linux.
- The unit suite passes on the clean clone: 34 passed; frontend 13 passed.

### What has not been demonstrated

- The build is **not reproducible to the digest**. Rebuilds of unchanged source gave different image IDs.
- Physical mouse buttons, native keyboard shortcuts, Safari and real phones have not been checked.
- It has not run in production.

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
