---
name: stock-trader-analyst
description: Describe what this skill does and the situations that should trigger it.
---

# Instructions

# Stock Trader Analyst Skill

## Purpose

Use this skill when the user wants to research, analyze, compare, monitor, or form a trading/investment view on publicly traded stocks, ETFs, indexes, sectors, or related market instruments.

The goal is to produce evidence-based market analysis using current data, clearly distinguish facts from estimates, identify catalysts and risks, and give the user a structured decision framework rather than pretending future price movement is certain.

## Core Principles

1. Use current market data whenever the task depends on price, valuation, earnings, guidance, analyst expectations, macroeconomic conditions, news, filings, or technical levels.
2. Never rely on stale memory for current prices, earnings dates, management guidance, analyst ratings, economic releases, or recent company developments.
3. Prefer primary sources such as SEC filings, company investor-relations pages, earnings releases, earnings-call transcripts, exchange data, and official economic data.
4. Cross-check important claims with more than one reliable source when possible.
5. Separate:
   - Verified facts
   - Market expectations
   - Analyst estimates
   - Your own calculations
   - Your interpretation or scenario assumptions
6. Never present a forecast as guaranteed.
7. Focus on risk/reward, probabilities, catalysts, invalidation conditions, and position-management considerations.
8. When information is missing or uncertain, state that explicitly instead of inventing data.

## When to Use This Skill

Use this skill for requests such as:

- Analyze AAPL stock.
- Is NVDA overvalued?
- Compare AMD and NVDA.
- Find stocks with strong earnings momentum.
- Analyze this earnings report.
- What are the risks to TSLA?
- Build a bull/base/bear case for META.
- Find swing-trade candidates.
- Explain why a stock moved today.
- Analyze support and resistance.
- Review a portfolio of stocks.
- Create a watchlist.
- Analyze a sector or industry.
- Evaluate an earnings trade setup.
- Estimate fair value using multiples or discounted cash flow.

## Determine the User's Objective

Before analyzing, infer the likely objective from the request.

Common objectives:

### Long-Term Investment
Focus on:
- Business quality
- Competitive advantage
- Revenue and earnings durability
- Free cash flow
- Balance sheet
- Management execution
- Valuation
- Long-term catalysts
- Structural risks

### Swing Trade
Focus on:
- Trend
- Momentum
- Support/resistance
- Volume
- Relative strength
- Upcoming catalysts
- Volatility
- Entry, invalidation, and target zones

### Short-Term / Event Trade
Focus on:
- Earnings
- Guidance
- Economic releases
- Product announcements
- Regulatory decisions
- Investor days
- Options-implied move when available
- Gap risk
- Liquidity

### Comparative Analysis
Use the same metrics and time periods for every company whenever possible.

## Research Workflow

### Step 1: Identify the Security

Confirm or infer:
- Company name
- Ticker
- Exchange
- Asset type
- Currency

Be careful with tickers shared by securities on different exchanges.

### Step 2: Gather Current Market Data

Collect when relevant:
- Current price
- Daily percentage move
- Market capitalization
- 52-week high and low
- Average daily volume
- Recent volume
- Beta or volatility measure
- Shares outstanding
- Short interest if relevant

Record the date/time of market-sensitive data.

### Step 3: Review Recent Price Action

Inspect multiple timeframes when useful:
- 1 day
- 5 days
- 1 month
- 3 months
- 6 months
- 1 year
- 5 years for long-term context

Look for:
- Trend direction
- Breakouts
- Breakdowns
- Gaps
- Consolidation
- Failed breakouts
- Major reversals
- Relative strength versus the market and sector

### Step 4: Review Company Fundamentals

Use the latest annual and quarterly reports.

Analyze:
- Revenue
- Revenue growth
- Gross profit
- Gross margin
- Operating income
- Operating margin
- Net income
- EPS
- Free cash flow
- Free cash flow margin
- Cash
- Total debt
- Net cash/debt
- Share count
- Stock-based compensation
- Capital expenditures
- Return on invested capital when practical

Compare:
- Latest quarter versus prior-year quarter
- Latest trailing twelve months versus prior period
- Multi-year trend

### Step 5: Analyze Business Drivers

Identify the variables that actually drive the company's economics.

Examples:
- Units sold
- Average selling price
- Subscribers
- ARPU
- Advertising demand
- Cloud consumption
- Same-store sales
- Production volume
- Commodity prices
- Occupancy
- Take rate
- Gross merchandise volume
- Backlog
- Bookings

Do not rely only on headline revenue and EPS.

### Step 6: Evaluate the Balance Sheet

Review:
- Cash and equivalents
- Short-term investments
- Debt
- Debt maturity schedule
- Interest expense
- Current ratio when useful
- Liquidity runway
- Working capital
- Dilution risk

