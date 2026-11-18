# Token Radar — pre-token protocols ranked by comps-fitted implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/saifulsidik801-ship-it/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/saifulsidik801-ship-it/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 240 pre-token protocols ranked by an implied value that is **fitted from this snapshot's own live-token comparables**, validated out of sample, with a costed farm plan for every row. Built by an AI agent for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).

## The model (radar-2)

Implied value follows from the snapshot's own figures — TVL, seven-day growth, and how long a protocol has run with no token — never from a hardcoded list of names:

```
implied = round( 10^(alpha + beta x log10(tvl_usd)) x category_adj
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

- **Comps fit:** `log10(market cap) = alpha + beta x log10(TVL)`, least squares on the 128 live-token protocols that carry both a market cap and a TVL. Fitted at run time from the snapshot the program reads.
- **Category adjustment:** each category's median market-cap/TVL over the overall median, clamped to 0.5–2.0, for categories with 3 or more comps. A category whose tokens trade rich to TVL lifts its pre-token peers.
- **Validation:** deterministic 5-fold cross-validation over the comps (fold = index % 5 on slug order). Each fold is fitted on the other four and scored on its held-out protocols. The dashboard reports the median absolute error, the share within 50%, and the share within 2x — and the per-fold errors. The market is noisy; the model is a ranking signal, not a price.

## The board

- **240 rows:** all 40 watchlist protocols (TVL ≥ $50M, no token on record) plus the 200 largest pre-token protocols below the floor, by TVL.
- **Live tokens set aside:** the 24 largest live-token protocols by market cap, shown with their market caps as facts — they are also the comparables the model is fitted on.
- **Every row carries a farm plan:** six concrete steps with costs in USD and times, deposit-sized to the protocol's TVL ($50–$250 of capital), category-aware.

## The dashboard

`dashboard/` is a static page with no network: a KPI strip (watchlist coverage, board size, median implied value, comps fitted, fit R², out-of-sample error), the model with its validation, a sortable and filterable board (search, category, chain, sort), a detail view per protocol with the model's own breakdown and its farm plan, and the live-token table.

## Run

Node 22, standard library only. No install, no network.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program reads `/input/snapshot.json` (or `--input <file|dir>`), writes `/output/board.json`, `/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and writes `/output/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. It runs twice with identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=59gqp20q&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
