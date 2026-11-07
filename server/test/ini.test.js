import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setIniValues, parseIni, getIniValue } from '../util/ini.js';

test('creates a section when missing', () => {
  const out = setIniValues('', 'ServerSettings', { XPMultiplier: '2' });
  assert.equal(out, '[ServerSettings]\nXPMultiplier=2\n');
});

test('replaces existing keys in place, case-insensitive, and keeps other lines', () => {
  const src = '[ServerSettings]\r\n; comment\r\nxpmultiplier=1\r\nOther=3\r\n\r\n[SessionSettings]\r\nSessionName=old\r\n';
  const out = setIniValues(src, 'serversettings', { XPMultiplier: '5', NewKey: 'True' });
  assert.equal(out, '[ServerSettings]\r\n; comment\r\nXPMultiplier=5\r\nOther=3\r\nNewKey=True\r\n\r\n[SessionSettings]\r\nSessionName=old\r\n');
});

test('removes keys when value is null', () => {
  const out = setIniValues('[A]\nX=1\nY=2\n', 'A', { X: null });
  assert.equal(out, '[A]\nY=2\n');
});

test('leaves duplicate keys in other sections alone', () => {
  const src = '[/script/shootergame.shootergamemode]\nOverridePlayerLevelEngramPoints=5\nOverridePlayerLevelEngramPoints=6\n';
  const out = setIniValues(src, '/script/shootergame.shootergamemode', { BabyMatureSpeedMultiplier: '10' });
  assert.match(out, /OverridePlayerLevelEngramPoints=5\nOverridePlayerLevelEngramPoints=6\nBabyMatureSpeedMultiplier=10/);
});

test('parses and looks up values', () => {
  const parsed = parseIni('﻿[ServerSettings]\nXPMultiplier=2.5\n[SessionSettings]\nSessionName=My Server\n');
  assert.equal(getIniValue(parsed, 'serversettings', 'xpmultiplier'), '2.5');
  assert.equal(getIniValue(parsed, 'SessionSettings', 'SessionName'), 'My Server');
  assert.equal(getIniValue(parsed, 'Missing', 'x'), undefined);
});
