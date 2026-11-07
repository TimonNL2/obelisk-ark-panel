import path from 'node:path';
import { splitArgs } from './util/exec.js';

export const GAMES = {
  asa: {
    id: 'asa',
    name: 'ARK: Survival Ascended',
    short: 'ASA',
    appId: '2430930',
    windowsOnly: true, // runs through GE-Proton on Linux
    binary: 'ShooterGame/Binaries/Win64/ArkAscendedServer.exe',
    configDir: 'ShooterGame/Saved/Config/WindowsServer',
    defaultMaxPlayers: 70,
    usesQueryPort: false,
    maps: [
      { id: 'TheIsland_WP', name: 'The Island' },
      { id: 'ScorchedEarth_WP', name: 'Scorched Earth' },
      { id: 'TheCenter_WP', name: 'The Center' },
      { id: 'Aberration_WP', name: 'Aberration' },
      { id: 'Extinction_WP', name: 'Extinction' },
      { id: 'Ragnarok_WP', name: 'Ragnarok' },
      { id: 'Valguero_WP', name: 'Valguero' },
      { id: 'Astraeos_WP', name: 'Astraeos', modHint: '988598', note: 'Some hosts need the Astraeos map mod (988598). Only add it if the map does not load without it.' },
      { id: 'LostColony_WP', name: 'Lost Colony' },
    ],
  },
  ase: {
    id: 'ase',
    name: 'ARK: Survival Evolved',
    short: 'ASE',
    appId: '376030',
    windowsOnly: false,
    binary: 'ShooterGame/Binaries/Linux/ShooterGameServer',
    configDir: 'ShooterGame/Saved/Config/LinuxServer',
    defaultMaxPlayers: 70,
    usesQueryPort: true,
    maps: [
      { id: 'TheIsland', name: 'The Island' },
      { id: 'TheCenter', name: 'The Center' },
      { id: 'ScorchedEarth_P', name: 'Scorched Earth' },
      { id: 'Ragnarok', name: 'Ragnarok' },
      { id: 'Aberration_P', name: 'Aberration' },
      { id: 'Extinction', name: 'Extinction' },
      { id: 'Valguero_P', name: 'Valguero' },
      { id: 'Genesis', name: 'Genesis: Part 1' },
      { id: 'CrystalIsles', name: 'Crystal Isles' },
      { id: 'Gen2', name: 'Genesis: Part 2' },
      { id: 'LostIsland', name: 'Lost Island' },
      { id: 'Fjordur', name: 'Fjordur' },
    ],
  },
};

export const gameOf = (server) => GAMES[server.game];
export const mapName = (server) => {
  const m = gameOf(server)?.maps.find((x) => x.id === server.map);
  return m ? m.name : server.map;
};
export const configPath = (installDir, server, file) => path.join(installDir, gameOf(server).configDir, file);

/** Map mod (if any) first, then the enabled mods in load order, without duplicates. */
const enabledMods = (server) => {
  const ids = (server.mods || []).filter((m) => m.enabled !== false && String(m.id).trim()).map((m) => String(m.id).trim());
  const mapMod = String(server.mapModId || '').trim();
  return mapMod ? [mapMod, ...ids.filter((id) => id !== mapMod)] : ids;
};

/** Windows path for a Linux directory as seen from inside Wine/Proton (Z: maps to /). */
const winePath = (p) => `Z:${p.replace(/\//g, '\\')}`;

/**
 * Build the executable + arguments for a server.
 * ctx: { installDir, clusterDir, cluster, protonDir, prefixDir, steamClientDir }
 */
