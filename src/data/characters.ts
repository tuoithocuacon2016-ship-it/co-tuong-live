export type GuestGender = 'nam' | 'nu';

export type HairStyle3D =
  | 'topknot'
  | 'bambooHat'
  | 'elderCrown'
  | 'ironBand'
  | 'twinBuns'
  | 'phoenixPin'
  | 'crescentCrown'
  | 'elderBun';

export type BeardStyle3D = 'none' | 'goatee' | 'longWhite';

export interface WuxiaCharacterProfile {
  id: string;
  name: string;
  title: string;
  gender: GuestGender;
  ageMin: number;
  ageMax: number;
  ageLabel: string;
  sect: string;
  bio: string;
  // 3D appearance palette & geometry traits
  skinColor: number;
  robePrimary: number;
  robeSecondary: number;
  trimColor: number;
  hairColor: number;
  accentGlow: number;
  hairStyle: HairStyle3D;
  beardStyle: BeardStyle3D;
  shoulderScale: number;
  headScale: number;
  auraHex: string;
}

export const BOT_MASTER_PROFILE = {
  id: 'bot_ky_ma_dieu_nguyet',
  name: 'Kỳ Ma Điêu Nguyệt',
  title: 'Tân Nương Áo Đỏ · Đêm Hoa Chúc',
  sect: 'Hoa Chúc Kỳ Các',
  gender: 'nu' as GuestGender,
  skinColor: 0xdcaf95,
  robePrimary: 0x6e0f1c,
  robeSecondary: 0x1b121c,
  trimColor: 0xe6be63,
  hairColor: 0x141118,
  accentGlow: 0xff5a6e,
  auraHex: '#e6be63',
};

