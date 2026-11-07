# Obelisk — ARK server panel

Obelisk is a simple, self-hosted web panel for running **ARK: Survival Ascended** and **ARK: Survival Evolved** dedicated servers and clusters on Linux.

Think Pelican / Pterodactyl, but built for one job only: no eggs, no Docker, no Wings. One install script, one service, everything managed from the browser.

## Features

- **ASA and ASE** – ASA runs through GE-Proton (downloaded automatically), ASE runs natively.
- **One-click servers** – pick a game, a map and a name; the panel picks free ports, downloads the game with SteamCMD and writes the config.
- **Clusters** – group servers into a cluster to allow character / dino / item transfers. Start, stop, restart, update and broadcast to the whole cluster at once.
- **Live console** – game log + panel/SteamCMD output streamed over websockets, with an RCON command line (history, quick commands).
- **Players** – see who is online, kick, ban, unban, broadcast messages.
- **Game settings form** – rates, breeding, structures, PvE/PvP… written to the INI files on every start so ARK can't overwrite them.
- **Config editor** – edit `GameUserSettings.ini` and `Game.ini` directly in the browser.
- **Mods** – CurseForge IDs (ASA) or Workshop IDs (ASE), with load order.
- **File manager** – browse, edit, upload (drag & drop, folders), download, rename, delete, zip / unzip.
- **Backups** – manual and scheduled `.tar.gz` backups of the save data, one-click restore (with automatic safety backup), retention.
- **Schedules** – daily restarts with in-game countdown, backups, update checks, broadcasts, RCON commands; per server or per cluster.
- **Auto-update** – detects new Steam builds, warns players, updates and restarts.
- **Crash recovery** – restarts crashed servers (with crash-loop protection) and auto-starts servers on boot.
- **Survives panel restarts** – game servers keep running while the panel restarts or updates.
- **Multiple users**, login rate-limiting, CSRF protection.

## Requirements

- **Ubuntu Server 22.04 / 24.04** (or Debian 12) on **x86_64**
- **RAM:** ~12–16 GB per ASA server, ~6–8 GB per ASE server
- **Disk:** ~15 GB per ASA server + saves/backups (ASE ~25 GB). SSD strongly recommended.
- **CPU:** a modern CPU with good single-core performance

### Running on Proxmox

Use a **VM** (not an LXC container) with Ubuntu Server:

- **CPU type: `host`** – important! The default `kvm64`/`x86-64-v2-AES` CPU types can miss instructions ASA needs, which makes it crash on start.
- Give it enough RAM (see above) and a large enough disk, or add a second disk and use it as data folder during install.
- Enable the QEMU guest agent if you like (`apt install qemu-guest-agent`).

## Install

On a fresh Ubuntu Server, download the installer and run it:

```bash
curl -fsSL https://raw.githubusercontent.com/TimonNL2/obelisk-ark-panel/main/install.sh -o install.sh
sudo bash install.sh
```

Prefer a one-liner? This works too, but it can't ask questions (it uses the defaults: port 8080, data in `/var/lib/arkpanel`, user `admin` with a generated password that is printed at the end):

```bash
curl -fsSL https://raw.githubusercontent.com/TimonNL2/obelisk-ark-panel/main/install.sh | sudo bash
```

The installer:

1. installs the required packages and Node.js,
2. creates a system user `arkpanel`,
3. downloads the panel to `/opt/arkpanel` and builds it,
4. downloads SteamCMD and GE-Proton,
5. asks for the panel port, data folder and admin account,
6. installs and starts the `arkpanel` systemd service.

Then open `http://<server-ip>:8080` and log in.

Unattended install:

```bash
curl -fsSL https://raw.githubusercontent.com/TimonNL2/obelisk-ark-panel/main/install.sh | sudo ARKPANEL_YES=1 ARKPANEL_ADMIN_PASSWORD='choose-a-password' bash
```

Other variables: `ARKPANEL_PORT`, `ARKPANEL_DATA_DIR`, `ARKPANEL_ADMIN_USER`, `ARKPANEL_REPO`, `ARKPANEL_BRANCH`.

## First server

