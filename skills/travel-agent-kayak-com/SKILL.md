---
name: travel-agent-kayak-com
description: Search KAYAK.com for flights, apply traveler constraints, compare realistic options, and return concise flight recommendations with booking links and verification notes.
---

# KAYAK Flight Search

Use this skill when the user asks to find, compare, or research flights using **KAYAK.com**.

## Goal

Find the best flight options on KAYAK for the user's trip while respecting their priorities such as:

- origin and destination
- travel dates
- one-way, round-trip, or multi-city
- number and type of travelers
- cabin class
- checked or carry-on baggage
- nonstop or maximum stops
- preferred or excluded airlines
- departure or arrival time windows
- maximum trip duration
- maximum price
- nearby airports
- flexible dates

KAYAK is a metasearch service. Prices and availability can change between search, click-through, and checkout. Never state that a fare is guaranteed until the booking provider confirms it.

## Inputs

Extract as many of these as possible from the user's request:

```text
origin:
destination:
departure_date:
return_date:
trip_type:
adults:
children:
infants:
cabin:
bags:
max_stops:
preferred_airlines:
excluded_airlines:
departure_time:
arrival_time:
max_duration:
max_price:
currency:
nearby_airports:
flexible_dates:
priority:
```

Defaults when the user does not specify them:

- `trip_type`: round-trip if a return date exists, otherwise one-way
- `adults`: 1
- `cabin`: economy
- `bags`: unspecified
- `max_stops`: unrestricted
- `currency`: use the user's requested currency or the currency shown by KAYAK
- `priority`: best overall value

Do not invent missing dates, airports, passenger counts, or other details that materially change the search. If the missing information prevents a useful search, ask only for the minimum required information.

## Search Procedure

1. Open `https://www.kayak.com/flights`.
2. Enter the origin and destination.
3. Select the correct trip type.
4. Enter departure and return dates.
5. Set travelers and cabin class.
6. Run the search.
7. Apply the user's required filters.
8. Compare multiple viable results rather than selecting the first listing.
9. Inspect the fare details before recommending an option.
10. Preserve the KAYAK result or click-through URL when possible.

KAYAK supports filtering and sorting flight results by properties including price, airline, stops, duration, baggage allowance, and other flight characteristics. Use those filters instead of manually ignoring large numbers of irrelevant results.

## Flexible-Date Searches

If the user says their dates are flexible:

1. Search the requested dates first.
2. Check nearby dates or KAYAK's calendar/date tools.
3. Prefer a different date only when the savings or itinerary improvement is meaningful.
4. Clearly state the date difference.

Do not silently change the user's dates.

## Nearby Airports

If the user permits nearby airports, consider practical alternatives at both ends.

When recommending a different airport:

- identify the airport clearly
- state that it differs from the requested airport
- consider whether the savings justify the additional ground travel
- do not label it the "cheapest" overall without considering obvious transfer costs

## Comparing Results

For each serious candidate, capture:

```text
airline:
flight_numbers:
origin_airport:
destination_airport:
departure_time:
arrival_time:
departure_date:
arrival_date:
stops:
layover_airports:
total_duration:
cabin:
fare_name:
personal_item:
carry_on:
checked_bag:
change_rules:
booking_provider:
price:
currency:
kayak_url:
```

If KAYAK does not show a field, use `not shown` rather than guessing.

## Ranking

Unless the user specifies another priority, rank results using this order:

1. Meets all hard constraints
2. Reasonable total price
3. Fewer stops
4. Shorter total duration
5. Better departure and arrival times
6. Better baggage or fare conditions
7. Simpler itinerary and booking path

Do not automatically treat the lowest displayed fare as the best option.

### Cheapest

When the user asks for the cheapest flight:

- sort or filter by price
- still flag unusually long layovers, self-transfers, airport changes, or restrictive fare conditions
- identify the cheapest reasonable option and, when useful, the absolute cheapest option separately

### Fastest

