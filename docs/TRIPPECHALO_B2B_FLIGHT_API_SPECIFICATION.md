# 📘 TrippeChalo B2B Flight API Specification & Integration Guide
**Document Version:** 1.0.0  
**Release Date:** October 2026  
**Provider:** TrippeChalo India Private Limited  
**Protocol:** REST / JSON over HTTPS  
**Standard:** Enterprise Session Token Authentication (`tokenId` / OAuth2 Bearer) with Direct Key Support (`x-api-key`)  

---

## 📑 Table of Contents
1. [Preface & Integration Flow](#1-preface--integration-flow)
2. [Authentication & Environment Architecture](#2-authentication--environment-architecture)
3. [Method 1: Authentication & Token Acquisition (`POST /auth/token`)](#3-method-1-authentication--token-acquisition)
4. [Method 2: Flight Search (`GET /flights/search`)](#4-method-2-flight-search)
5. [Method 3: Flight Booking & PNR Issuance (`POST /flights/book`)](#5-method-3-flight-booking--pnr-issuance)
6. [Standard Error Codes & Resolution Matrix](#6-standard-error-codes--resolution-matrix)
7. [Sandbox Test Inventory Guide (6 Standard Scenarios)](#7-sandbox-test-inventory-guide)
8. [Developer Code Integration Samples](#8-developer-code-integration-samples)
9. [Postman Collection & Quickstart Guide](#9-postman-collection--quickstart-guide)
10. [Production Certification & Go-Live Checklist](#10-production-certification--go-live-checklist)
11. [Technical Support & Escalation Matrix](#11-technical-support--escalation-matrix)

---

## 1. Preface & Integration Flow

### Introduction
This document serves as the comprehensive, official technical specification for integrating with the **TrippeChalo B2B Flight API**. It is designed for external Online Travel Agencies (OTAs), travel wholesalers, meta-search engines, and corporate travel booking engines.

### Core Capabilities:
- **Direct Fixed Departure Access:** Guaranteed, pre-negotiated Series Fare inventory on high-demand domestic and international sectors.
- **Enterprise Token Security:** Industry-standard OAuth2/GAPI session token architecture (`tokenId`), supporting high concurrency and stateless backend performance.
- **Dual Operational Modes:** Instant sandbox testing with zero financial transaction, alongside automated live wallet balance booking.
- **Real-Time Seat Management:** Instant inventory deduction and real-time PNR generation.

### Complete 3-Step Integration Lifecycle:

```mermaid
sequenceDiagram
    autonumber
    actor OTA as Partner OTA / Backend
    participant TC as TrippeChalo B2B Gateway
    participant DB as Inventory & Wallet Engine

    Note over OTA,TC: Step 1: Authentication
    OTA->>TC: POST /api/v1/b2b/auth/token (API Key / Credentials)
    TC-->>OTA: 200 OK: Returns { tokenId, expiresIn: 86400 }

    Note over OTA,TC: Step 2: Flight Search
    OTA->>TC: GET /api/v1/b2b/flights/search?origin=DEL&destination=BOM&date=2026-12-10 (Header: tokenId)
    TC->>DB: Query Active Fixed Departure Inventory
    DB-->>TC: Available Seats, Fares, Segments
    TC-->>OTA: 200 OK: Returns matching flights array with sfId

    Note over OTA,TC: Step 3: Flight Booking
    OTA->>TC: POST /api/v1/b2b/flights/book (Header: tokenId, Body: sfId, passengers)
    alt Test Key (Sandbox Mode)
        TC-->>OTA: 200 OK: Confirmed Mock PNR (TEST-XXXXXX), No wallet deduction
    else Live Key (Production Mode)
        TC->>DB: Validate API Wallet & Decrement Seat
        TC-->>OTA: 200 OK: Confirmed Live PNR (TCXXXXXX), Deducts Net Fare
    end
```

---

## 2. Authentication & Environment Architecture

Every API request requires authorization. TrippeChalo supports two enterprise authentication approaches:
1. **Recommended (GAPI Standard):** Call the Authenticate method (`POST /auth/token`) to generate a session `tokenId`, then supply `tokenId: <TOKEN>` or `Authorization: Bearer <TOKEN>` in all subsequent requests.
2. **Direct Key Fallback:** Supply `x-api-key: <YOUR_API_KEY>` directly in request headers.

### Base URLs:
| Environment | Base URL | Routing |
|---|---|---|
| **Production / Live** | `https://api.trippechalo.com/api/v1/b2b` | Automatically routed when using `live_tc_...` credentials |
| **Sandbox / Staging** | `https://api.trippechalo.com/api/v1/b2b` | Automatically routed when using `test_tc_...` credentials |

### Key Prefixes & Modes:
| Key Type | Prefix Example | Operational Behavior |
|---|---|---|
| **Sandbox / Test** | `test_tc_skyline_demo_key_12345` | Returns live inventory. Bookings confirm with mock PNR (`TEST-XXXXXX`). **No real wallet balance or inventory seats are deducted.** |
| **Production / Live** | `live_tc_skyline_live_key_67890` | Validates API Wallet Balance, decrements physical seat inventory, and issues real confirmed airline PNR (`TCXXXXXX`). |

---

## 3. Method 1: Authentication & Token Acquisition

Generates a secure, 24-hour valid session `tokenId` for your B2B account.

- **HTTP Method:** `POST`
- **Path:** `/auth/token`
- **Full Sandbox/Live URL:** `https://api.trippechalo.com/api/v1/b2b/auth/token`

### 📥 Request Headers:
| Header | Type | Required | Value |
|---|---|---|---|
| `Content-Type` | String | **Yes** | `application/json` |

### 📦 Request Body Schema:
```json
{
  "apiKey": "test_tc_skyline_demo_key_12345"
}
```
*(Alternatively, you can provide `username` and `password`, or pass standard HTTP Basic Authentication `Authorization: Basic <base64>`)*.

---

### 📤 Success Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "tokenId": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRJZCI6IjZhZDY0NzlhOTlhYjRmZGMyYzcwNTZjZiIsImNvbXBhbnlOYW1lIjoiU2t5bGluZSBUcmF2ZWxzIEx0ZCIsImlzTGl2ZSI6ZmFsc2UsImVudmlyb25tZW50IjoiU0FOREJPWCIsImlhdCI6MTc5MjU4MzM1NSwiZXhwIjoxNzkyNjY5NzU1fQ.Jn7QV7PCfVFWSqAdVXp8Z7dsUGttrLcG9QhkVJdlOjw",
    "tokenType": "Bearer",
    "expiresIn": 86400,
    "environment": "SANDBOX",
    "client": {
      "companyName": "Skyline Travels Ltd",
      "email": "partner@travelagency.com",
      "status": "Live"
    }
  }
}
```

#### Field Description Table:
| Field | Type | Description |
|---|---|---|
| `success` | Boolean | `true` if authentication succeeded. |
| `data.tokenId` | String | **Session Token.** Pass this in the header of all subsequent API calls. |
| `data.tokenType` | String | Token type (`Bearer`). |
| `data.expiresIn` | Number | Validity in seconds (`86400` = 24 Hours). |
| `data.environment` | String | Current mode: `"SANDBOX"` or `"PRODUCTION"`. |
| `data.client.companyName` | String | Your registered partner company name. |
| `data.client.email` | String | Registered technical contact email. |
| `data.client.status` | String | Partner activation status (`Testing` or `Live`). |

> [!IMPORTANT]
> **Token Reuse Guideline:** Do **not** generate a new token for every search or booking call. Only 1 token should be generated and cached per 24-hour cycle. In case of an expired token (`401`), re-call `/auth/token` and continue.

---

## 4. Method 2: Flight Search

Searches available Fixed Departure (Series Fare) flight inventory matching the sector, date, and passenger count.

- **HTTP Method:** `GET`
- **Path:** `/flights/search`
- **Full URL:** `https://api.trippechalo.com/api/v1/b2b/flights/search`

### 📥 Request Headers:
| Header | Type | Required | Description / Example |
|---|---|---|---|
| `tokenId` | String | **Yes** *(or `Authorization`)* | Session Token received from `/auth/token` |
| `Authorization` | String | Optional | `Bearer <tokenId>` |
| `x-api-key` | String | Optional | Direct API Key fallback |
| `Accept` | String | No | `application/json` |

### 🔍 Query Parameters:
| Parameter | Type | Required | Description | Example |
|---|---|---|---|---|
| `origin` | String | **Yes** | 3-letter IATA origin airport code (Case-insensitive) | `DEL` |
| `destination` | String | **Yes** | 3-letter IATA destination airport code | `BOM` |
| `date` | String | **Yes** | Departure date in `YYYY-MM-DD` format | `2026-12-10` |
| `adults` | Number | No | Number of seats required (Default: `1`) | `2` |

---

### 📤 Success Response (`200 OK`):
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "sfId": "SF-TC-C1A-20261210",
      "airline": "IndiGo",
      "flightNo": "6E-2045",
      "origin": "DEL",
      "destination": "BOM",
      "departureTime": "07:00",
      "arrivalTime": "09:15",
      "travelDate": "2026-12-10T00:00:00.000Z",
      "fare": 4410,
      "availableSeats": 30,
      "bookingType": "ONE_WAY",
      "stops": 0,
      "segments": [
        {
          "origin": "DEL",
          "destination": "BOM",
          "airline": "IndiGo",
          "flightNo": "6E-2045",
          "departureTime": "07:00",
          "arrivalTime": "09:15"
        }
      ],
      "checkinBaggage": "15 KG",
      "cabinBaggage": "7 KG",
      "isRefundable": false
    }
  ]
}
```

#### Field-by-Field Description:
| Field | Type | Description |
|---|---|---|
| `success` | Boolean | `true` if search completed successfully. |
| `count` | Number | Total available flights found for the criteria. |
| `data[].sfId` | String | **Unique Series Fare ID.** Must be passed into the Booking API. |
| `data[].airline` | String | Operating and marketing airline name. |
| `data[].flightNo` | String | Flight number code (e.g. `6E-2045`, `AI-995`). |
| `data[].origin` | String | 3-letter IATA origin airport code. |
| `data[].destination` | String | 3-letter IATA destination airport code. |
| `data[].departureTime` | String | Local departure time in 24-hour format (`HH:MM`). |
| `data[].arrivalTime` | String | Local arrival time in 24-hour format (`HH:MM`). |
| `data[].travelDate` | String | ISO 8601 travel date timestamp. |
| `data[].fare` | Number | **Net payable fare per passenger in INR (₹)** including partner markup. |
| `data[].availableSeats` | Number | Live remaining seat count in the inventory block. |
| `data[].bookingType` | String | Flight trip type: `'ONE_WAY'` or `'ROUND_TRIP'`. |
| `data[].stops` | Number | Number of stops (`0` = Non-stop, `1` = 1-stop layover). |
| `data[].segments` | Array | Flight leg breakdown for connecting flights or round trips. |
| `data[].checkinBaggage` | String | Free checked baggage allowance (e.g. `"15 KG"`, `"30 KG"`). |
| `data[].cabinBaggage` | String | Free hand cabin baggage allowance (e.g. `"7 KG"`). |
| `data[].isRefundable` | Boolean | `false` for Fixed Departure series fares (strictly non-refundable). |

---

## 5. Method 3: Flight Booking & PNR Issuance

Books confirmed passenger seats on the specified Fixed Departure flight.

- **HTTP Method:** `POST`
- **Path:** `/flights/book`
- **Full URL:** `https://api.trippechalo.com/api/v1/b2b/flights/book`

### 📥 Request Headers:
| Header | Type | Required | Value |
|---|---|---|---|
| `tokenId` | String | **Yes** *(or `Authorization`)* | Session Token from `/auth/token` |
| `Authorization` | String | Optional | `Bearer <tokenId>` |
| `x-api-key` | String | Optional | Direct API Key fallback |
| `Content-Type` | String | **Yes** | `application/json` |

---

### 📦 Request Body Schema:
```json
{
  "sfId": "SF-TC-C1A-20261210",
  "passengers": [
    {
      "title": "Mr",
      "firstName": "Ramesh",
      "lastName": "Sharma",
      "type": "ADULT",
      "gender": "MALE",
      "dob": "1988-06-12",
      "passportNo": "P1234567",
      "passportExpiry": "2031-12-31"
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

#### Passenger Manifest Specification:
| Field | Type | Required | Allowed Values / Format | Description |
|---|---|---|---|---|
| `sfId` | String | **Yes** | Valid `sfId` from Search API | The flight inventory block being booked. |
| `passengers` | Array | **Yes** | Min length: 1 | Array of traveler objects. |
| `passengers[].title` | String | **Yes** | `Mr`, `Mrs`, `Ms`, `Mstr`, `Miss` | Salutation. |
| `passengers[].firstName` | String | **Yes** | Alphabetic string | Given name as per Gov ID / Passport. |
| `passengers[].lastName` | String | **Yes** | Alphabetic string | Surname as per Gov ID / Passport. |
| `passengers[].type` | String | **Yes** | `ADULT`, `CHILD`, `INFANT` | Passenger category. |
| `passengers[].gender` | String | **Yes** | `MALE`, `FEMALE` | Gender. |
| `passengers[].dob` | String | No | `YYYY-MM-DD` | Date of birth. Mandatory for infants/children. |
| `passengers[].passportNo` | String | Conditional | Alphanumeric | Mandatory for International flights. |
| `passengers[].passportExpiry`| String | Conditional | `YYYY-MM-DD` | Mandatory for International flights. |

---

### 📤 Success Response - Sandbox Mode (`200 OK`):
```json
{
  "success": true,
  "data": {
    "pnr": "TEST-440955",
    "status": "TEST_CONFIRMED",
    "message": "Booking successful in TEST mode. No seats or balance deducted.",
    "passengers": [
      {
        "title": "Mr",
        "firstName": "Ramesh",
        "lastName": "Sharma",
        "type": "ADULT",
        "gender": "MALE",
        "dob": "1988-06-12"
      }
    ]
  }
}
```

---

### 📤 Success Response - Production Live Mode (`200 OK`):
```json
{
  "success": true,
  "data": {
    "pnr": "TC762393",
    "status": "CONFIRMED",
    "totalAmountDeducted": 8820,
    "passengers": [
      {
        "title": "Mr",
        "firstName": "Ramesh",
        "lastName": "Sharma",
        "type": "ADULT",
        "gender": "MALE",
        "dob": "1988-06-12"
      }
    ]
  }
}
```

---

## 6. Standard Error Codes & Resolution Matrix

TrippeChalo APIs return standard HTTP response codes accompanied by a descriptive JSON payload:

```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

| HTTP Status | Error Scenario | Resolution |
|---|---|---|
| **`400 Bad Request`** | `"origin, destination, and date are required"` | Ensure all mandatory query parameters are present in search request. |
| **`400 Bad Request`** | `"sfId and passengers array are required"` | Check JSON body structure and ensure at least 1 passenger is provided. |
| **`400 Bad Request`** | `"Not enough seats available"` | Requested passenger count exceeds remaining seat inventory. Re-search for updated seats. |
| **`401 Unauthorized`** | `"Authentication required"` or `"Invalid session token"` | Ensure `tokenId` or `Authorization: Bearer <token>` is passed in headers, or re-call `/auth/token`. |
| **`401 Unauthorized`** | `"Invalid API Key or Credentials"` | Verify your API key with TrippeChalo partner support. |
| **`402 Payment Required`**| `"Insufficient API Wallet Balance. Please recharge."` | Top up your B2B API Wallet balance via Admin Portal or wire transfer. |
| **`403 Forbidden`** | `"Your API account has been suspended"` | Contact your TrippeChalo relationship manager. |
| **`403 Forbidden`** | `"Your account is not approved for LIVE mode yet"` | Complete sandbox verification before using live production keys. |
| **`404 Not Found`** | `"Flight not found or inactive"` | Re-verify `sfId` from the latest `/flights/search` response. |
| **`500 Server Error`** | `"Internal Server Error"` | Contact TrippeChalo 24/7 technical support with request timestamp. |

---

## 7. Sandbox Test Inventory Guide

Partners can immediately test the **6 standard aviation scenarios** permanently seeded in our sandbox environment:

| Test Case | Scenario | Origin | Dest | Available Test Dates | Airline | Approx Net Fare |
|:---:|---|:---:|:---:|---|:---:|:---:|
| **Case 1** | Domestic Non-Stop | `DEL` | `BOM` | `2026-12-05`, `2026-12-10`, `2026-12-15`, `2026-12-22`, `2027-01-08` | IndiGo / Air India | ₹4,200 |
| **Case 2** | International Non-Stop | `DEL` | `DXB` | `2026-12-06`, `2026-12-12`, `2026-12-18`, `2026-12-24`, `2027-01-12` | Air India / SpiceJet | ₹12,500 |
| **Case 3** | Domestic 1-Stop (via PNQ) | `DEL` | `BLR` | `2026-12-04`, `2026-12-09`, `2026-12-16`, `2026-12-23`, `2027-01-15` | IndiGo | ₹5,600 |
| **Case 4** | International 1-Stop (via COK) | `DEL` | `DXB` | `2026-12-07`, `2026-12-14`, `2026-12-21`, `2026-12-28`, `2027-01-18` | Air India | ₹14,500 |
| **Case 5** | Round-Trip Non-Stop | `DEL` | `DXB` | `2026-12-05`, `2026-12-12`, `2026-12-19`, `2026-12-26`, `2027-01-10` | SpiceJet | ₹21,500 |
| **Case 6** | Round-Trip 1-Stop (DPS Bali via DXB)| `DEL` | `DPS` | `2026-12-08`, `2026-12-15`, `2026-12-22`, `2027-01-05`, `2027-01-20` | Air India | ₹27,500 |

---

## 8. Developer Code Integration Samples

### 1. cURL Full Lifecycle Flow

#### Step 1: Authenticate
```bash
curl -X POST "https://api.trippechalo.com/api/v1/b2b/auth/token" \
     -H "Content-Type: application/json" \
     -d '{"apiKey": "test_tc_skyline_demo_key_12345"}'
```

#### Step 2: Search Flights (Using Token)
```bash
curl -X GET "https://api.trippechalo.com/api/v1/b2b/flights/search?origin=DEL&destination=BOM&date=2026-12-10&adults=1" \
     -H "tokenId: YOUR_SESSION_TOKEN_HERE"
```

#### Step 3: Book Flight (Using Token)
```bash
curl -X POST "https://api.trippechalo.com/api/v1/b2b/flights/book" \
     -H "tokenId: YOUR_SESSION_TOKEN_HERE" \
     -H "Content-Type: application/json" \
     -d '{
       "sfId": "SF-TC-C1A-20261210",
       "passengers": [
         {
           "title": "Mr",
           "firstName": "Gaurav",
           "lastName": "Sharma",
           "type": "ADULT",
           "gender": "MALE",
           "dob": "1994-08-15"
         }
       ]
     }'
```

---

### 2. Node.js / TypeScript Integration (Axios)
```typescript
import axios from 'axios';

const API_BASE = 'https://api.trippechalo.com/api/v1/b2b';
const API_KEY = 'test_tc_skyline_demo_key_12345';

async function executeFlightFlow() {
  // 1. Authenticate & Obtain Token
  const authRes = await axios.post(`${API_BASE}/auth/token`, { apiKey: API_KEY });
  const tokenId = authRes.data.data.tokenId;
  console.log('✅ Session Token Acquired:', tokenId.substring(0, 25) + '...');

  // Setup client with session token
  const apiClient = axios.create({
    baseURL: API_BASE,
    headers: {
      'tokenId': tokenId,
      'Content-Type': 'application/json'
    }
  });

  // 2. Search Flights
  const searchRes = await apiClient.get('/flights/search', {
    params: {
      origin: 'DEL',
      destination: 'BOM',
      date: '2026-12-10',
      adults: 1
    }
  });

  const availableFlight = searchRes.data.data[0];
  console.log(`✅ Found ${searchRes.data.count} flights. Selected: ${availableFlight.flightNo} (Fare: ₹${availableFlight.fare})`);

  // 3. Book Flight
  const bookRes = await apiClient.post('/flights/book', {
    sfId: availableFlight.sfId,
    passengers: [
      {
        title: 'Mr',
        firstName: 'Gaurav',
        lastName: 'Sharma',
        type: 'ADULT',
        gender: 'MALE',
        dob: '1994-08-15'
      }
    ]
  });

  console.log('🎉 Confirmed PNR:', bookRes.data.data.pnr, 'Status:', bookRes.data.data.status);
}

executeFlightFlow().catch(console.error);
```

---

### 3. Python 3 Integration (`requests`)
```python
import requests

API_BASE = "https://api.trippechalo.com/api/v1/b2b"
API_KEY = "test_tc_skyline_demo_key_12345"

# 1. Authenticate
auth_res = requests.post(f"{API_BASE}/auth/token", json={"apiKey": API_KEY})
token_id = auth_res.json()["data"]["tokenId"]
headers = {"tokenId": token_id, "Content-Type": "application/json"}

# 2. Search Flights
params = {"origin": "DEL", "destination": "BOM", "date": "2026-12-10", "adults": 1}
search_res = requests.get(f"{API_BASE}/flights/search", headers=headers, params=params)
flight = search_res.json()["data"][0]

# 3. Book Flight
booking_payload = {
    "sfId": flight["sfId"],
    "passengers": [
        {"title": "Mr", "firstName": "Gaurav", "lastName": "Sharma", "type": "ADULT", "gender": "MALE", "dob": "1994-08-15"}
    ]
}
book_res = requests.post(f"{API_BASE}/flights/book", headers=headers, json=booking_payload)
print(f"Confirmed PNR: {book_res.json()['data']['pnr']}")
```

---

## 9. Postman Collection & Quickstart Guide

A ready-to-use Postman Collection is provided with automatic token extraction and chaining:
👉 **File Path:** [`docs/TRIPPECHALO_B2B_API_POSTMAN_COLLECTION.json`](file:///c:/Users/gasha/Desktop/TravelBookingApp/Server/docs/TRIPPECHALO_B2B_API_POSTMAN_COLLECTION.json)

### Quick Setup:
1. Open Postman and click **Import**.
2. Select `TRIPPECHALO_B2B_API_POSTMAN_COLLECTION.json`.
3. Set your collection variable `baseUrl` to your deployed backend URL:  
   `https://<YOUR_DEPLOYED_SERVER_URL>/api/v1/b2b`
4. Run request **`1. Authenticate & Obtain Session Token`**. The test script will automatically save `{{tokenId}}`.
5. Run **`2. Search Flights`** and **`5. Book Flight`** seamlessly!

---

## 10. Production Certification & Go-Live Checklist

To transition from Sandbox (`test_tc_...`) to Production Live (`live_tc_...`), partners must complete the following 4 milestones:

- [ ] **Milestone 1 - Authentication Validation:** Successfully call `/auth/token` and handle 24-hour token caching.
- [ ] **Milestone 2 - Search & Error Handling:** Successfully parse domestic & international flight responses, layover segments, and non-refundable Series Fare indicators.
- [ ] **Milestone 3 - Test Booking Run:** Generate at least 2 successful Sandbox mock bookings (`TEST-XXXXXX`) across one domestic and one international route.
- [ ] **Milestone 4 - Wallet Setup:** Fund your B2B API Wallet with initial deposit credit balance.

Upon submission of your test logs to `api-support@trippechalo.com`, your account status will be updated to **`Live`** and your Production API Key will be enabled.

---

## 11. Technical Support & Escalation Matrix

- **Integration Support Email:** `api-support@trippechalo.com`
- **Technical Hotline / WhatsApp:** `+91 95559 34205`
- **Partner Admin Portal:** `https://trippechalo.com/admin/b2b-partners`
- **Headquarters:** TrippeChalo India Private Limited, New Delhi, India.

---
*© 2026 TrippeChalo India Private Limited. All rights reserved. Confidential and proprietary to TrippeChalo partners.*
