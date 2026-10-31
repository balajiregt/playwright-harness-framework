import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { confinedFile, resolveContext } from '../src/context.js';

test('evidence confinement rejects secret files, traversal and external symlinks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'decision-evidence-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'decision-outside-'));
  try {
    await writeFile(path.join(root, 'safe.json'), '{}');
    await writeFile(path.join(root, '.env.local'), 'not-a-real-key');
    await writeFile(path.join(outside, 'other.json'), '{}');
    await symlink(path.join(outside, 'other.json'), path.join(root, 'link.json'));
    assert.equal(await confinedFile(root, 'safe.json'), path.join(root, 'safe.json').replace(/^\/var\//, '/private/var/'));
    await assert.rejects(confinedFile(root, '.env.local'));
    await assert.rejects(confinedFile(root, path.join(outside, 'other.json')));
    await assert.rejects(confinedFile(root, 'link.json'));
  } finally { await rm(root, { recursive: true }); await rm(outside, { recursive: true }); }
});

test('context resolves authored evidence without provider results or credentials', async () => {
  const context = await resolveContext();
  assert.equal(context.items.length, 2);
  assert.match(context.provenance.inputs.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(context).includes('OPENAI_API_KEY'), false);
});
