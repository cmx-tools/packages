#!/usr/bin/env bash
set -euo pipefail

DRY_RUN_ARGS=()
if [ "${CI_DRY_RUN:-false}" = "true" ]; then
  DRY_RUN_ARGS=(--dry-run)
fi
RELEASE_CONFIG="$(pwd)/.github/release/release.config.js"

corepack pnpm -r --filter './packages/*' --workspace-concurrency=1 exec \
  semantic-release --extends "${RELEASE_CONFIG}" -e semantic-release-monorepo "${DRY_RUN_ARGS[@]}"

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
