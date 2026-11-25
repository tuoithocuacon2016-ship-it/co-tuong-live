import assert from 'node:assert/strict';
import test from 'node:test';
import { createChallenger } from '../engine/matchmaker';
import { buildStatusModalCopy } from './StatusModal';

const bridal = createChallenger('@KiemKhach_VN', 'local:bridal', 'nam', 26);

test('game-over modal keeps the bridal identity and dowry concession for the young groom', () => {
  const redWin = buildStatusModalCopy({
    mode: 'gameover',
    status: 'red_win',
    challenger: bridal,
  });
  assert.equal(redWin.headline, 'Chàng @KiemKhach_VN Toàn Thắng!');
  assert.match(redWin.subtitle, /Chàng thắng trọn ván cờ hoa chúc/);
  assert.match(redWin.subtitle, /hai họ làm chứng/);
  assert.match(redWin.subtitle, /thiếp giao lại một lớp hồi môn/);

  const blackWin = buildStatusModalCopy({
    mode: 'gameover',
    status: 'black_win',
    challenger: bridal,
  });
  assert.equal(blackWin.headline, 'Tân Nương Áo Đỏ Đắc Thắng!');
  assert.match(blackWin.subtitle, /chàng tự giác ôm gối ra hành lang ngắm trăng/);

  const draw = buildStatusModalCopy({
    mode: 'gameover',
    status: 'draw',
    challenger: bridal,
  });
  assert.equal(draw.headline, 'Phu Thê Bất Phân Thắng Bại');
});

test('game-over modal addresses female and elder challengers without bridal honorifics', () => {
  const profiles = [
    { gender: 'nu' as const, age: 24, guestCap: 'Muội', self: 'tỷ' },
    { gender: 'nu' as const, age: 38, guestCap: 'Tỷ tỷ', self: 'Điêu Nguyệt' },
    { gender: 'nam' as const, age: 62, guestCap: 'Tiền bối', self: 'tiểu nữ' },
  ];

  for (const profile of profiles) {
    const challenger = createChallenger('@KiemKhach_VN', `local:${profile.guestCap}`, profile.gender, profile.age);
    const redWin = buildStatusModalCopy({ mode: 'gameover', status: 'red_win', challenger });
    assert.ok(redWin.headline.includes(profile.guestCap));
    assert.ok(redWin.subtitle.includes(profile.self));
    assert.match(redWin.subtitle, /một chén trà thơm/);

    const blackWin = buildStatusModalCopy({ mode: 'gameover', status: 'black_win', challenger });
    assert.match(blackWin.subtitle, /ba chén trà sen/);

    const draw = buildStatusModalCopy({ mode: 'gameover', status: 'draw', challenger });
    assert.equal(draw.headline, 'Kỳ Phùng Địch Thủ');
    assert.match(draw.subtitle, /hai kỳ thủ hòa khí/);

    for (const copy of [redWin, blackWin, draw]) {
      assert.doesNotMatch(`${copy.headline} ${copy.subtitle}`, /chàng|thiếp|phu thê|hai họ/i);
    }
  }
});

test('referee subtitles keep their ruling and use the current audience profile', () => {
  const challenger = createChallenger('@TieuYenNhi_99', 'local:referee', 'nu', 24);
  const repetition = buildStatusModalCopy({
    mode: 'gameover',
    status: 'draw',
    statusReason: 'repetition_draw',
    challenger,
  });
  assert.match(repetition.subtitle, /cả phòng live làm chứng/);
  assert.doesNotMatch(repetition.subtitle, /hai họ/i);

  const perpetual = buildStatusModalCopy({
    mode: 'gameover',
    status: 'red_win',
    statusReason: 'perpetual_check',
    challenger,
  });
  assert.equal(perpetual.subtitle, 'Phạm luật Trường Chiếu — Đổi nước khác kẻo bị xử thua!');

  const sixty = buildStatusModalCopy({
    mode: 'gameover',
    status: 'draw',
    statusReason: 'sixty_move_draw',
    challenger,
  });
  assert.match(sixty.subtitle, /120 nửa nước/);
});

test('pause copy stays independent of the game result', () => {
  const copy = buildStatusModalCopy({
    mode: 'paused',
    status: 'red_win',
    statusReason: 'checkmate',
    challenger: bridal,
  });
  assert.equal(copy.headline, 'Tạm Dừng Kỳ Đài');
  assert.match(copy.subtitle, /Phiên phát sóng đang tạm nghỉ/);
});