export const GUEST_CHARACTER_ROSTER: WuxiaCharacterProfile[] = [
  // MALE (NAM) - 6 distinct martial archetypes across age brackets
  {
    id: 'nam_thieu_nien_thanh_van',
    name: 'Lâm Thanh Vân',
    title: 'Thanh Vân Tiểu Kiếm Khách',
    gender: 'nam',
    ageMin: 12,
    ageMax: 20,
    ageLabel: '14–20 tuổi',
    sect: 'Thanh Vân Môn',
    bio: 'Thiếu niên anh tuấn, khai cuộc tốc chiến sắc bén như kiếm mới ra vỏ.',
    skinColor: 0xefd3ba,
    robePrimary: 0x1f4959,
    robeSecondary: 0xdbe6ea,
    trimColor: 0x76b8c4,
    hairColor: 0x17181f,
    accentGlow: 0x52c4d6,
    hairStyle: 'topknot',
    beardStyle: 'none',
    shoulderScale: 0.94,
    headScale: 0.98,
    auraHex: '#52c4d6',
  },
  {
    id: 'nam_thu_sinh_bach_ngoc',
    name: 'Tô Bạch Ngọc',
    title: 'Bạch Y Kỳ Sinh',
    gender: 'nam',
    ageMin: 21,
    ageMax: 27,
    ageLabel: '21–27 tuổi',
    sect: 'Thư Viện Giang Nam',
    bio: 'Thư sinh nho nhã, lấy nhu khắc cương, giỏi bình phong mã hóa giải sát chiêu.',
    skinColor: 0xf1d6be,
    robePrimary: 0xd8d2c5,
    robeSecondary: 0x2c4251,
    trimColor: 0xc29b57,
    hairColor: 0x18171c,
    accentGlow: 0x8cd1b8,
    hairStyle: 'topknot',
    beardStyle: 'none',
    shoulderScale: 0.96,
    headScale: 1.0,
    auraHex: '#8cd1b8',
  },
  {
    id: 'nam_lang_tu_co_thanh',
    name: 'Yến Cô Thành',
    title: 'Độc Hành Lãng Khách',
    gender: 'nam',
    ageMin: 28,
    ageMax: 37,
    ageLabel: '28–37 tuổi',
    sect: 'Vô Ảnh Giang Hồ',
    bio: 'Lãng tử đội nón lá trúc, ưa phế xe công sát, khí thế áp bức toàn bàn.',
    skinColor: 0xe2be9f,
    robePrimary: 0x262127,
    robeSecondary: 0x8f251e,
    trimColor: 0xc89a4b,
    hairColor: 0x151418,
    accentGlow: 0xe35d42,
    hairStyle: 'bambooHat',
    beardStyle: 'none',
    shoulderScale: 1.04,
    headScale: 1.0,
    auraHex: '#e35d42',
  },
  {
    id: 'nam_thiet_chuong_duong_chu',
    name: 'Hồng Liệt Phong',
    title: 'Thiết Chưởng Đường Chủ',
    gender: 'nam',
    ageMin: 38,
    ageMax: 48,
    ageLabel: '38–48 tuổi',
    sect: 'Thiết Huyết Bang',
    bio: 'Hào kiệt trung niên, thế cờ trầm hùng vững chãi, trung cuộc mạnh như núi lở.',
    skinColor: 0xd9b08e,
    robePrimary: 0x4e2618,
    robeSecondary: 0x241916,
    trimColor: 0xd9a14a,
    hairColor: 0x232024,
    accentGlow: 0xf09d38,
    hairStyle: 'ironBand',
    beardStyle: 'goatee',
    shoulderScale: 1.12,
    headScale: 1.02,
    auraHex: '#f09d38',
  },
  {
    id: 'nam_chuong_mon_vo_dang',
    name: 'Trương Huyền Thanh',
    title: 'Thái Cực Chưởng Môn',
    gender: 'nam',
    ageMin: 49,
    ageMax: 60,
    ageLabel: '49–60 tuổi',
    sect: 'Võ Đang Sơn',
    bio: 'Đạo cốt tiên phong, điều binh khiển tướng theo nhịp âm dương Thái Cực.',
    skinColor: 0xe1bfa2,
    robePrimary: 0x213142,
    robeSecondary: 0xcbc6ba,
    trimColor: 0xcfb070,
    hairColor: 0x676b74,
    accentGlow: 0x7db3e8,
    hairStyle: 'elderCrown',
    beardStyle: 'goatee',
    shoulderScale: 1.04,
    headScale: 1.0,
    auraHex: '#7db3e8',
  },
  {
    id: 'nam_bach_mi_ky_thanh',
    name: 'Bạch Mi Kỳ Thánh',
    title: 'Ẩn Thế Kỳ Tiên',
    gender: 'nam',
    ageMin: 61,
    ageMax: 99,
    ageLabel: '61+ tuổi',
    sect: 'Côn Lôn Ẩn Cốc',
    bio: 'Tiền bối râu tóc bạc phơ, nhìn thấu mười nước cờ trước bằng tâm nhãn.',
    skinColor: 0xe3c7ad,
    robePrimary: 0xcfd4d8,
    robeSecondary: 0x3b4c57,
    trimColor: 0xd8b25c,
    hairColor: 0xdadce2,
    accentGlow: 0xf2d184,
    hairStyle: 'elderCrown',
    beardStyle: 'longWhite',
    shoulderScale: 1.0,
    headScale: 1.0,
    auraHex: '#f2d184',
  },

  // FEMALE (NỮ) - 6 distinct martial archetypes across age brackets
  {
    id: 'nu_linh_lung_su_muoi',
    name: 'Tô Linh Lung',
    title: 'Linh Lung Tiểu Sư Muội',
    gender: 'nu',
    ageMin: 12,
    ageMax: 20,
    ageLabel: '14–20 tuổi',
    sect: 'Đào Hoa Đảo',
    bio: 'Linh hoạt biến ảo, ra chiêu kỳ dị khó lường khiến đối thủ trở tay không kịp.',
    skinColor: 0xf6dcc6,
    robePrimary: 0x2d6a62,
    robeSecondary: 0xf0dcd5,
    trimColor: 0xe3b972,
    hairColor: 0x18151d,
    accentGlow: 0x62d9b6,
    hairStyle: 'twinBuns',
    beardStyle: 'none',
    shoulderScale: 0.84,
    headScale: 0.94,
    auraHex: '#62d9b6',
  },
  {
    id: 'nu_hong_y_nu_hiep',
    name: 'Mộ Dung Hồng Anh',
    title: 'Hồng Y Nữ Hiệp',
    gender: 'nu',
    ageMin: 21,
    ageMax: 28,
    ageLabel: '21–28 tuổi',
    sect: 'Hồng Liên Kiếm Phái',
    bio: 'Áo đỏ tung bay giữa kỳ đài, pháo đầu song xa công sát rực lửa.',
    skinColor: 0xf5d8c0,
    robePrimary: 0x8f1d24,
    robeSecondary: 0x261519,
    trimColor: 0xe5b85c,
    hairColor: 0x161318,
    accentGlow: 0xf26457,
    hairStyle: 'phoenixPin',
    beardStyle: 'none',
    shoulderScale: 0.86,
    headScale: 0.95,
    auraHex: '#f26457',
  },
  {
    id: 'nu_tuyet_kiem_tien_tu',
    name: 'Lãnh Tuyết Dao',
    title: 'Băng Tâm Kiếm Nữ',
    gender: 'nu',
    ageMin: 29,
    ageMax: 37,
    ageLabel: '29–37 tuổi',
    sect: 'Nga Mi Tuyết Đỉnh',
    bio: 'Lạnh lùng điềm tĩnh, phòng thủ kín như băng sơn rồi tung nhất kích tất sát.',
    skinColor: 0xf2dac9,
    robePrimary: 0xcfdbe6,
    robeSecondary: 0x28415c,
    trimColor: 0xb7d4e8,
    hairColor: 0x1a1c26,
    accentGlow: 0x87c6f5,
    hairStyle: 'phoenixPin',
    beardStyle: 'none',
    shoulderScale: 0.87,
    headScale: 0.95,
    auraHex: '#87c6f5',
  },
  {
    id: 'nu_nguyet_hoa_cung_chu',
    name: 'Thẩm Nguyệt Hoa',
    title: 'Nguyệt Hoa Cung Chủ',
    gender: 'nu',
    ageMin: 38,
    ageMax: 48,
    ageLabel: '38–48 tuổi',
    sect: 'Di Hoa Cung',
    bio: 'Uy nghiêm quý phái, bố cục thâm sâu trăm vòng cạm bẫy.',
    skinColor: 0xefd1b8,
    robePrimary: 0x3b234a,
    robeSecondary: 0x1b1526,
    trimColor: 0xdcb46b,
    hairColor: 0x1d1a24,
    accentGlow: 0xc58af9,
    hairStyle: 'crescentCrown',
    beardStyle: 'none',
    shoulderScale: 0.89,
    headScale: 0.96,
    auraHex: '#c58af9',
  },
  {
    id: 'nu_thien_am_truong_lao',
    name: 'Diệp Thanh Lan',
    title: 'Thiên Âm Trưởng Lão',
    gender: 'nu',
    ageMin: 49,
    ageMax: 60,
    ageLabel: '49–60 tuổi',
    sect: 'Thiên Âm Các',
    bio: 'Kỳ nghệ lão luyện, tàn cuộc tinh diệu như khúc cầm khuynh thành.',
    skinColor: 0xe8cab1,
    robePrimary: 0x26443d,
    robeSecondary: 0x192324,
    trimColor: 0xd6b164,
    hairColor: 0x5c6068,
    accentGlow: 0x76cca6,
    hairStyle: 'crescentCrown',
    beardStyle: 'none',
    shoulderScale: 0.89,
    headScale: 0.96,
    auraHex: '#76cca6',
  },
  {
    id: 'nu_huyen_nu_tien_boi',
    name: 'Thái Huyền Lão Tổ',
    title: 'Huyền Nữ Tiền Bối',
    gender: 'nu',
    ageMin: 61,
    ageMax: 99,
    ageLabel: '61+ tuổi',
    sect: 'Thái Huyền Động Thiên',
    bio: 'Bậc nữ trung hào kiệt ẩn thế, mỗi nước cờ tựa thiên cơ bất khả lộ.',
    skinColor: 0xe6cbb5,
    robePrimary: 0x322b38,
    robeSecondary: 0xd4cfc5,
    trimColor: 0xe2bc6b,
    hairColor: 0xd6d8df,
    accentGlow: 0xf0c97a,
    hairStyle: 'elderBun',
    beardStyle: 'none',
    shoulderScale: 0.88,
    headScale: 0.95,
    auraHex: '#f0c97a',
  },
];

/**
 * Quickly matches the most fitting martial-arts character from the roster
 * given Guest gender ('nam' | 'nu') and age.
 */
export function matchGuestCharacter(gender: GuestGender, age: number): WuxiaCharacterProfile {
  const safeAge = Math.max(12, Math.min(99, Math.round(age || 25)));
  const pool = GUEST_CHARACTER_ROSTER.filter((c) => c.gender === gender);

  const exact = pool.find((c) => safeAge >= c.ageMin && safeAge <= c.ageMax);
  if (exact) return exact;

  // Fallback to nearest age range midpoint
  return pool.reduce((best, cur) => {
    const bestMid = (best.ageMin + best.ageMax) / 2;
    const curMid = (cur.ageMin + cur.ageMax) / 2;
    return Math.abs(safeAge - curMid) < Math.abs(safeAge - bestMid) ? cur : best;
  }, pool[0]);
}