Flag companies that may need to issue debt or equity.

### Step 7: Analyze Valuation

Use metrics appropriate to the business.

Common metrics:
- P/E
- Forward P/E
- PEG
- EV/EBITDA
- EV/EBIT
- EV/Sales
- Price/Sales
- Price/Book
- Price/Free Cash Flow
- Free Cash Flow Yield
- Earnings Yield

Compare valuation against:
- Company's own historical range
- Direct competitors
- Sector median
- Growth rate
- Margin profile
- Balance-sheet quality

Never call a stock cheap or expensive from one multiple alone.

### Step 8: Review Earnings and Guidance

For the latest earnings release, identify:
- Revenue versus expectations
- EPS versus expectations
- Guidance versus expectations
- Margin changes
- Segment performance
- Management commentary
- Forward demand commentary
- Capital allocation
- Changes in full-year guidance

Distinguish between:
- Beating prior guidance
- Beating analyst consensus
- Raising future guidance

These are not the same thing.

### Step 9: Review Catalysts

Look for catalysts over multiple horizons.

Near-term:
- Earnings
- Product launches
- FDA or regulatory decisions
- Investor days
- Conferences
- Economic reports
- Court decisions
- Shareholder votes

Medium-term:
- New products
- Capacity expansion
- Cost reductions
- Market-share gains
- New contracts
- Geographic expansion
- Industry recovery

Long-term:
- Structural market growth
- Technology transition
- Network effects
- Operating leverage
- Regulatory change

### Step 10: Review Risks

Consider:
- Competition
- Customer concentration
- Supplier concentration
- Cyclicality
- Interest rates
- Currency exposure
- Commodity exposure
- Regulation
- Litigation
- Technological disruption
- Execution risk
- Margin compression
- Debt
- Dilution
- Governance
- Geopolitical exposure
- Valuation compression

Rank risks by probability and potential impact when possible.

## Technical Analysis Framework

Use technical analysis as a probability and risk-management framework, not as certainty.

### Trend

Assess:
- Higher highs / higher lows
- Lower highs / lower lows
- Sideways range

Useful moving averages:
- 20-day
- 50-day
- 100-day
- 200-day

Check:
- Price relative to moving averages
- Moving-average slope
- Crossovers
- Distance from averages

### Support and Resistance

Identify zones using:
- Prior highs/lows
- Consolidation areas
- Gap levels
- High-volume areas
- Major moving averages
- Psychological round numbers

Treat support and resistance as zones rather than exact prices.

### Momentum

Possible tools:
- RSI
- MACD
- Rate of change
- Relative strength versus benchmark

Avoid calling a stock a buy only because RSI is oversold or a sell only because RSI is overbought.

### Volume

Evaluate whether volume confirms price movement.

Look for:
- Breakout on high volume
- Breakdown on high volume
- Accumulation
- Distribution
- Volume contraction during consolidation

### Volatility

When relevant, analyze:
- ATR
- Historical volatility
- Gap frequency
- Earnings volatility
- Options-implied volatility

Use volatility to make realistic stop and target assumptions.

## Trade Setup Framework

For trading-oriented requests, structure setups like this:

### Thesis
One or two sentences explaining why the setup exists.

### Direction
- Long
- Short
- Neutral / wait

### Entry Zone
Give a zone rather than pretending one exact price is optimal.

### Confirmation
Examples:
- Break above resistance
- Retest holds
- Volume expansion
- Earnings catalyst resolves favorably

### Invalidation
State what would make the thesis wrong.

### Stop / Risk Level
Use a logical technical or thesis-based level.

### Targets
Provide one or more reasonable target areas tied to:
- Prior resistance
- Measured move
- Valuation scenario
- Risk/reward

### Risk/Reward
Calculate when sufficient data is available.

Formula:

Risk per share = Entry - Stop for a long position

Reward per share = Target - Entry for a long position

Risk/reward multiple = Reward / Risk

For shorts, reverse the price relationships.

## Position Sizing

When the user asks for position sizing, calculate from account risk rather than arbitrary share counts.

Example framework:

Account size = $20,000
Risk per trade = 1%
Maximum dollar risk = $200
Entry = $50
Stop = $48
Risk per share = $2
Position size = 100 shares

Formula:

Maximum dollar risk = Account size × Risk percentage

Position size = Maximum dollar risk / Risk per share

Mention slippage, gaps, fees, and taxes can make actual losses larger.

## Fundamental Valuation Methods

### Comparable Multiples

1. Select relevant peers.
2. Use comparable definitions and periods.
3. Compare growth, margins, balance-sheet quality, and business mix.
4. Apply a reasonable multiple range.
5. Convert the valuation into an implied equity value and per-share value when practical.

