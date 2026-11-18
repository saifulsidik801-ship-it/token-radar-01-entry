# Token Radar — pre-token protocols ranked by comps-fitted implied value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/saifulsidik801-ship-it/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/saifulsidik801-ship-it/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 240 pre-token protocols ranked by an implied value that is **fitted from this snapshot's own live-token comparables**, validated out of sample, with a costed farm plan for every row. Built by an AI agent for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).

## The model (radar-3)

Implied value follows from the snapshot's own figures — TVL, seven-day growth, age, and category — fitted as one multi-variable regression on the snapshot's own live-token comparables, never from a hardcoded list of names:

```
log10(mcap) = 3.1051 + 0.4834 x log10(tvl_usd) - 0.2389 x growth
              + 0.0753 x log10(age_days + 30) + category_coef
```

- **Comps fit:** ridge-regularised (lambda 3, intercept unpenalised) + Huber-robust (k = 1.345 x MAD) least squares on the 128 live-token protocols that carry both a market cap and a TVL. Fitted at run time from the snapshot the program reads. Growth is `change_7d / 100`, clipped to -0.6..1.2; age is days since `listed_at`, unknown ages use the comps' median age (1,000 days); one dummy per category with 3 or more comps. Huber downweights the extreme market-cap/TVL outliers (ratios in this snapshot run from 0.0003 to 400) without deleting any comp.
- **Fit quality, honestly:** R² **0.26** on all 128 comps (radar-2's TVL-only fit was 0.19). The market is very noisy — even with all four signals the fit explains only about a quarter of the variance, and the growth coefficient comes out slightly negative, which is what the comps say, not what intuition would guess.
- **Validation:** deterministic 5-fold cross-validation over the comps (fold = index % 5 on slug order), refitting the whole pipeline per fold. Median absolute error **83.6%** (radar-2: 89%), 25% of comps within 50%, 66% within 2x. Per-fold medians: 80.6%, 93.8%, 118.2%, 89.5%, 82.1%. The model is a ranking signal, not a price.

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
