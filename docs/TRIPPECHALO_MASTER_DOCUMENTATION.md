# ✈️ TRIPPECHALO - COMPLETE SYSTEM MASTER DOCUMENTATION
**Version:** 2.0 (Consolidated) | **Last Updated:** October 2026  
**Company:** TrippeChalo India Private Limited  
**System:** Travel Booking Platform, GAPI Flight Engine, Fixed Departure (FD) Inventory & B2B Distribution API  

---

## 📑 TABLE OF CONTENTS
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [GAPI UAT Certification - All 6 Test Scenarios](#2-gapi-uat-certification---all-6-test-scenarios)
3. [TrippeChalo Fixed Departure (FD / Series Fare) System](#3-trippechalo-fixed-departure-fd--series-fare-system)
4. [TrippeChalo B2B Flight Distribution REST API](#4-trippechalo-b2b-flight-distribution-rest-api)
5. [Admin Key Management & Partner Onboarding](#5-admin-key-management--partner-onboarding)
6. [Testing & Verification Reference](#6-testing--verification-reference)

---

# 1. SYSTEM OVERVIEW & ARCHITECTURE

TrippeChalo operates an omnichannel flight distribution and booking platform supporting two core inventory models:
1. **Third-Party Consumed Inventory (GAPI / Nexus / AirIQ / Duffel):** Flights fetched via external APIs for B2C travelers and B2B agents.
2. **Proprietary Fixed Departure (FD) Inventory (Series Fares):** Contracted bulk block seats managed directly by TrippeChalo, distributed via:
   - **Channel A: B2B Agent Web Portal** (Travel agents login and book via wallet/credit).
   - **Channel B: B2B REST API** (External OTAs and wholesalers integrate via `x-api-key`).

```
                              ┌──────────────────────────────────────────────┐
                              │           TrippeChalo Central Engine         │
                              └──────────────────────┬───────────────────────┘
                                                     │
           ┌─────────────────────────────────────────┼────────────────────────────────────────┐
           ▼                                         ▼                                        ▼
 ┌──────────────────────┐                 ┌──────────────────────┐                ┌──────────────────────┐
 │   GAPI Integration   │                 │    TrippeChalo FD    │                │    TrippeChalo B2B   │
 │   6/6 Cases UAT      │                 │  Inventory (MongoDB) │                │       REST API       │
 │   Certified Live     │                 │  40 Flights Dec/Jan  │                │   Search & Book API  │
 └──────────────────────┘                 └──────────────────────┘                └──────────────────────┘
```

---

# 2. GAPI UAT CERTIFICATION - ALL 6 TEST SCENARIOS

All 6 mandatory UAT test scenarios have been booked directly through the portal UI and confirmed in the GAPI Sandbox environment with the required passenger composition.

### 📊 Quick Reference Table for Certification

| Case # | Scenario | Sector | Travel Dates | Flight No | GAPI TxID | Airline PNR | Status | Total Fare |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | **Non-Stop Domestic** | `BLR ➔ MAA` | 04-Nov-2026 | Air India `AI-444` | **`CUG1QC9226S2513`** | **`BLRMAA`** | ✅ Confirmed | ₹1,400 |
| **2** | **Non-Stop International** | `DEL ➔ DXB` | 05-Nov-2026 | Air India `AI-23456` | **`CUGUU4OV26S7364`** | **`TESTTEST`** | ✅ Confirmed | ₹46,000 |
| **3** | **1-Stop Domestic** | `DEL ➔ BLR` | 01-Nov-2026 | IndiGo `6E-2343` | **`CUG1EPB526S4681`** | **`TESTTEST`** | ✅ Confirmed | ₹10,000 |
| **4** | **1-Stop International** | `DEL ➔ DXB` | 01-Nov-2026 | Air India `AI-2883` | **`CUGB293W26S91017`** | **`TESTTEST`** | ✅ Confirmed | ₹46,500 |
| **5** | **Round-Trip Non-Stop** | `DEL ⇄ DXB` | 20-Nov to 24-Nov-2026 | SpiceJet `SG-23434 / 87678` | **`CUGJ3CKV26S9128`** | **`ROUNDTRIP`** | ✅ Confirmed | ₹9,200 |
| **6** | **Round-Trip 1-Stop** | `DEL ⇄ DPS` | 10-Dec to 15-Dec-2026 | Air India `AI-678, 700 / 786, 800` | **`CUGCTAGK26S82109`** | **`UHIKJY`** | ✅ Confirmed | ₹1,000 |

### 🧑‍🤝‍🧑 Standard Test Passenger Details (Used Across All Cases):
- **Adult 1 (Lead Passenger):** `Mr Test Cug` | DOB: `1990-05-10` | Passport: `P1234561` (Exp: `2031-12-31`)
- **Adult 2:** `Mrs Meera Cug` | DOB: `1992-08-22` | Passport: `P1234562` (Exp: `2031-12-31`)
- **Child (Age 2-12):** `Mstr Arjun Cug` | DOB: `2018-03-15` | Passport: `P1234563` (Exp: `2031-12-31`)
- **Infant (Age < 2):** `Miss Baby Cug` | DOB: `2025-02-10` | Passport: `P1234564` (Exp: `2031-12-31`)
- **Agency Contact:** Phone: `9315740450` | Email: `gapitpl@gmail.com`

---

# 3. TRIPPECHALO FIXED DEPARTURE (FD / SERIES FARE) SYSTEM

Fixed Departures (FD) are contracted bulk airline block seats purchased in advance. TrippeChalo stores and manages them in MongoDB under the `SeriesFare` collection.

### 📅 Active Seeded Inventory (December 2026 & January 2027)
40 real-time Series Fare inventory records have been populated covering **at least 5 distinct travel dates** for every scenario:

1. **Case 1: Domestic Non-Stop (`DEL ➔ BOM`)**
   - **Dates:** `05-Dec`, `10-Dec`, `15-Dec`, `22-Dec-2026`, and `08-Jan-2027`
   - **Flights:** IndiGo `6E-2045` (07:00 ➔ 09:15, ₹4,200) & Air India `AI-887` (18:30 ➔ 20:45, ₹4,500)
   - **Seats:** 25-30 available per flight

2. **Case 2: International Non-Stop (`DEL ➔ DXB`)**
   - **Dates:** `06-Dec`, `12-Dec`, `18-Dec`, `24-Dec-2026`, and `12-Jan-2027`
   - **Flights:** Air India `AI-995` (10:00 ➔ 12:35, ₹12,500) & SpiceJet `SG-11` (16:15 ➔ 18:45, ₹11,800)
   - **Seats:** 25-28 available per flight | Baggage: 30 KG Check-in

3. **Case 3: Domestic 1-Stop (`DEL ➔ BLR` via `PNQ Pune`)**
   - **Dates:** `04-Dec`, `09-Dec`, `16-Dec`, `23-Dec-2026`, and `15-Jan-2027`
   - **Flight:** IndiGo `6E-2343 / 6E-5431` (06:00 DEL ➔ Layover PNQ 1h 45m ➔ 11:20 BLR) | ₹5,600 | 20 Seats

4. **Case 4: International 1-Stop (`DEL ➔ DXB` via `COK Kochi`)**
   - **Dates:** `07-Dec`, `14-Dec`, `21-Dec`, `28-Dec-2026`, and `18-Jan-2027`
   - **Flight:** Air India `AI-2883 / AI-1205` (05:55 DEL ➔ Layover COK 2h 00m ➔ 13:45 DXB) | ₹14,500 | 20 Seats

5. **Case 5: Single PNR Round-Trip Non-Stop (`DEL ⇄ DXB`)**
   - **Return Combos:** `05-10 Dec`, `12-17 Dec`, `19-24 Dec`, `26-31 Dec 2026`, and `10-15 Jan 2027`
   - **Flight:** SpiceJet `SG-23434 / SG-87678` | Round-Trip Fare: ₹21,500 | 25 Seats

6. **Case 6: Single PNR Round-Trip 1-Stop (`DEL ⇄ DPS Bali` via `DXB`)**
   - **Return Combos:** `08-14 Dec`, `15-21 Dec`, `22-28 Dec 2026`, `05-11 Jan`, and `20-26 Jan 2027`
   - **Flight:** Air India `AI-678, AI-700 / AI-786, AI-800` (4 segments with layover) | Fare: ₹27,500 | 20 Seats

---

# 4. TRIPPECHALO B2B FLIGHT DISTRIBUTION REST API

Just like TrippeChalo consumes GAPI and Nexus APIs, external OTAs, portals, and sub-agents can integrate TrippeChalo's B2B REST API to search and book our Fixed Departure inventory.

### 🔑 Authentication:
Every request requires the `x-api-key` header:
- **Test Key (`test_tc_...`):** Sandbox testing. Generates `TEST-XXXXXX` PNRs without deducting wallet or holding inventory.
- **Live Key (`live_tc_...`):** Production booking. Validates API wallet balance, deducts fare, decrements seats, and issues confirmed `TCXXXXXX` PNR.

### 🌐 Base URLs:
- **Sandbox / Live Base URL:** `https://api.trippechalo.com/api/v1/b2b` *(or current hosted backend URL)*

---

### Endpoint 1: Search Flights
`GET /api/v1/b2b/flights/search`

#### Query Parameters:
| Parameter | Type | Required | Description | Example |
|---|---|---|---|---|
| `origin` | String | Yes | 3-letter IATA Airport Code | `DEL` |
| `destination` | String | Yes | 3-letter IATA Airport Code | `DXB` |
| `date` | String | Yes | Travel Date (YYYY-MM-DD) | `2026-12-18` |
| `adults` | Number | No | Number of Adult Passengers (Default: 1) | `2` |

#### Headers:
```http
x-api-key: test_tc_skyline_demo_key_12345
```

#### Sample Response (`200 OK`):
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "sfId": "SF-TC-C2A-20261218",
      "airline": "Air India",
      "flightNo": "AI-995",
      "origin": "DEL",
      "destination": "DXB",
      "departureTime": "10:00",
      "arrivalTime": "12:35",
      "travelDate": "2026-12-18T00:00:00.000Z",
      "fare": 13125,
      "availableSeats": 25,
      "bookingType": "ONE_WAY",
      "stops": 0,
      "checkinBaggage": "30 KG",
      "cabinBaggage": "7 KG",
      "isRefundable": false
    }
  ]
}
```

---

### Endpoint 2: Book Flight
`POST /api/v1/b2b/flights/book`

#### Headers:
```http
x-api-key: test_tc_skyline_demo_key_12345
Content-Type: application/json
```

#### Request Body:
```json
{
  "sfId": "SF-TC-C2A-20261218",
  "passengers": [
    {
      "title": "Mr",
      "firstName": "Ramesh",
      "lastName": "Sharma",
      "type": "ADULT",
      "gender": "MALE",
      "dob": "1988-06-12"
    },
    {
      "title": "Mrs",
      "firstName": "Pooja",
      "lastName": "Sharma",
      "type": "ADULT",
      "gender": "FEMALE",
      "dob": "1992-04-20"
    }
  ]
}
```

#### Sample Response - Test Mode (`200 OK`):
```json
{
  "success": true,
  "data": {
    "pnr": "TEST-440955",
    "status": "TEST_CONFIRMED",
    "message": "Booking successful in TEST mode. No seats or balance deducted.",
    "passengers": [...]
  }
}
```

#### Sample Response - Live Mode (`200 OK`):
```json
{
  "success": true,
  "data": {
    "pnr": "TC762393",
    "status": "CONFIRMED",
    "totalAmountDeducted": 26250,
    "passengers": [...]
  }
}
```

---

# 5. ADMIN KEY MANAGEMENT & PARTNER ONBOARDING

Administrators manage API partners through the **Admin Portal UI** (`Client/src/pages/dashboard/admin/AdminB2BPartners.tsx`):
1. **Create Partner:** Enter Company Name, Contact Email, Contact Name, Rate Limit, and Markup %.
2. **Instant Keys:** System automatically generates cryptographically secure `testApiKey` and `liveApiKey`.
3. **Wallet Recharge:** Admin credits the partner's API Wallet for live bookings.
4. **Markup Engine:** Admin can configure customized profit margins per partner (e.g., 5% added to net fare).

---

# 6. TESTING & VERIFICATION REFERENCE

### Automated Scripts Available:
- **`seed-fd-inventory.ts`**: Re-populates the 40 standard Fixed Departure test flights for December 2026 & January 2027.
- **`verify-all-cases.ts`**: Tests the search API across all 6 cases and verifies connecting segments, layovers, and booking responses.
- **`test-b2b-fd-api.ts`**: Verifies dual-mode booking (Test Mode vs Live Mode balance deduction).
- **`build-gapi-json-submission.js`**: Generates machine-readable `.json` certification log packages for GAPI UAT.

---
*Maintained by TrippeChalo Technical Team.*
