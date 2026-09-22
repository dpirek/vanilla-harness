---
name: flight-finder
description: Find, compare, verify, and recommend flight tickets using airline websites, flight search engines, and booking platforms. Use when a user asks to find flights, compare airfare, search flexible dates, identify the cheapest or best itinerary, or provide booking options.
---

# Flight Ticket Finder

## Purpose

Find practical flight options that match the user's route, dates, budget, baggage needs, schedule, and other preferences.

The goal is not only to find the lowest displayed fare, but to identify the best bookable options after checking important details such as baggage, layovers, airport changes, self-transfers, fare restrictions, and booking source reliability.

## Information to Extract

Before searching, identify as many of these as the user has provided:

- Origin city or airport
- Destination city or airport
- Departure date
- Return date, if round trip
- One-way, round-trip, or multi-city
- Number of passengers
- Passenger ages if relevant
- Cabin class
- Budget
- Checked baggage requirement
- Carry-on requirement
- Maximum number of stops
- Maximum travel time
- Preferred departure or arrival times
- Preferred or excluded airlines
- Nearby airports allowed
- Flexible dates
- Overnight layovers allowed
- Self-transfer allowed
- Visa or transit restrictions if mentioned

Do not repeatedly ask for information the user has already supplied.

If some details are missing, make reasonable assumptions when possible and clearly state them.

## Recommended Search Sources

Search multiple sources when possible.

### Flight Search Engines

Useful starting points:

- Google Flights
- Skyscanner
- Kayak
- Momondo
- Kiwi
- Expedia
- Trip.com

### Airline Websites

After identifying promising flights, check the operating airline's official website.

Examples:

- Lufthansa
- United
- Delta
- American Airlines
- Emirates
- Qatar Airways
- Singapore Airlines
- Turkish Airlines
- Ryanair
- easyJet
- Wizz Air

Prefer booking directly with the airline when the total price is similar.

## Search Strategy

### 1. Search the Exact Request

Start with the exact origin, destination, and requested dates.

Search both airport codes and city names when useful.

Example searches:

- `PRG NYC flights September 15 2026`
- `Prague to New York flights Sep 15 2026`
- `PRG JFK airfare`
- `PRG EWR flights`

### 2. Check Nearby Airports

When appropriate, check alternate airports.

Examples:

New York:
- JFK
- EWR
- LGA

London:
- LHR
- LGW
- STN
- LTN

Paris:
- CDG
- ORY

Milan:
- MXP
- LIN
- BGY

Always account for the cost and time needed to reach the alternate airport.

### 3. Check Flexible Dates

If dates are flexible, search:

- ±1 day
- ±2 days
- ±3 days
- Whole-week fare calendars
- Cheapest-date or date-grid views

A flight one day earlier or later can sometimes be much cheaper.

### 4. Test Separate Tickets

Compare:

- Normal round-trip ticket
- Two one-way tickets
- Different airlines each direction
- Separate positioning flight plus long-haul flight

Only recommend separate tickets when the savings justify the added risk.

Clearly flag self-transfer itineraries.

### 5. Search Alternative Routes

For expensive routes, try major connecting hubs.

Examples:

Europe to North America:
- LHR
- FRA
- AMS
- CDG
- MAD
- LIS
- DUB

Europe to Asia:
- IST
- DOH
- DXB
- AUH
- SIN

Asia to Europe:
- SIN
- BKK
- DOH
- DXB
- IST

Do not create unnecessarily complex itineraries just to save a small amount.

## Price Verification

A displayed search-engine price is not enough.

Whenever possible, verify:

- Current fare
- Currency
- Taxes and fees
- Carry-on allowance
- Checked baggage allowance
- Seat selection fees
- Payment fees
- Fare class
- Change policy
- Cancellation policy
- Whether the itinerary is actually available
- Whether the price is per passenger or total

Prefer recently verified prices.

State that airfare can change quickly.

## Self-Transfer Checks

Treat self-transfer itineraries carefully.

Check:

- Whether baggage must be collected and rechecked
- Whether immigration is required
- Whether a terminal change is needed
- Whether an airport change is needed
- Minimum connection time
- Whether the second airline protects the passenger if the first flight is delayed

Clearly label these options:

`SELF-TRANSFER — separate-ticket connection risk`

Do not present a risky self-transfer as equivalent to a protected connection.

## Layover Evaluation

Evaluate both price and convenience.

Consider:

- Total travel time
- Number of stops
- Overnight layovers
- Airport quality
- Terminal changes
- Airport changes
- Transit visa requirements
- Connection duration

Avoid recommending very short connections unless they are protected and realistic.