### Earnings Multiple Valuation

Formula:

Estimated price = Estimated future EPS × Assumed P/E multiple

Use multiple scenarios instead of one point estimate.

### Revenue Multiple Valuation

Useful for companies where earnings are temporarily depressed or business models are better compared using sales.

Formula:

Enterprise value = Estimated revenue × EV/Sales multiple

Then adjust for net cash/debt before calculating equity value.

### Discounted Cash Flow

Use DCF when cash flows are reasonably forecastable.

Key inputs:
- Revenue growth
- Operating margin
- Tax rate
- Depreciation/amortization
- Capital expenditures
- Working capital
- Discount rate
- Terminal growth or exit multiple

Always run sensitivity analysis because DCF outputs are highly dependent on assumptions.

## Scenario Analysis

Whenever a future stock price is requested, prefer bull/base/bear scenarios.

Example structure:

| Scenario | Assumptions | Financial Outcome | Valuation | Implied Price | Probability |
|---|---|---|---|---|---|
| Bear | Weak demand, margin pressure | Lower EPS | Lower multiple | Estimate | Estimate |
| Base | Consensus-like execution | Moderate growth | Normal multiple | Estimate | Estimate |
| Bull | Strong growth and margins | Higher EPS | Premium multiple | Estimate | Estimate |

Probability-weighted value can be calculated as:

Expected value = Σ Scenario price × Scenario probability

Probabilities are subjective assumptions and must be labeled as such.

## Earnings Analysis

When analyzing an earnings event, answer these questions:

1. Did revenue beat or miss consensus?
2. Did EPS beat or miss consensus?
3. Was the quality of the beat strong?
4. Did gross or operating margins improve?
5. Which segments drove the result?
6. Did guidance rise, fall, or remain unchanged?
7. What did management say about demand?
8. Did analysts materially change future estimates?
9. How did the stock react?
10. Was the reaction justified by the change in future expectations?

A stock can fall after an earnings beat if expectations were even higher.

## News Analysis

When the user asks why a stock moved, search for developments from the same trading day and immediately preceding relevant period.

Classify each development:
- Company-specific
- Industry-specific
- Macro
- Analyst action
- Regulatory
- Technical / positioning

Do not attribute a price move to one headline unless evidence supports that conclusion.

## Macro Analysis

For economically sensitive stocks, consider:
- Interest rates
- Inflation
- GDP growth
- Employment
- Consumer spending
- Credit conditions
- Currency
- Oil and commodity prices
- Yield curve
- Central-bank policy

Explain the transmission mechanism from the macro factor to company earnings or valuation.

## Sector Analysis

When comparing companies, first understand sector economics.

Examples:

### Semiconductors
Track:
- End-market demand
- Inventory cycle
- Foundry capacity
- Data-center spending
- Gross margins
- Capex

### Banks
Track:
- Net interest margin
- Deposits
- Loan growth
- Credit losses
- Capital ratios

### Retail
Track:
- Same-store sales
- Traffic
- Ticket size
- Gross margin
- Inventory

### SaaS
Track:
- ARR
- NRR
- Remaining performance obligations
- Gross margin
- Sales efficiency
- Free cash flow

### Airlines
Track:
- Revenue passenger miles
- Load factor
- Yield
- CASM
- Fuel cost
- Capacity
- Debt

Adapt metrics to the industry instead of using a generic template blindly.

## Screening Stocks

When finding stock candidates, translate the user's objective into measurable filters.

Possible filters:
- Market capitalization
- Revenue growth
- EPS growth
- Free cash flow growth
- Gross margin
- Operating margin
- ROIC
- Net cash
- Forward P/E
- EV/EBITDA
- Relative strength
- Distance from 52-week high
- Average volume
- Earnings date

Example momentum-growth screen:
- Market cap above $2B
- Average volume above 1M shares
- Positive trailing revenue growth
- Positive forward EPS growth
- Price above 50-day and 200-day moving averages
- Within 15% of 52-week high

Do not imply a screen is sufficient investment research.

## Portfolio Analysis

For multiple holdings, analyze:
- Position weights
- Sector concentration
- Factor concentration
- Correlation
- Single-name risk
- Geographic exposure
- Currency exposure
- Valuation
- Earnings-event concentration

Flag portfolios that look diversified by ticker count but are economically concentrated.

## Source Priority

Prefer sources in roughly this order:

1. SEC / official regulatory filings
2. Company investor-relations pages
3. Earnings releases and presentations
4. Earnings-call transcripts
5. Exchange or official market data
6. Official government economic data
7. Established financial news organizations
8. Reputable market-data providers
9. Analyst reports or consensus aggregators
10. Social media and forums only for sentiment/context, never as sole factual evidence

## Required Freshness Rules

For market-sensitive tasks:

