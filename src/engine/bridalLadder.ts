import type { KillPatternId } from './patterns';
import type { BoardState, Side } from './xiangqi';

/**
 * The dowry ladder: instead of dumbing the bride down, she wagers pieces of her hồi môn.
 * Ranks ascend with how permanent the board damage is, so the audience can learn
 * "mất mũ phượng là vì bị Ngọa Tào" rather than watching a random strip.
 */
export type DowryLayerId =
  | 'qua_tay_lua'
  | 'kieng_hoi_mon'
  | 'mu_phuong'
  | 'hai_theu'
  | 'ao_choang'
  | 'nen_hoa_chuc';

export interface DowryLayer {
  id: DowryLayerId;
  rank: 1 | 2 | 3 | 4 | 5 | 6;
  nameVi: string;
}

export interface BridalLadder {
  /** Still in the bride's possession, any order. */
  held: DowryLayerId[];
}

export const DOWRY_LAYERS: readonly DowryLayer[] = [
  { id: 'qua_tay_lua', rank: 1, nameVi: 'quạt lụa' },
  { id: 'kieng_hoi_mon', rank: 2, nameVi: 'kiềng hồi môn' },
  { id: 'mu_phuong', rank: 3, nameVi: 'mũ phượng' },
  { id: 'hai_theu', rank: 4, nameVi: 'hài thêu' },
  { id: 'ao_choang', rank: 5, nameVi: 'áo choàng gấm' },
  { id: 'nen_hoa_chuc', rank: 6, nameVi: 'nến hoa chúc' },
];

/** Strikes stop at rank 5: the last candle is only ever lost with the game itself. */
const PATTERN_RANK_CAP = 5;

const LAYER_BY_ID = new Map(DOWRY_LAYERS.map((layer) => [layer.id, layer]));

/** The candle is never a pattern prize - it goes out only when the game itself is lost. */
const LAYER_BY_PATTERN: Record<KillPatternId, DowryLayerId> = {
  khong_dau_phao: 'qua_tay_lua',
  dieu_ngu_ma: 'qua_tay_lua',
  qua_giac_ma: 'qua_tay_lua',
  bach_kiem_tuong: 'kieng_hoi_mon',
  be_cung: 'kieng_hoi_mon',
  ngo_tao_ma: 'mu_phuong',
  ma_hau_phao: 'mu_phuong',
  trong_phao: 'mu_phuong',
  thiet_mon_thuyen: 'hai_theu',
  thien_dia_phao: 'hai_theu',
  hai_de_lao_nguyet: 'hai_theu',
  giap_xa_phao: 'hai_theu',
  dai_dao_hoach_tam: 'ao_choang',
  song_xa_thac: 'ao_choang',
  bat_hoang_ma: 'ao_choang',
  tam_tu_quy_bien: 'ao_choang',
  phao_nan_dan_sa: 'ao_choang',
};

export function layerById(id: DowryLayerId): DowryLayer {
  return LAYER_BY_ID.get(id)!;
}

export function initialLadder(): BridalLadder {
  return { held: DOWRY_LAYERS.map((layer) => layer.id) };
}

export function ladderStep(ladder: BridalLadder): number {
  return DOWRY_LAYERS.length - ladder.held.length;
}

export function lostLayers(ladder: BridalLadder): DowryLayer[] {
  return DOWRY_LAYERS.filter((layer) => !ladder.held.includes(layer.id));
}

export function isHeld(ladder: BridalLadder, id: DowryLayerId): boolean {
  return ladder.held.includes(id);
}

/**
 * Forfeit the cheapest layer the pattern is worth, or the next dearer one when that is already
 * on the challenger's side - repeating the same strike keeps taking the dowry apart.
 */
function forfeitRank(
  ladder: BridalLadder,
  rank: number,
  cap: number,
): { ladder: BridalLadder; lost: DowryLayer | null } {
  const candidate = DOWRY_LAYERS.filter(
    (layer) => layer.rank >= rank && layer.rank <= cap && ladder.held.includes(layer.id),
  ).sort((a, b) => a.rank - b.rank)[0];
  if (!candidate) return { ladder, lost: null };
  return {
    ladder: { held: ladder.held.filter((id) => id !== candidate.id) },
    lost: candidate,
  };
}

export function shouldForfeitForPattern(
  forcing: boolean,
  side: Side,
  status: BoardState['status'],
): boolean {
  return forcing && side === 'red' && (status === 'playing' || status === 'red_win');
}

export function forfeitForPattern(
  ladder: BridalLadder,
  patternId: KillPatternId,
): { ladder: BridalLadder; lost: DowryLayer | null } {
  const target = LAYER_BY_PATTERN[patternId];
  if (!target) return { ladder, lost: null };
  return forfeitRank(ladder, layerById(target).rank, PATTERN_RANK_CAP);
}

export function forfeitCandle(ladder: BridalLadder): { ladder: BridalLadder; lost: DowryLayer | null } {
  return forfeitRank(ladder, 6, 6);
}

export const LADDER_STORAGE_KEY = 'ctl.bridal_ladder.v1';

/** Minimal surface so the module stays free of DOM types and can be tested with a fake store. */
export interface LadderStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function serializeLadder(ladder: BridalLadder): string {
  return ladder.held.join(',');
}

/** Returns null for anything unreadable, so a corrupted entry falls back to a full dowry. */
export function parseLadder(raw: string | null): BridalLadder | null {
  if (raw === null) return null;
  const ids = raw.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
  const held: DowryLayerId[] = [];
  for (const id of ids) {
    if (!LAYER_BY_ID.has(id as DowryLayerId) || held.includes(id as DowryLayerId)) continue;
    held.push(id as DowryLayerId);
  }
  if (held.length !== ids.length) return null;
  return { held: DOWRY_LAYERS.filter((layer) => held.includes(layer.id)).map((layer) => layer.id) };
}

export function loadLadder(storage: LadderStorage | undefined): BridalLadder {
  if (!storage) return initialLadder();
  let raw: string | null = null;
  try {
    raw = storage.getItem(LADDER_STORAGE_KEY);
  } catch {
    return initialLadder();
  }
  return parseLadder(raw) ?? initialLadder();
}

export function saveLadder(storage: LadderStorage | undefined, ladder: BridalLadder): void {
  if (!storage) return;
  try {
    storage.setItem(LADDER_STORAGE_KEY, serializeLadder(ladder));
  } catch {
    // A full or private-mode store must not break the match.
  }
}
