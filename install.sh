#!/usr/bin/env bash
#
#  Obelisk installer
#  A web panel for ARK: Survival Ascended / Survival Evolved servers and clusters.
#
#  Install:   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/install.sh | sudo bash
#  Update:    sudo arkpanel update          (or run this script again)
#
#  Optional environment variables (for unattended installs):
#    ARKPANEL_REPO            git URL of the panel repository
#    ARKPANEL_BRANCH          branch to install (default: main)
#    ARKPANEL_PORT            web panel port (default: 8080)
#    ARKPANEL_DATA_DIR        where game servers, backups and data live (default: /var/lib/arkpanel)
#    ARKPANEL_ADMIN_USER      first admin username (default: admin)
#    ARKPANEL_ADMIN_PASSWORD  first admin password (default: generated)
#    ARKPANEL_YES=1           don't ask questions, use defaults
#
set -euo pipefail

# Everything runs inside main() so bash reads the whole script before executing it
# (important when the script is piped from curl).
main() {

# Change this to your own repository after forking / pushing it to GitHub.
DEFAULT_REPO="https://github.com/TimonNL2/obelisk-ark-panel.git"

REPO_URL="${ARKPANEL_REPO:-$DEFAULT_REPO}"
BRANCH="${ARKPANEL_BRANCH:-main}"
APP_DIR="/opt/arkpanel"
ENV_DIR="/etc/arkpanel"
ENV_FILE="$ENV_DIR/arkpanel.env"
SERVICE_USER="arkpanel"
NODE_MAJOR=24
MODE="install"
[[ "${1:-}" == "--update" ]] && MODE="update"

# ----------------------------------------------------------------- helpers
if [[ -t 1 ]]; then
  C_RESET=$'\e[0m'; C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'; C_RED=$'\e[31m'; C_CYAN=$'\e[36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""
fi
step()  { echo; echo "${C_CYAN}${C_BOLD}==>${C_RESET}${C_BOLD} $*${C_RESET}"; }
info()  { echo "    $*"; }
ok()    { echo "    ${C_GREEN}✓${C_RESET} $*"; }
warn()  { echo "    ${C_YELLOW}!${C_RESET} $*"; }
die()   { echo; echo "${C_RED}${C_BOLD}Error:${C_RESET} $*" >&2; exit 1; }

# Only ask questions when the script runs in a real terminal ("sudo bash install.sh").
# When piped ("curl ... | sudo bash") we never read from /dev/tty: sudo-rs (default on
# Ubuntu 25.10+) does not forward keyboard input in that case, which would hang forever.
INTERACTIVE=0
if [[ -z "${ARKPANEL_YES:-}" && -t 0 ]]; then INTERACTIVE=1; fi

ask() { # ask "Question" "default" -> echoes answer
  local q="$1" def="$2" ans=""
  if [[ $INTERACTIVE -eq 1 ]]; then
    read -r -p "    $q ${C_DIM}[$def]${C_RESET}: " ans || true
  fi
  echo "${ans:-$def}"
}
ask_secret() {
  local q="$1" ans=""
  if [[ $INTERACTIVE -eq 1 ]]; then
    read -r -s -p "    $q: " ans || true
    echo >&2
  fi
  echo "$ans"
}
# Run a command as the service user. runuser is part of util-linux, so this
# works with classic sudo, sudo-rs or no sudo at all.
as_user() { runuser -u "$SERVICE_USER" -- env HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)" "$@"; }

# ----------------------------------------------------------------- checks
[[ $EUID -eq 0 ]] || die "Run this script as root, e.g.: curl -fsSL <url>/install.sh | sudo bash"
[[ -f /etc/os-release ]] || die "Unsupported system (no /etc/os-release)"
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" && "${ID_LIKE:-}" != *debian* ]]; then
  die "This installer supports Ubuntu Server (22.04 / 24.04 or newer) and Debian."
fi
[[ "$(uname -m)" == "x86_64" ]] || die "ARK servers need an x86_64 (amd64) machine."

echo
echo "${C_BOLD}  Obelisk ${MODE}${C_RESET}  ${C_DIM}(${PRETTY_NAME:-linux})${C_RESET}"

if [[ -f "$ENV_FILE" ]]; then
  # existing install: keep its settings
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  MODE="update"
  PANEL_PORT="${PORT:-8080}"
  DATA_DIR="${DATA_DIR:-/var/lib/arkpanel}"
  info "Existing installation found, updating it (data in $DATA_DIR)."
else
  [[ "$MODE" == "update" ]] && die "No existing installation found in $ENV_FILE"
  if [[ "$REPO_URL" == *YOUR_GITHUB_USER* && ! -d "$APP_DIR/.git" ]]; then
    die "Set the repository URL first: edit DEFAULT_REPO in install.sh, or run with ARKPANEL_REPO=https://github.com/<you>/<repo>.git"
  fi
  step "Configuration"
  if [[ $INTERACTIVE -eq 0 && -z "${ARKPANEL_YES:-}" ]]; then
    info "No keyboard input available (piped install), using the defaults."
    info "For the interactive installer: curl -fsSL <url>/install.sh -o install.sh && sudo bash install.sh"
  fi
  PANEL_PORT="${ARKPANEL_PORT:-$(ask "Web panel port" "8080")}"
  DATA_DIR="${ARKPANEL_DATA_DIR:-$(ask "Data folder (game servers + backups, needs lots of space)" "/var/lib/arkpanel")}"
  [[ "$PANEL_PORT" =~ ^[0-9]+$ ]] || die "Invalid port: $PANEL_PORT"
  [[ "$DATA_DIR" == /* ]] || die "The data folder must be an absolute path"
fi

# ----------------------------------------------------------------- packages
step "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
dpkg --add-architecture i386
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl git sudo tar gzip xz-utils zstd zip unzip rsync procps python3 \
  lib32gcc-s1 lib32stdc++6 libc6-i386 libfreetype6 libvulkan1 xvfb xauth libgl1 libgl1-mesa-dri >/dev/null
# Libraries Wine/Proton expects on the host (names differ between releases, e.g. the
# Ubuntu 24.04+ "t64" renames), so install them one by one and skip unknown names.
for pkg in libx11-6 libxext6 libxrandr2 libnss3 libdbus-1-3 libudev1 libatomic1 \
           libgnutls30t64 libgnutls30 libglib2.0-0t64 libglib2.0-0; do
  apt-get install -y -qq "$pkg" >/dev/null 2>&1 || true
done
ok "System packages installed"

NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_V="$(node -v | sed 's/^v//; s/\..*//')"
  [[ "$NODE_V" -ge 20 ]] && NODE_OK=1
fi
if [[ $NODE_OK -eq 0 ]]; then
  info "Installing Node.js ${NODE_MAJOR}.x (NodeSource)..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN="$(command -v node)"
ok "Node.js $(node -v)"

# ----------------------------------------------------------------- user & folders
step "Preparing user and folders"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  ok "Created system user '$SERVICE_USER'"
fi
mkdir -p "$DATA_DIR" "$ENV_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"

cat >"$ENV_FILE" <<EOF
# Obelisk configuration (loaded by the panel and the systemd service)
PORT=$PANEL_PORT
HOST=0.0.0.0
DATA_DIR=$DATA_DIR
# Set to 1 when the panel runs behind an HTTPS reverse proxy
TRUST_PROXY=${TRUST_PROXY:-0}
SECURE_COOKIES=${SECURE_COOKIES:-0}
EOF
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"
ok "Config written to $ENV_FILE"

# Kernel settings recommended for running several ARK servers
cat >/etc/sysctl.d/60-arkpanel.conf <<EOF
vm.max_map_count=262144
fs.file-max=1000000
EOF
sysctl --system >/dev/null 2>&1 || true

# ----------------------------------------------------------------- code
step "Downloading the panel"
if [[ -d "$APP_DIR/.git" ]]; then
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
  as_user git -C "$APP_DIR" fetch --quiet origin
  as_user git -C "$APP_DIR" checkout --quiet "$BRANCH" 2>/dev/null || true
  as_user git -C "$APP_DIR" pull --quiet --ff-only || warn "git pull failed (local changes?), keeping the current version"
  ok "Updated to $(as_user git -C "$APP_DIR" rev-parse --short HEAD)"
else
  rm -rf "$APP_DIR"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
  ok "Cloned $REPO_URL"
fi

step "Building the panel (this takes a minute)"
as_user bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent" >/tmp/arkpanel-build.log 2>&1 \
  || { tail -30 /tmp/arkpanel-build.log; die "Build failed, see /tmp/arkpanel-build.log"; }
ok "Panel built"

# ----------------------------------------------------------------- tools
step "Downloading SteamCMD and GE-Proton"
if as_user "$NODE_BIN" "$APP_DIR/server/cli.js" bootstrap 2>&1 | sed 's/^/    /'; then
  ok "Tools ready"
else
  warn "Could not download the tools now. The panel retries automatically (Settings → Tools)."
fi

# ----------------------------------------------------------------- systemd
step "Installing services"
systemctl stop arkpanel 2>/dev/null || true

cat >/etc/systemd/system/arkpanel.service <<EOF
[Unit]
Description=Obelisk (web panel for ARK servers)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $APP_DIR/server/index.js
Restart=always
RestartSec=5
# Only stop the panel itself: game servers keep running while the panel restarts or updates.
KillMode=process
LimitNOFILE=1000000
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

# Saves and stops all game servers cleanly when the machine shuts down.
# Ordered Before= the panel, so on shutdown it runs after the panel has stopped.
cat >/etc/systemd/system/arkpanel-servers.service <<EOF
[Unit]
Description=Obelisk - save and stop game servers on shutdown
Before=arkpanel.service
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$SERVICE_USER
Group=$SERVICE_USER
EnvironmentFile=$ENV_FILE
ExecStart=/bin/true
ExecStop=$NODE_BIN $APP_DIR/server/cli.js stop-all 240
TimeoutStopSec=330

[Install]
WantedBy=multi-user.target
EOF

install -m 755 "$APP_DIR/scripts/arkpanel" /usr/local/bin/arkpanel
systemctl daemon-reload
systemctl enable --quiet arkpanel-servers.service arkpanel.service
systemctl start arkpanel-servers.service
ok "Services installed (arkpanel, arkpanel-servers)"

# ----------------------------------------------------------------- admin user
ADMIN_MSG=""
USER_COUNT="$(as_user "$NODE_BIN" "$APP_DIR/server/cli.js" list-users | grep -vc '^No users' || true)"
if [[ "$USER_COUNT" == "0" ]]; then
  step "Creating the admin account"
  ADMIN_USER="${ARKPANEL_ADMIN_USER:-$(ask "Admin username" "admin")}"
  ADMIN_PASS="${ARKPANEL_ADMIN_PASSWORD:-}"
  if [[ -z "$ADMIN_PASS" && $INTERACTIVE -eq 1 ]]; then
    ADMIN_PASS="$(ask_secret "Admin password (min. 8 characters, empty = generate)")"
  fi
  if [[ -z "$ADMIN_PASS" ]]; then
    ADMIN_PASS="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)"
    ADMIN_MSG="    Password:  ${C_BOLD}${ADMIN_PASS}${C_RESET}   ${C_DIM}(generated, change it under Settings → My account)${C_RESET}"
  fi
  as_user "$NODE_BIN" "$APP_DIR/server/cli.js" create-user "$ADMIN_USER" "$ADMIN_PASS" >/dev/null
  ok "Admin account '$ADMIN_USER' created"
  ADMIN_MSG="    Username:  ${C_BOLD}${ADMIN_USER}${C_RESET}"$'\n'"${ADMIN_MSG}"
fi

systemctl start arkpanel.service
sleep 2
systemctl is-active --quiet arkpanel || { journalctl -u arkpanel -n 30 --no-pager; die "The panel did not start, see the log above."; }

# ----------------------------------------------------------------- firewall
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PANEL_PORT/tcp" >/dev/null && ok "Opened port $PANEL_PORT/tcp in ufw"
  ufw allow 7777:7800/udp >/dev/null && ok "Opened game ports 7777-7800/udp in ufw"
  ufw allow 27015:27030/udp >/dev/null && ok "Opened query ports 27015-27030/udp in ufw (ASE)"
fi

# ----------------------------------------------------------------- done
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "${C_GREEN}${C_BOLD}  Obelisk is ${MODE}ed and running!${C_RESET}"
echo
echo "    Open:      ${C_BOLD}http://${IP:-<server-ip>}:${PANEL_PORT}${C_RESET}"
[[ -n "$ADMIN_MSG" ]] && echo "$ADMIN_MSG"
echo
echo "    Data:      $DATA_DIR"
echo "    Commands:  arkpanel status | logs | restart | update | reset-password <user>"
echo
echo "    ${C_DIM}Forward the game ports of your servers (UDP, e.g. 7777) on your router to this machine.${C_RESET}"
echo "    ${C_DIM}Don't expose the panel port to the internet without HTTPS (see README).${C_RESET}"
echo
}

main "$@"