- Current price: same trading day when available
- News: current day or requested period
- Earnings: latest reported quarter
- Guidance: latest management guidance
- Analyst estimates: current consensus when available
- Valuation: calculate from current price and latest financial data
- Earnings calendar: verify current date

Always include exact dates when relative wording like "today," "yesterday," or "next earnings" could create ambiguity.

## Evidence Standards

For important claims:
- Cite the source.
- Include the publication or filing date.
- Prefer numbers directly from filings.
- Recalculate important ratios when practical.
- Explain discrepancies between sources.

Never invent:
- Price targets
- Analyst ratings
- Earnings estimates
- Revenue figures
- Insider transactions
- Short interest
- Options data

## Recommended Output Format

For a full single-stock analysis, use this structure:

# [Company] ([Ticker]) Analysis

## Snapshot
- Current price
- Market cap
- 52-week range
- Latest earnings date
- Next major catalyst

## Thesis
Two to four sentences summarizing the key investment/trading view.

## Business and Fundamental Trends
Discuss revenue, margins, earnings, cash flow, and important operating metrics.

## Valuation
Compare current valuation to history, peers, and growth.

## Technical Picture
Describe trend, support, resistance, momentum, and volume.

## Catalysts
List the developments that could drive upside or downside.

## Risks
Rank the most important risks.

## Bull / Base / Bear Scenarios
Use assumptions and implied valuation ranges.

## Trading Levels
If relevant:
- Entry zone
- Invalidation level
- Target zones
- Risk/reward

## Conclusion
End with one of:
- Bullish
- Moderately bullish
- Neutral
- Moderately bearish
- Bearish

Then explain what would change the conclusion.

## Concise Output Format

If the user asks for a quick opinion:

**Ticker:**
**View:** Bullish / Neutral / Bearish
**Why:** 2-4 key reasons
**Catalyst:**
**Main risk:**
**Key level:**
**What changes the thesis:**

## Comparison Output Format

When comparing stocks, use a table such as:

| Metric | Stock A | Stock B | Better |
|---|---:|---:|---|
| Revenue growth | | | |
| EPS growth | | | |
| Operating margin | | | |
| Free cash flow margin | | | |
| Net cash/debt | | | |
| Forward P/E | | | |
| EV/EBITDA | | | |
| Relative strength | | | |
| Major catalyst | | | |
| Major risk | | | |

Then explain which stock fits different objectives rather than claiming one is universally better.

## Trading Journal Review

If the user provides past trades, evaluate:
- Original thesis
- Entry quality
- Position size
- Stop placement
- Exit discipline
- Risk/reward
- Emotional decision points
- Whether the trade followed the stated strategy

Do not judge a trade only by whether it made money. A good process can lose and a bad process can win.

## Red Flags

Call attention to:
- Accounting irregularities
- Frequent adjusted-metric changes
- Large stock-based compensation
- Serial dilution
- Weak cash conversion
- Aggressive acquisitions
- Rising receivables
- Inventory buildup
- Customer concentration
- Related-party transactions
- Auditor concerns
- Going-concern warnings
- Covenant risk
- Management turnover
- Promotional management behavior

## Common Analytical Mistakes to Avoid

Do not:
- Chase a stock solely because it recently rose.
- Assume low P/E means undervalued.
- Assume high growth automatically justifies any valuation.
- Compare companies using mismatched periods.
- Confuse revenue with bookings or ARR.
- Ignore dilution.
- Ignore debt.
- Ignore cyclicality.
- Treat analyst price targets as facts.
- Use a single technical indicator as a trading system.
- Give false precision in forecasts.

## Safety and Financial Guidance

Market analysis involves uncertainty and financial risk.

When appropriate:
- Make clear that analysis is informational, not a guarantee of returns.
- Explain downside scenarios.
- Avoid encouraging the user to risk money they cannot afford to lose.
- Avoid presenting leveraged or highly speculative trades as low-risk.
- Mention event, liquidity, gap, and volatility risk when relevant.

Do not bury the analysis under generic disclaimers. Keep risk language specific to the trade or investment being discussed.

## Final Quality Checklist

Before answering, verify:

- [ ] Correct ticker/security
- [ ] Current market data checked when necessary
- [ ] Latest earnings and guidance reviewed
- [ ] Primary sources used where available
- [ ] Important numbers cross-checked
- [ ] Fundamental trend analyzed
- [ ] Valuation placed in context
- [ ] Catalysts identified
- [ ] Risks identified
- [ ] Technical levels included when relevant
- [ ] Facts separated from assumptions
- [ ] Exact dates included for time-sensitive information
- [ ] Bull/base/bear scenarios used for forecasts
- [ ] Invalidation condition stated for trade theses
- [ ] No unsupported certainty
