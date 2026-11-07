import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_SETTINGS, PRESETS, normaliseOverrides } from '../gameSettings.js';
import { setIniValues, parseIni, getIniValue } from '../util/ini.js';

test('catalog has no duplicate keys', () => {
  const seen = new Set();
  for (const d of GAME_SETTINGS) {
    const k = `${d.file}|${d.key.toLowerCase()}`;
    assert.ok(!seen.has(k), `duplicate ${k}`);
    seen.add(k);
  }
  assert.ok(GAME_SETTINGS.length > 150);
});

test('presets only reference catalog keys', () => {
  const keys = new Set(GAME_SETTINGS.map((d) => d.key));
  for (const p of PRESETS) for (const k of Object.keys(p.values)) assert.ok(keys.has(k), `${p.id}: ${k}`);
});

test('array-style stat keys round-trip through the INI writer', () => {
  const ov = normaliseOverrides({ 'Game.ini': { '/script/shootergame.shootergamemode': { 'PerLevelStatsMultiplier_Player[7]': '5' } } });
  const text = setIniValues('', '/script/shootergame.shootergamemode', ov['Game.ini']['/script/shootergame.shootergamemode']);
  assert.match(text, /PerLevelStatsMultiplier_Player\[7\]=5/);
  const again = setIniValues(text, '/script/shootergame.shootergamemode', { 'PerLevelStatsMultiplier_Player[7]': '10', 'PerLevelStatsMultiplier_Player[1]': '2' });
  assert.equal(getIniValue(parseIni(again), '/script/shootergame.shootergamemode', 'PerLevelStatsMultiplier_Player[7]'), '10');
  assert.equal((again.match(/Player\[7\]/g) || []).length, 1);
});
