import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunch } from '../games.js';

const asa = {
  game: 'asa', map: 'TheIsland_WP', sessionName: 'My Island?', maxPlayers: 20, ports: { game: 7777, rcon: 27020 }, mods: [{ id: '928988', enabled: true }],
  crossplay: true, battleye: false, extraArgs: '', extraUrlParams: '',
};
const ctx = { installDir: '/srv/s1', protonDir: '/t/proton/GE-Proton10-34', prefixDir: '/p/s1', steamClientDir: '/t/steam' };

test('ASA default launch: headless proton with WineD3D and Steam app id', () => {
  const l = buildLaunch(asa, { ...ctx, xvfbRun: null });
  assert.equal(l.cmd, '/t/proton/GE-Proton10-34/proton');
  assert.ok(!l.args.includes('-dx11'));
  assert.ok(l.args.includes('-port=7777'));
  assert.equal(l.env.PROTON_USE_WINED3D, '1');
  assert.equal(l.env.SteamAppId, '2430930');
  assert.equal(l.env.STEAM_COMPAT_APP_ID, '2430930');
});

test('ASA with virtual display runs inside xvfb-run with -dx11', () => {
  const l = buildLaunch(asa, { ...ctx, xvfbRun: '/usr/bin/xvfb-run' });
  assert.equal(l.cmd, '/usr/bin/xvfb-run');
  assert.deepEqual(l.args.slice(0, 6), ['-a', '-s', '-screen 0 1024x768x24 -nolisten tcp', '/t/proton/GE-Proton10-34/proton', 'run', '/srv/s1/ShooterGame/Binaries/Win64/ArkAscendedServer.exe']);
  assert.equal(l.args[6], 'TheIsland_WP?listen?SessionName=My Island?Port=7777?RCONEnabled=True?RCONPort=27020');
  for (const a of ['-server', '-dx11', '-mods=928988', '-NoBattlEye', '-WinLiveMaxPlayers=20']) assert.ok(l.args.includes(a), a);
  assert.equal(l.env.PROTON_USE_WINED3D, '1');
  assert.equal(l.env.STEAM_COMPAT_DATA_PATH, '/p/s1');
});

test('map mod is loaded first and not duplicated', () => {
  const l = buildLaunch({ ...asa, mapModId: '988598', mods: [{ id: '111', enabled: true }, { id: '988598', enabled: true }] }, { ...ctx, xvfbRun: null });
  assert.ok(l.args.includes('-mods=988598,111'));
});

test('ASA falls back to plain proton when xvfb is missing', () => {
  const l = buildLaunch(asa, { ...ctx, xvfbRun: null });
  assert.equal(l.cmd, '/t/proton/GE-Proton10-34/proton');
  assert.equal(l.args[0], 'run');
});

test('ASE runs natively without xvfb flags', () => {
  const l = buildLaunch({ ...asa, game: 'ase', map: 'Ragnarok', ports: { game: 7779, query: 27015, rcon: 27021 }, mods: [] }, { ...ctx, xvfbRun: '/usr/bin/xvfb-run' });
  assert.match(l.cmd, /ShooterGameServer$/);
  assert.ok(!l.args.includes('-dx11'));
  assert.match(l.args[0], /QueryPort=27015/);
});