1. **Dashboard → New server**, choose ASA or ASE, a name and a map. Keep “Download the game files now” on.
2. Watch the download in the **Console** tab.
3. Click **Start**. ASA needs a few minutes to boot (longer the very first time). The status turns *Online* when RCON answers.
4. **Forward the game port (UDP)** of the server on your router to the VM (e.g. `7777/udp`). ASE also needs the next port (`7778/udp`) and its query port (`27015/udp`). The RCON port does not need to be forwarded.
5. Connect in-game with the address shown on the server page, or find the session name in the server browser.

## Clusters

1. **Clusters → New cluster**, choose the game.
2. Add servers with **different maps** to the cluster (*New server in this cluster*, or move existing servers).
3. Start them. The panel sets `-clusterid`, `-ClusterDirOverride` (a shared folder per cluster) and `-NoTransferFromFiltering` for you.

Each server in the cluster needs its own game port forwarded.

## Commands

```bash
sudo arkpanel status              # is the panel running?
sudo arkpanel logs                # follow the panel log
sudo arkpanel restart             # restart the panel (game servers keep running)
sudo arkpanel update              # update to the latest version
sudo arkpanel reset-password admin
sudo arkpanel create-user friend
sudo arkpanel stop-servers        # save + stop all game servers
sudo arkpanel uninstall
```

You can also update the panel from **Settings → About & update**.

## HTTPS / remote access

The panel speaks plain HTTP. Keep it on your LAN or VPN, or put it behind an HTTPS reverse proxy. Example with [Caddy](https://caddyserver.com):

```
panel.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

When using a proxy, set `TRUST_PROXY=1` and `SECURE_COOKIES=1` in `/etc/arkpanel/arkpanel.env` and run `sudo arkpanel restart`. A Cloudflare Tunnel, Tailscale or WireGuard works great too.

## Where things live

| Path | What |
| --- | --- |
| `/opt/arkpanel` | Panel code |
| `/etc/arkpanel/arkpanel.env` | Port, data folder, proxy settings |
| `<data>/panel.json` | Panel database (servers, users, schedules) |
| `<data>/servers/<id>/` | Game files + saves of each server |
| `<data>/clusters/<id>/` | Shared cluster transfer folder |
| `<data>/backups/` | Backups |
| `<data>/tools/` | SteamCMD and GE-Proton |
| `<data>/logs/<id>.log` | Console log per server |

The default data folder is `/var/lib/arkpanel`.

## How it works

- The panel is a Node.js app (Express + WebSocket) with a React interface, running as the `arkpanel` user.
- Game servers are started as detached processes tagged with an environment variable. The panel finds them through `/proc`, so it can re-attach after a restart, measure CPU/RAM and stop the full process tree (Proton → Wine → server).
- Stopping a server sends `SaveWorld` + `DoExit` over RCON and waits; only if that fails does it terminate the process.
- On machine shutdown, `arkpanel-servers.service` saves and stops all game servers cleanly.
- Panel-managed INI values (session name, ports, passwords, RCON, max players, game settings form) are written right before each start.

## Troubleshooting

- **ASA crashes immediately on Proxmox** – set the VM CPU type to `host`.
- **ASA exits a few seconds after "ARK Version"** – recent ASA builds need a display. Obelisk runs ASA inside Xvfb with `PROTON_USE_WINED3D=1` and `-dx11`; make sure `xvfb` is installed (`sudo arkpanel update` installs it).
- **Server stuck on “Starting”** – check the Console. The first ASA start takes long. If RCON never answers, check that the RCON port isn't used by something else.
- **Players can't connect** – forward the game port as UDP to the VM and check the VM firewall (`sudo ufw status`).
- **SteamCMD errors** – use *Validate game files* in the server's ⋮ menu, or reinstall SteamCMD under Settings → Tools.
- **Forgot the password** – `sudo arkpanel reset-password <user>`.

## Development

```bash
npm install
npm run dev:server   # API on :8080 (uses ./data as data folder)
npm run dev:web      # Vite dev server on :5173 with proxy to the API
npm test
```

Create a user for development with `node server/cli.js create-user admin <password>`. Starting game servers only works on Linux.

## License

MIT
