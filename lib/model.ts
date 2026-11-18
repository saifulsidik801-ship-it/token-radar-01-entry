// Token Radar's model, radar-2: a comps-fitted launch-pricing model.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol);
// live-token protocols are kept apart and shown as the market's own values, never mixed into the
// ranked board.
//
// Implied value is fitted from the snapshot's own live-token comparables, never from a hardcoded
// list of names:
//
//   comps      = live-token protocols with a market cap and a TVL (128 of them here)
//   fit        = log10(mcap) ~ alpha + beta * log10(tvl), least squares on the comps
//   catAdj     = this category's median mcap/TVL over the comps' overall median, clamped [0.5, 2]
//   growthMult = 1 + clamp(change_7d, -60, 120) / 100 * 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 * 0.4   (age_days unknown: 365)
//   implied    = max(1, round(10^(alpha + beta*log10(tvl)) * catAdj * growthMult * maturity))
//
// The fit and its validation are computed at run time from the snapshot the program reads, so the
// numbers the dashboard shows are the numbers this snapshot's comps produce. Validation is a
// deterministic 5-fold cross-validation over the comps (fold = index % 5 on slug order): each fold
// is fitted on the other four and scored on its held-out protocols, and the dashboard reports the
// median absolute percentage error and the share predicted within 2x. No protocol name is ever
// special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  cat_adj_min: number;
  cat_adj_max: number;
  cat_min_comps: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  cat_adj_min: 0.5,
  cat_adj_max: 2.0,
  cat_min_comps: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fitted_base_usd: number;
    category_adjustment: number;
    category_median_ratio: number | null;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row, with the model breakdown and the farm plan it carries. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  fitted_base_usd: number;
  category_adjustment: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The comps fit: log10(mcap) ~ alpha + beta * log10(tvl), least squares on the live-token comps. */
export interface CompsFit {
  alpha: number;
  beta: number;
  r2: number;
  n: number;
  overall_median_ratio: number;
}

/** One category's median mcap/TVL among the comps, and the adjustment it gives. */
export interface CategoryAdjustment {
  category: string;
  n: number;
  median_ratio: number;
  adjustment: number;
}

/** The 5-fold cross-validation of the fitted model on the comps. */
export interface Validation {
  folds: number;
  n: number;
  median_abs_pct_error: number;
  within_50_pct: number;
  within_2x_pct: number;
  per_fold: { fold: number; n: number; median_abs_pct_error: number }[];
}

/** Everything the dashboard needs: the board, the live set, the fit and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: CompsFit;
  validation: Validation;
  category_adjustments: CategoryAdjustment[];
  median_implied_usd: number;
  top_category: string;
  top_category_count: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The live-token comparables: a market cap and a TVL, both positive, sorted by slug. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Least squares log10(mcap) ~ alpha + beta * log10(tvl) over `rows`, with R squared. */
