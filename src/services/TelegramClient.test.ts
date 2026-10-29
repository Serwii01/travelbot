import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMessage } from './TelegramClient.js';

test('splitMessage: texto corto no se parte', () => {
  assert.deepEqual(splitMessage('hola'), ['hola']);
});

test('splitMessage: parte por bloques sin pasar del limite', () => {
  const block = 'x'.repeat(40);
  const text = Array.from({ length: 5 }, () => block).join('\n\n');
  const chunks = splitMessage(text, 100);
  assert.ok(chunks.every((c) => c.length <= 100));
  assert.equal(chunks.join('\n\n'), text);
});

test('splitMessage: bloque mas largo que el limite se corta', () => {
  const chunks = splitMessage('y'.repeat(250), 100);
  assert.deepEqual(chunks.map((c) => c.length), [100, 100, 50]);
});
