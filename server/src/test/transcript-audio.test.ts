import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

test('audio worklet downmixes, resamples PCM and flushes final short audio', () => {
  let Processor: any;
  const messages: any[] = [];
  class Base { port = { onmessage: (_value: any) => {}, postMessage: (value: any) => messages.push(value) }; }
  runInNewContext(readFileSync(resolve(__dirname, '../../../client/public/audio/transcript-processor.js'), 'utf8'), {
    AudioWorkletProcessor: Base, sampleRate: 48000,
    registerProcessor: (_name: string, ctor: any) => { Processor = ctor; },
  });
  const processor = new Processor();
  processor.process([[new Float32Array(144000).fill(0.5), new Float32Array(144000).fill(0.25)]]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].audio.byteLength, 96000);
  assert.equal(messages[0].duration, 3);
  assert.equal(new DataView(messages[0].audio).getInt16(0, true), Math.round(0.375 * 32767));
  processor.process([[new Float32Array(24000).fill(-1)]]);
  processor.port.onmessage({ data: 'flush' });
  assert.equal(messages[1].audio.byteLength, 16000);
  assert.equal(messages[1].duration, 0.5);
  assert.equal(messages[2].flushed, true);
});