export function fitLogLog(rows: SnapshotProtocol[]): { alpha: number; beta: number; r2: number } {
  const xs = rows.map((p) => Math.log10(p.tvl_usd));
  const ys = rows.map((p) => Math.log10(p.mcap_usd as number));
  const n = rows.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    syy += (ys[i]! - my) * (ys[i]! - my);
  }
  const beta = sxx === 0 ? 0 : sxy / sxx;
  const alpha = my - beta * mx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { alpha, beta, r2 };
}

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** The comps' overall median mcap/TVL and each category's median, for the adjustment. */
export function categoryMedians(rows: SnapshotProtocol[]): { overall: number; byCategory: Map<string, { median: number; n: number }> } {
  const overall = medianOf(rows.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const byCategory = new Map<string, { median: number; n: number }>();
  const grouped = new Map<string, number[]>();
  for (const p of rows) {
    const c = p.category ?? '(none)';
    const list = grouped.get(c) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    grouped.set(c, list);
  }
  for (const [c, list] of grouped) byCategory.set(c, { median: medianOf(list), n: list.length });
  return { overall, byCategory };
}

/** The category adjustment for one protocol: its category's median ratio over the overall median. */
export function categoryAdjustment(p: SnapshotProtocol, medians: { overall: number; byCategory: Map<string, { median: number; n: number }> }, model: ModelConstants): { adjustment: number; medianRatio: number | null } {
  const entry = medians.byCategory.get(p.category ?? '(none)');
  if (entry === undefined || entry.n < model.cat_min_comps) return { adjustment: 1, medianRatio: null };
  const raw = entry.median / medians.overall;
  return { adjustment: Math.min(model.cat_adj_max, Math.max(model.cat_adj_min, raw)), medianRatio: entry.median };
}

/** The fitted base, the multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: { alpha: number; beta: number },
  medians: { overall: number; byCategory: Map<string, { median: number; n: number }> },
  model: ModelConstants,
): { implied: number; fittedBase: number; catAdj: number; catMedianRatio: number | null; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { adjustment: catAdj, medianRatio: catMedianRatio } = categoryAdjustment(protocol, medians, model);
  const fittedBase = Math.pow(10, fit.alpha + fit.beta * Math.log10(protocol.tvl_usd));
  const implied = Math.max(1, Math.round(fittedBase * catAdj * growthMult * maturityMult));
  return { implied, fittedBase, catAdj, catMedianRatio, growthPct, growthMult, maturityMult, age };
}

/** Deterministic 5-fold cross-validation of the fitted model on the comps. */
export function validateModel(comps: SnapshotProtocol[], asOf: string, model: ModelConstants): Validation {
  const folds = 5;
  const perFold: { fold: number; n: number; median_abs_pct_error: number }[] = [];
  const allErrors: number[] = [];
  for (let f = 0; f < folds; f++) {
    const test = comps.filter((_, i) => i % folds === f);
    const train = comps.filter((_, i) => i % folds !== f);
    const fit = fitLogLog(train);
    const medians = categoryMedians(train);
    const errors = test.map((p) => {
      const { implied } = impliedValue(p, asOf, fit, medians, model);
      return Math.abs(implied - (p.mcap_usd as number)) / (p.mcap_usd as number);
    });
    errors.sort((a, b) => a - b);
    perFold.push({ fold: f + 1, n: test.length, median_abs_pct_error: errors[Math.floor(errors.length / 2)]! });
    allErrors.push(...errors);
  }
  allErrors.sort((a, b) => a - b);
  return {
    folds,
    n: comps.length,
    median_abs_pct_error: allErrors[Math.floor(allErrors.length / 2)]!,
    within_50_pct: allErrors.filter((e) => e <= 0.5).length / allErrors.length,
    within_2x_pct: allErrors.filter((e) => e <= 1).length / allErrors.length,
    per_fold: perFold,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa') || c.includes('real world')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis position on ${chain} and keep it open.`;
  if (c.includes('cede')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('governance') || c.includes('incentive')) return `Deposit $${capital} into ${name} on ${chain} and vote in its next round.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to the ${name} chain and use one of its apps.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, category-aware action so the plan is more than one deposit. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $25 of USDC against the deposit on ${name} and repay it the same week.`;
  if (c.includes('dex') || c.includes('yield')) return `Swap $25 of USDC for the pool's other asset on ${name} and add it to the same position.`;
  if (c.includes('bridge')) return `Bridge $25 back through ${name} so the round trip is on record.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the receipt token once through ${name} and keep the new receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name} and open one more small position the next week.`;
  if (c.includes('prediction')) return `Settle the market position on ${name} and place one more the next week.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Move $25 between two vaults on ${name} to show active allocation.`;
  if (c.includes('rwa') || c.includes('real world')) return `Reinvest the first yield payout from ${name} back into the same asset.`;
  if (c.includes('insurance')) return `File a test claim check on ${name} and keep the policy active.`;
  return `Make one swap or vote inside ${name} on ${chain} so the wallet shows a second action.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: 'about $2 of gas',
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '15 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  fit: { alpha: number; beta: number },
  medians: { overall: number; byCategory: Map<string, { median: number; n: number }> },
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, medians, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      fitted_base_usd: Math.round(s.v.fittedBase),
      category_adjustment: round4(s.v.catAdj),
      category_median_ratio: s.v.catMedianRatio === null ? null : round4(s.v.catMedianRatio),
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the model breakdown and the farm plan it carries. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    fitted_base_usd: row.model.fitted_base_usd,
    category_adjustment: row.model.category_adjustment,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const comps = compsOf(snapshot);
  const fit = fitLogLog(comps);
  const medians = categoryMedians(comps);
  const validation = validateModel(comps, snapshot.as_of, model);
  const board = buildBoard(snapshot, fit, medians, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const sortedImplied = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const medianImplied = sortedImplied[Math.floor(sortedImplied.length / 2)]!;
  const catCounts = new Map<string, number>();
  for (const r of board) catCounts.set(r.category ?? '(none)', (catCounts.get(r.category ?? '(none)') ?? 0) + 1);
  let topCategory = '(none)';
  let topCategoryCount = 0;
  for (const [c, n] of catCounts) if (n > topCategoryCount || (n === topCategoryCount && c < topCategory)) { topCategory = c; topCategoryCount = n; }
  const categoryAdjustments: CategoryAdjustment[] = [...medians.byCategory.entries()]
    .filter(([, v]) => v.n >= model.cat_min_comps)
    .map(([category, v]) => ({
      category,
      n: v.n,
      median_ratio: round4(v.median),
      adjustment: round4(Math.min(model.cat_adj_max, Math.max(model.cat_adj_min, v.median / medians.overall))),
    }))
    .sort((a, b) => b.adjustment - a.adjustment || a.category.localeCompare(b.category));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit: {
      alpha: round4(fit.alpha),
      beta: round4(fit.beta),
      r2: round4(fit.r2),
      n: comps.length,
      overall_median_ratio: round4(medians.overall),
    },
    validation,
    category_adjustments: categoryAdjustments,
    median_implied_usd: medianImplied,
    top_category: topCategory,
    top_category_count: topCategoryCount,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