export function buildLaunch(server, ctx) {
  const game = gameOf(server);
  const exe = path.join(ctx.installDir, game.binary);
  const mods = enabledMods(server);
  const extraUrl = (server.extraUrlParams || '').trim();
  const url = [
    server.map,
    'listen',
    // ASA ignores SessionName from GameUserSettings.ini on start; pass it in the URL ("?" would break the URL)
    `SessionName=${String(server.sessionName || server.name).replace(/[?"]/g, '')}`,
    `Port=${server.ports.game}`,
    game.usesQueryPort ? `QueryPort=${server.ports.query}` : null,
    'RCONEnabled=True',
    `RCONPort=${server.ports.rcon}`,
    server.game === 'ase' ? `MaxPlayers=${server.maxPlayers}` : null,
  ].filter(Boolean).join('?') + (extraUrl ? (extraUrl.startsWith('?') ? extraUrl : `?${extraUrl}`) : '');

  const args = [url];

  if (server.game === 'asa') {
    args.push(`-WinLiveMaxPlayers=${server.maxPlayers}`);
    args.push('-servergamelog');
    if (mods.length) args.push(`-mods=${mods.join(',')}`);
    if (server.crossplay !== false) args.push('-ServerPlatform=PC+XSX+WINGDK+PS5');
    args.push(`-port=${server.ports.game}`);
    // Optional fallback: run inside a virtual display with DX11 (off by default; the
    // verified working setup runs headless with WineD3D and the steamclient links).
    if (ctx.xvfbRun) args.push('-server', '-dx11');
  } else {
    args.push('-server', '-log');
    if (mods.length) args.push('-automanagedmods');
    if (server.crossplay) args.push('-crossplay');
  }

  if (!server.battleye) args.push('-NoBattlEye');

  if (ctx.cluster) {
    args.push(`-clusterid=${ctx.cluster.clusterKey}`);
    args.push(`-ClusterDirOverride=${server.game === 'asa' ? winePath(ctx.clusterDir) : ctx.clusterDir}`);
    args.push('-NoTransferFromFiltering');
  }

  args.push(...splitArgs(server.extraArgs));

  if (server.game === 'asa') {
    const proton = [path.join(ctx.protonDir, 'proton'), 'run', exe, ...args];
    // Run inside a virtual X display. "-a" picks a free display number per server.
    const wrapped = ctx.xvfbRun
      ? [ctx.xvfbRun, '-a', '-s', '-screen 0 1024x768x24 -nolisten tcp', ...proton]
      : proton;
    return {
      cmd: wrapped[0],
      args: wrapped.slice(1),
      cwd: path.dirname(exe),
      env: {
        STEAM_COMPAT_DATA_PATH: ctx.prefixDir,
        STEAM_COMPAT_CLIENT_INSTALL_PATH: ctx.steamClientDir,
        WINEDEBUG: '-all',
        PROTON_LOG: '0',
        PROTON_USE_WINED3D: '1', // OpenGL-based renderer instead of DirectX 12 / Vulkan
        PROTON_USE_XALIA: '0', // accessibility helper, fails without a real display
        DXVK_HUD: '0',
        SteamAppId: game.appId,
        SteamGameId: game.appId,
        STEAM_COMPAT_APP_ID: game.appId,
      },
      exe,
    };
  }
  return {
    cmd: exe,
    args,
    cwd: path.dirname(exe),
    env: { LD_LIBRARY_PATH: path.join(ctx.installDir, 'Engine/Binaries/Linux') },
    exe,
  };
}

/** Values the panel always writes into GameUserSettings.ini before starting. */
export function managedGusValues(server) {
  const values = {
    ServerSettings: {
      RCONEnabled: 'True',
      RCONPort: String(server.ports.rcon),
      ServerAdminPassword: server.adminPassword,
      ServerPassword: server.serverPassword || '',
    },
    SessionSettings: {
      SessionName: server.sessionName,
      Port: String(server.ports.game),
    },
    '/Script/Engine.GameSession': {
      MaxPlayers: String(server.maxPlayers),
    },
  };
  if (server.game === 'ase') {
    values.SessionSettings.QueryPort = String(server.ports.query);
    const mods = enabledMods(server);
    values.ServerSettings.ActiveMods = mods.length ? mods.join(',') : null;
  }
  if (server.motd) {
    values.MessageOfTheDay = { Message: server.motd, Duration: String(server.motdDuration || 30) };
  }
  return values;
}
