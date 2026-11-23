import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGeminiTtsSpeechPayload,
  getEmotionBaseProsody,
  splitVietnameseProsodyChunks,
} from './speechProsody';

test('splitVietnameseProsodyChunks creates real pause beats on ellipses, dashes, and exclamations', () => {
  const chunks = splitVietnameseProsodyChunks(
    'Hì hì... chàng đi vội thế — đêm nay lại ôm gối ra hiên ngắm trăng rồi nha!',
    'amused',
  );
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].text, 'Hì hì');
  assert.equal(chunks[0].isInterjection, true);
  assert.equal(chunks[0].pauseAfterMs, 360);
  assert.ok(chunks[0].pitchOffset > 0.05);

  assert.equal(chunks[1].text, 'chàng đi vội thế');
  assert.equal(chunks[1].pauseAfterMs, 300);

  assert.equal(chunks[2].text, 'đêm nay lại ôm gối ra hiên ngắm trăng rồi nha!');
  assert.equal(chunks[2].pauseAfterMs, 0);
});

test('splitVietnameseProsodyChunks sub-splits long Vietnamese sentences on commas for breathing room', () => {
  const chunks = splitVietnameseProsodyChunks(
    'Ái chà chàng ơi, quân tốt vừa mất khiến đại cục của chàng chao đảo rồi đấy, liệu đêm nay chàng muốn nắm tay thiếp không?',
    'check',
  );
  assert.ok(chunks.length >= 3, `Expected >= 3 chunks, got ${chunks.length}`);
  assert.ok(chunks[0].pauseAfterMs >= 165);
  assert.equal(chunks[chunks.length - 1].pauseAfterMs, 0);
  assert.ok(chunks[chunks.length - 1].text.endsWith('?'));
  assert.ok(chunks[chunks.length - 1].pitchOffset > 0);
});

test('buildGeminiTtsSpeechPayload injects vocal bursts only for gemini-3.8-flash-tts and keeps style in metadata', () => {
  const flagship = buildGeminiTtsSpeechPayload(
    'Hì hì... chàng để hở sườn — thiếp không khách sáo đâu nha!',
    'amused',
    'gemini-3.8-flash-tts',
  );
  assert.ok(flagship.text.includes('<laugh>'));
  assert.ok(flagship.text.includes('<breath>'));
  assert.ok(flagship.style.toLowerCase().includes('vietnamese'));
  // Ensure zero English directorial words leaked into spoken text
  assert.ok(!flagship.text.includes('Vietnamese'));

  const lite = buildGeminiTtsSpeechPayload(
    'Hì hì... chàng để hở sườn — thiếp không khách sáo đâu nha!',
    'amused',
    'gemini-3.8-flash-lite-tts',
  );
  assert.ok(!lite.text.includes('<laugh>'));
  assert.ok(!lite.text.includes('<breath>'));
  assert.ok(lite.style.length > 20);
});

test('getEmotionBaseProsody differentiates thinking vs surprised pacing cleanly', () => {
  const thinking = getEmotionBaseProsody('thinking');
  const surprised = getEmotionBaseProsody('surprised');
  assert.ok(thinking.baseRate < surprised.baseRate);
  assert.ok(thinking.basePitch < surprised.basePitch);
});
