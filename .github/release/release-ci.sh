#!/usr/bin/env bash
set -euo pipefail

if [ "${CI_DRY_RUN:-false}" = "true" ] && [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "has_releases=false" >> "$GITHUB_OUTPUT"
fi
RELEASE_RUNNER="$(pwd)/.github/release/releasePackage.js"

corepack pnpm -r --filter './packages/*' --workspace-concurrency=1 exec \
  node "${RELEASE_RUNNER}"

if [ "${CI_DRY_RUN:-false}" = "true" ]; then
  echo "dry-run done, skip publish"
  exit 0
fi

PUBLISH_TAG_ARGS=()
if [ "${GITHUB_REF_NAME:-}" = "alpha" ]; then
  PUBLISH_TAG_ARGS=(--tag alpha)
elif [ "${GITHUB_REF_NAME:-}" = "beta" ]; then
  PUBLISH_TAG_ARGS=(--tag beta)
fi

corepack pnpm -r --filter "@cmx-tools/*" --filter "[HEAD]" publish --access public --no-git-checks "${PUBLISH_TAG_ARGS[@]}"