## Booking Source Evaluation

Preferred order:

1. Airline directly
2. Major reputable travel agency
3. Smaller online travel agency only when savings are meaningful

Before recommending an online travel agency, consider:

- Customer service reputation
- Change and cancellation process
- Hidden fees
- Whether tickets are issued immediately
- Whether baggage is included
- Whether the itinerary uses separate tickets

Do not recommend an unknown booking website solely because it shows the lowest price.

## Search Queries

Useful search patterns:

`[ORIGIN] to [DESTINATION] flights [DATE]`

`[ORIGIN AIRPORT] [DESTINATION AIRPORT] airfare`

`cheap flights [CITY] to [CITY] [MONTH YEAR]`

`[AIRLINE] [ROUTE] [DATE]`

`site:airline.com [ORIGIN] [DESTINATION]`

For flexible searches:

`cheapest flights [ORIGIN] to [DESTINATION] [MONTH YEAR]`

For specific constraints:

`[ORIGIN] to [DESTINATION] nonstop [DATE]`

`[ORIGIN] to [DESTINATION] one stop [DATE]`

## Ranking Flights

Do not rank only by price.

Use a practical scoring model such as:

### Price
40%

### Total travel time
20%

### Number and quality of connections
15%

### Baggage included
10%

### Booking reliability
10%

### Schedule convenience
5%

Adjust these weights if the user prioritizes something specific.

For example, if the user says "cheapest possible," prioritize price more heavily.

## Output Format

Give the user a short comparison of the strongest options.

Recommended format:

| Option | Airline | Route | Times | Stops | Duration | Baggage | Price | Booking |
|---|---|---|---|---|---|---|---|---|

Then provide:

- Cheapest option
- Best overall option
- Fastest reasonable option

Explain any important trade-offs.

Example:

**Best overall:** Lufthansa via Frankfurt for $612 round trip. It costs $34 more than the cheapest option but avoids a self-transfer and cuts total travel time by 5 hours.

## Price Normalization

When comparing prices:

- Use the same currency
- Compare total trip price
- Compare the same passenger count
- Include mandatory fees
- Include required baggage

If necessary, convert currencies using a current exchange rate.

Never compare a fare without baggage against a fare with baggage without explaining the difference.

## Date Flexibility

When the user has flexible dates, summarize the cheapest combinations.

Example:

| Departure | Return | Price |
|---|---|---:|
| Sep 14 | Sep 21 | $520 |
| Sep 15 | Sep 22 | $547 |
| Sep 16 | Sep 23 | $498 |

Highlight meaningful savings.

## International Travel Checks

For international itineraries, consider:

- Passport validity
- Transit visa requirements
- Entry requirements
- Airport transit rules
- Separate-ticket immigration requirements

Do not provide definitive visa advice without checking current official sources.

## Budget Airlines

For low-cost carriers, verify extras.

Common additional costs include:

- Cabin baggage
- Checked baggage
- Seat assignment
- Airport check-in
- Priority boarding
- Payment fees

Compare the realistic final cost rather than the headline fare.

## Error Prevention

Before reporting a flight, verify:

- Date
- Local departure time
- Local arrival time
- Arrival date
- Airport codes
- Airline
- Flight number if available
- Stop count
- Total duration
- Fare currency

Pay special attention to overnight arrivals and time-zone changes.

## Recommended Response Style

Be concise and decision-oriented.

Do not overwhelm the user with dozens of flights.

Usually provide 3 to 5 strong options unless the user asks for a larger list.

Lead with the best choices and explain why they are good.

When prices are live or recently searched, include the search or verification time if useful.

## Example Workflow

User:

`Find me flights from Prague to New York around September 15. I can move the dates by 2 days.`

Process:

1. Search PRG to NYC for September 13 through September 17.
2. Search JFK and EWR separately.
3. Check fare calendar results.
4. Compare round-trip and separate one-way fares.
5. Remove impractical self-transfers.
6. Check baggage.
7. Verify the strongest options on airline websites.
8. Rank the results by price and convenience.
9. Return the top 3 to 5 options with booking sources.

## Final Checklist

Before answering, confirm:

- [ ] Correct origin
- [ ] Correct destination
- [ ] Correct dates
- [ ] Correct passenger count
- [ ] Currency identified
- [ ] Price is comparable across options
- [ ] Stops identified
- [ ] Travel duration checked
- [ ] Baggage checked when relevant
- [ ] Self-transfer clearly labeled
- [ ] Airport changes clearly labeled
- [ ] Strongest fares verified when possible
- [ ] Airline-direct option considered
- [ ] Best overall option identified
