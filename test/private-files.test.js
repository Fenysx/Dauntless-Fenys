'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findPrivatePaths } = require('../scripts/check-private-files.cjs');

test('detector sinaliza caminhos de credenciais e dados privados', () => {
  const files = [
    'senha/account.key',
    'config/client_secret-prod.json',
    'runtime/server/.env',
    'runtime/server/player.sqlite3',
    'server/.env.production',
  ];
  assert.deepEqual(findPrivatePaths(files), files);
});

test('detector permite templates e arquivos-fonte comuns', () => {
  const files = [
    'server/.env.example',
    'src/fenys-google-auth.js',
    'test/fixtures/schema.sql',
  ];
  assert.deepEqual(findPrivatePaths(files), []);
});
