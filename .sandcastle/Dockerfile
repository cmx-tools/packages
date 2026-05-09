FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  ripgrep \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm
RUN npm install -g @openai/codex
RUN set -eux; \
  curl -fsSL https://cli.coderabbit.ai/install.sh -o /tmp/coderabbit-install.sh; \
  CODERABBIT_INSTALL_DIR=/usr/local/bin sh /tmp/coderabbit-install.sh; \
  rm -f /tmp/coderabbit-install.sh; \
  coderabbit --version

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000
# Rename base "node" user to "agent", align uid/gid.
# If target gid already exists, reuse that group.
RUN set -eux; \
  TARGET_GROUP="$(getent group "${AGENT_GID}" | cut -d: -f1 || true)"; \
  if [ -n "${TARGET_GROUP}" ] && [ "${TARGET_GROUP}" != "node" ]; then \
    usermod -u "${AGENT_UID}" -g "${AGENT_GID}" -d /home/agent -m -l agent node; \
  else \
    groupmod -g "${AGENT_GID}" node; \
    usermod -u "${AGENT_UID}" -g "${AGENT_GID}" -d /home/agent -m -l agent node; \
  fi
USER ${AGENT_UID}:${AGENT_GID}

RUN npx skills add -g -y https://github.com/Xiphe/skills --skill golden-commit-ralph
RUN npx skills add -g -y https://github.com/mattpocock/skills --skill caveman
RUN npx skills add -g -y https://github.com/mattpocock/skills --skill tdd
RUN npx skills add -g -y https://github.com/coderabbitai/skills --skill code-review

WORKDIR /home/agent

# In worktree sandbox mode, Sandcastle bind-mounts the git worktree at /home/agent/workspace
# and overrides the working directory to /home/agent/workspace at container start.
# Structure your Dockerfile so that /home/agent/workspace can serve as the project root.
ENTRYPOINT ["sleep", "infinity"]