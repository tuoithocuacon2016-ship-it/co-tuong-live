import assert from 'node:assert/strict';
import test from 'node:test';
import { computeResponsiveBoardCamera } from './boardCamera';

function elevationDeg(pose: {
  posY: number;
  posZ: number;
  targetY: number;
  targetZ: number;
}): number {
  const dy = pose.posY - pose.targetY;
  const dz = Math.abs(pose.posZ - pose.targetZ);
  return (Math.atan2(dy, dz) * 180) / Math.PI;
}

test('Mobile split portrait (390x472) uses steep overhead readability angle (>= 67°) and full-width framing', () => {
  const pose = computeResponsiveBoardCamera({
    paneWidth: 390,
    paneHeight: 472,
    fovDeg: 38,
    layoutMode: 'split_mobile',
    preset: 'liveBot',
  });

  const elev = elevationDeg(pose);
  assert.ok(
    elev >= 67 && elev <= 73,
    `Mobile portrait elevation should be steep (~69°) so pieces stay round, got ${elev.toFixed(1)}°`,
  );

  // Verify board horizontal extent fits inside horizontal frustum (no side clipping!)
  const dist = Math.hypot(pose.posY - pose.targetY, pose.posZ - pose.targetZ);
  const aspect = 390 / 472;
  const tanHalfH = Math.tan((38 * Math.PI) / 360) * aspect;
  const visibleHalfW = dist * tanHalfH;
  assert.ok(
    visibleHalfW >= 2.1,
    `Board half-width (2.1) must fit inside mobile visibleHalfW (${visibleHalfW.toFixed(2)})`,
  );
  // And should fill >= 82% of viewport width (not tiny!)
  assert.ok(
    2.1 / visibleHalfW >= 0.82,
    `Board should fill at least 82% of mobile width, got ${((2.1 / visibleHalfW) * 100).toFixed(1)}%`,
  );
});

test('TikTok 9:16 lower board pane (410x500) frames board steeply above the 2-line commentary overlay', () => {
  const pose = computeResponsiveBoardCamera({
    paneWidth: 410,
    paneHeight: 500,
    fovDeg: 38,
    layoutMode: 'tiktok',
    preset: 'liveBot',
  });

  const elev = elevationDeg(pose);
  assert.ok(
    elev >= 66 && elev <= 72,
    `TikTok 9:16 elevation should be ~68°, got ${elev.toFixed(1)}°`,
  );
  // Positive targetZ shifts board upward above bottom TikTok chat/commentary strip
  assert.ok(pose.targetZ > 0.4, `Expected positive targetZ bias for TikTok overlay clearance`);
});

test('Desktop widescreen split (864x900) leaves clearance for BottomControlDock and keeps board centered', () => {
  const desktopPose = computeResponsiveBoardCamera({
    paneWidth: 864,
    paneHeight: 900,
    fovDeg: 38,
    layoutMode: 'split_desktop',
    preset: 'liveBot',
  });

  const elev = elevationDeg(desktopPose);
  assert.ok(elev >= 60 && elev <= 68, `Desktop split elevation should be ~64°, got ${elev.toFixed(1)}°`);
  assert.equal(desktopPose.posX, 0);
  assert.ok(desktopPose.targetZ > 0.5, 'Desktop split should shift board above bottom dock');
});

test('Cinematic duel and guest presets preserve distinct stylized perspectives', () => {
  const duel = computeResponsiveBoardCamera({
    paneWidth: 864,
    paneHeight: 900,
    fovDeg: 38,
    layoutMode: 'split_desktop',
    preset: 'duel',
  });
  const guest = computeResponsiveBoardCamera({
    paneWidth: 864,
    paneHeight: 900,
    fovDeg: 38,
    layoutMode: 'split_desktop',
    preset: 'guest',
  });

  assert.ok(duel.posX > 4, 'Duel camera should be angled from the side');
  assert.equal(guest.posX, 0);
  assert.ok(guest.posZ > 4.5);
});