When the user asks for the fastest flight:

- prioritize nonstop routes
- otherwise minimize total elapsed duration
- compare the price premium against the best-value option

### Best

When the user asks for the best flight without defining "best":

Use a balanced tradeoff between price, stops, duration, schedule, and fare conditions.

## Self-Transfers and Separate Tickets

Treat itineraries involving self-transfers, separate tickets, airport changes, or re-checking baggage as materially different from protected single-ticket connections.

Call this out prominently when visible.

Never imply that a self-transfer has normal through-ticket connection protection unless KAYAK or the booking provider explicitly confirms it.

## Baggage

Do not assume checked baggage or carry-on baggage is included.

When baggage matters:

1. inspect the fare details
2. record what is included
3. distinguish personal item, carry-on, and checked baggage
4. note when baggage fees are unknown or must be checked with the airline/provider

A slightly more expensive fare may be better if it includes baggage the cheaper fare excludes.

## Booking Providers

KAYAK may send the user to an airline or another booking provider.

When presenting a fare, include the provider when shown.

Prefer describing the result as:

`$420 on KAYAK, offered by [provider]`

rather than implying KAYAK itself necessarily sells the ticket.

## Price Verification

Airfare is dynamic.

Before calling a result the current best option:

1. refresh or revisit the result if the search has been open for a while
2. open the fare or booking path when possible
3. verify the displayed total corresponds to the correct traveler count
4. check whether taxes and mandatory fees appear included
5. check whether the fare still exists

If the click-through price differs from the search result, use the newer verified price and mention the change.

## Output Format

Return a compact comparison first.

Example:

| Option | Airline | Times | Stops | Duration | Bags | Price | Why pick it |
|---|---|---|---:|---:|---|---:|---|
| Best | ANA | 10:20–18:10 | 0 | 7h 50m | Carry-on shown | $612 | Best balance |
| Cheapest | Air X | 06:15–19:40 | 1 | 13h 25m | Not shown | $488 | Lowest fare |
| Fastest | ANA | 10:20–18:10 | 0 | 7h 50m | Carry-on shown | $612 | Nonstop |

Then give a short recommendation explaining the main tradeoff.

Include:

- exact travel dates
- airports
- total displayed price and currency
- stops and layovers
- total duration
- baggage information when relevant
- booking provider when shown
- KAYAK link when available
- a reminder that live airfare can change

## Accuracy Rules

- Never fabricate a fare, flight number, schedule, seat availability, baggage allowance, or booking link.
- Never claim a historical or cached fare is currently bookable.
- Never describe a flight as nonstop if it has a technical stop or connection.
- Pay attention to overnight arrivals and `+1` or `+2` day indicators.
- Use local airport times as displayed unless explicitly converting time zones.
- Verify airport codes when cities have multiple airports.
- Make clear whether a displayed total is per traveler or for all travelers.
- Do not confuse basic economy with standard economy.
- Do not assume two similarly named fares include the same benefits.

## Browser and Site Safety

Interact with KAYAK through normal user-facing search flows.

Do not:

- bypass CAPTCHAs or bot protections
- evade rate limits
- defeat access controls
- scrape at abusive volume
- attempt to access private or non-public KAYAK systems

If the site blocks automated access, report the limitation and provide the user with the search parameters they can paste into KAYAK manually.

## Useful Follow-Up Searches

After finding the initial options, consider these only when they help the user's stated goal:

- one day earlier or later
- nearby airports
- nonstop only
- one-stop maximum
- airline-direct booking option
- fare including checked baggage
- shorter layover
- earlier or later departure

Avoid broadening the search so much that it violates the user's original constraints.

## Final Check

Before responding, confirm:

- route is correct
- dates are correct
- passenger count is correct
- trip type is correct
- cabin is correct
- filters match the request
- price is in the stated currency
- itinerary dates account for overnight travel
- baggage claims are supported
- booking provider is identified when shown
- URL corresponds to the intended itinerary when available
