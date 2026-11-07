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
      { id: 'Astraeos_WP', name: 'Astraeos' },
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

const enabledMods = (server) => (server.mods || []).filter((m) => m.enabled !== false && String(m.id).trim()).map((m) => String(m.id).trim());

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
    return {
      cmd: path.join(ctx.protonDir, 'proton'),
      args: ['run', exe, ...args],
      cwd: path.dirname(exe),
      env: {
        STEAM_COMPAT_DATA_PATH: ctx.prefixDir,
        STEAM_COMPAT_CLIENT_INSTALL_PATH: ctx.steamClientDir,
        WINEDEBUG: '-all',
        PROTON_LOG: '0',
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
