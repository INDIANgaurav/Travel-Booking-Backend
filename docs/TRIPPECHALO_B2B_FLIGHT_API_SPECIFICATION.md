# 📘 TrippeChalo B2B Flight API Specification
**Version:** 1.0.0  
**Company:** TrippeChalo India Private Limited  
**Protocol:** REST / JSON over HTTPS  
**Standard:** Header API Key Authentication (`x-api-key`)  

---

## 📑 Table of Contents
1. [Overview & Architecture](#1-overview--architecture)
2. [Authentication & Environments](#2-authentication--environments)
3. [Endpoint 1: Flight Search (`GET /flights/search`)](#3-endpoint-1-flight-search)
4. [Endpoint 2: Flight Booking (`POST /flights/book`)](#4-endpoint-2-flight-booking)
5. [Standard Error Codes & Handling](#5-standard-error-codes--handling)
6. [Sandbox Test Inventory Guide](#6-sandbox-test-inventory-guide)
7. [Developer Quickstart & Code Examples](#7-developer-quickstart--code-examples)

---

## 1. Overview & Architecture

The **TrippeChalo B2B Flight API** allows authorized external Online Travel Agencies (OTAs), travel wholesalers, and software partners to access, search, and book TrippeChalo's proprietary **Fixed Departure (Series Fare / Group Fare)** flight inventory.

### Key Highlights:
- **Direct Fixed Departure Access:** Guaranteed bulk block seats on high-demand domestic and international sectors.
- **Single-Header Authentication:** Fast, stateless authentication using `x-api-key`. No token expiration or login management required.
- **Dual Operational Modes:** Instant sandbox testing (`test_tc_...`) and automated production live bookings with wallet balance settlement (`live_tc_...`).
- **Real-Time Seat & Inventory Management:** Synchronized seat decrementing and automated sold-out status updates.

### Base URLs:
| Environment | Base URL |
|---|---|
| **Production / Live** | `https://api.trippechalo.com/api/v1/b2b` |
| **Sandbox / Staging** | `https://api.trippechalo.com/api/v1/b2b` *(Routed automatically based on API Key)* |

---

## 2. Authentication & Environments

Every API request must include your assigned API Key in the HTTP Request Header:

```http
x-api-key: YOUR_API_KEY
```

### Modes & Key Prefixes:
| Key Type | Prefix Example | Behavior |
|---|---|---|
| **Sandbox / Test Key** | `test_tc_skyline_12345` | Returns live search data. Bookings confirm with mock PNR (`TEST-XXXXXX`). **No real wallet balance or inventory seats are deducted.** |
| **Production / Live Key** | `live_tc_skyline_67890` | Validates API Wallet Balance, deducts ticket cost, decrements inventory seats, and issues a live PNR (`TCXXXXXX`). |

> [!NOTE]
> Keep your API keys confidential. Do not expose live keys in client-side applications (browsers or mobile apps). All calls should originate from your backend servers.

---

## 3. Endpoint 1: Flight Search

Retrieves available Fixed Departure flights matching the requested route, date, and passenger count.

- **HTTP Method:** `GET`
- **Path:** `/flights/search`
- **Full URL:** `https://api.trippechalo.com/api/v1/b2b/flights/search`

### 📥 Request Headers:
| Header | Type | Required | Description |
|---|---|---|---|
| `x-api-key` | String | **Yes** | Your TrippeChalo Test or Live API Key |
| `Accept` | String | No | `application/json` |

### 🔍 Query Parameters:
| Parameter | Type | Required | Description | Example |
|---|---|---|---|---|
| `origin` | String | **Yes** | 3-letter IATA origin airport code (Case-insensitive) | `DEL` |
| `destination` | String | **Yes** | 3-letter IATA destination airport code | `BOM` |
| `date` | String | **Yes** | Travel date in `YYYY-MM-DD` format | `2026-12-10` |
| `adults` | Number | No | Number of adult seats needed (Default: `1`) | `2` |

---

### 📤 Success Response (`200 OK`):

#### Response Schema:
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
| `count` | Number | Total matching flights found. |
| `data[].sfId` | String | **Unique Series Fare Inventory ID.** Must be passed into the Booking API. |
| `data[].airline` | String | Marketing and operating airline carrier name. |
| `data[].flightNo` | String | Flight number code (e.g. `6E-2045`, `AI-995`). |
| `data[].origin` | String | 3-letter IATA code of origin airport. |
| `data[].destination` | String | 3-letter IATA code of destination airport. |
| `data[].departureTime` | String | Local departure time in 24-hour format (`HH:MM`). |
| `data[].arrivalTime` | String | Local arrival time in 24-hour format (`HH:MM`). |
| `data[].travelDate` | String | ISO 8601 travel date timestamp. |
| `data[].fare` | Number | **Total per-passenger net payable fare in INR (₹)** including partner-configured markup. |
| `data[].availableSeats` | Number | Current available seat inventory. |
| `data[].bookingType` | String | `'ONE_WAY'` or `'ROUND_TRIP'`. |
| `data[].stops` | Number | Number of stops (`0` = Non-stop, `1` = 1-stop layover). |
| `data[].segments` | Array | Breakdown of flight legs for connecting flights or round trips. |
| `data[].checkinBaggage` | String | Included check-in baggage allowance (e.g. `"15 KG"`, `"30 KG"`). |
| `data[].cabinBaggage` | String | Included hand baggage allowance (e.g. `"7 KG"`). |
| `data[].isRefundable` | Boolean | `false` for Fixed Departure series fares (non-refundable). |

---

## 4. Endpoint 2: Flight Booking

Books seats on a selected Fixed Departure flight for specified passengers.

- **HTTP Method:** `POST`
- **Path:** `/flights/book`
- **Full URL:** `https://api.trippechalo.com/api/v1/b2b/flights/book`

### 📥 Request Headers:
| Header | Type | Required | Value |
|---|---|---|---|
| `x-api-key` | String | **Yes** | Your Test or Live API Key |
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

#### Field Specifications:
| Field | Type | Required | Allowed Values / Format | Description |
|---|---|---|---|---|
| `sfId` | String | **Yes** | Valid `sfId` from Search API | The inventory block being booked. |
| `passengers` | Array | **Yes** | Min length: 1 | Array of traveler records. |
| `passengers[].title` | String | **Yes** | `Mr`, `Mrs`, `Ms`, `Mstr`, `Miss` | Salutation. |
| `passengers[].firstName` | String | **Yes** | Alphabetic string | Traveler given name as on ID/Passport. |
| `passengers[].lastName` | String | **Yes** | Alphabetic string | Traveler surname as on ID/Passport. |
| `passengers[].type` | String | **Yes** | `ADULT`, `CHILD`, `INFANT` | Passenger category. |
| `passengers[].gender` | String | **Yes** | `MALE`, `FEMALE` | Gender. |
| `passengers[].dob` | String | No | `YYYY-MM-DD` | Date of birth. Mandatory for infants/children. |
| `passengers[].passportNo` | String | Conditional | Alphanumeric | Mandatory for International flights. |
| `passengers[].passportExpiry`| String | Conditional | `YYYY-MM-DD` | Mandatory for International flights. |

---

### 📤 Success Response - Sandbox Test Mode (`200 OK`):

When using a Test Key (`test_tc_...`), the booking is confirmed instantly in sandbox mode with zero financial transaction:

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

When using a Live Key (`live_tc_...`), the API automatically validates your credit/wallet balance, decrements seats, and issues a live PNR:

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

## 5. Standard Error Codes & Handling

TrippeChalo APIs use standard HTTP response codes accompanied by a descriptive JSON payload:

```json
{
  "success": false,
  "error": "Error description message"
}
```

| HTTP Status | Error Scenario | Resolution |
|---|---|---|
| **`400 Bad Request`** | Missing required fields (e.g. `origin`, `destination`, or empty `passengers` array). | Check request parameters and JSON body format. |
| **`400 Bad Request`** | `"Not enough seats available"` | Requested passenger count exceeds available seat inventory. |
| **`401 Unauthorized`** | `"API Key is missing"` or `"Invalid API Key"` | Ensure `x-api-key` header is provided and correct. |
| **`402 Payment Required`** | `"Insufficient API Wallet Balance. Please recharge."` | Top up your TrippeChalo API Wallet via Admin/Support. |
| **`403 Forbidden`** | `"Your API access has been suspended"` | Contact your TrippeChalo relationship manager. |
| **`403 Forbidden`** | `"Your account is not approved for LIVE mode yet"` | Complete sandbox verification before using live keys. |
| **`404 Not Found`** | `"Flight not found or inactive"` | Re-verify `sfId` from latest search results. |
| **`500 Internal Server Error`** | Server error | Contact TrippeChalo technical support with timestamp. |

---

## 6. Sandbox Test Inventory Guide

You can immediately test all 6 core travel scenarios using your test key:

| Test Case | Scenario | Origin | Dest | Available Test Dates | Airline | Approx Fare |
|:---:|---|:---:|:---:|---|:---:|:---:|
| **Case 1** | Domestic Non-Stop | `DEL` | `BOM` | `2026-12-05`, `2026-12-10`, `2026-12-15`, `2026-12-22`, `2027-01-08` | IndiGo / Air India | ₹4,200 |
| **Case 2** | International Non-Stop | `DEL` | `DXB` | `2026-12-06`, `2026-12-12`, `2026-12-18`, `2026-12-24`, `2027-01-12` | Air India / SpiceJet | ₹12,500 |
| **Case 3** | Domestic 1-Stop (via PNQ) | `DEL` | `BLR` | `2026-12-04`, `2026-12-09`, `2026-12-16`, `2026-12-23`, `2027-01-15` | IndiGo | ₹5,600 |
| **Case 4** | International 1-Stop (via COK) | `DEL` | `DXB` | `2026-12-07`, `2026-12-14`, `2026-12-21`, `2026-12-28`, `2027-01-18` | Air India | ₹14,500 |
| **Case 5** | Round-Trip Non-Stop | `DEL` | `DXB` | `2026-12-05`, `2026-12-12`, `2026-12-19`, `2026-12-26`, `2027-01-10` | SpiceJet | ₹21,500 |
| **Case 6** | Round-Trip 1-Stop (Bali via DXB) | `DEL` | `DPS` | `2026-12-08`, `2026-12-15`, `2026-12-22`, `2027-01-05`, `2027-01-20` | Air India | ₹27,500 |

---

## 7. Developer Quickstart & Code Examples

### cURL Example - Search Flights:
```bash
curl -X GET "https://api.trippechalo.com/api/v1/b2b/flights/search?origin=DEL&destination=DXB&date=2026-12-18&adults=2" \
     -H "x-api-key: YOUR_TEST_API_KEY"
```

### cURL Example - Book Flight:
```bash
curl -X POST "https://api.trippechalo.com/api/v1/b2b/flights/book" \
     -H "x-api-key: YOUR_TEST_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "sfId": "SF-TC-C2A-20261218",
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
         }
       ]
     }'
```

### Node.js (Axios) Integration:
```javascript
import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.trippechalo.com/api/v1/b2b',
  headers: {
    'x-api-key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});

// 1. Search
const searchResponse = await client.get('/flights/search', {
  params: {
    origin: 'DEL',
    destination: 'BOM',
    date: '2026-12-10',
    adults: 1
  }
});

const flight = searchResponse.data.data[0];

// 2. Book
const bookResponse = await client.post('/flights/book', {
  sfId: flight.sfId,
  passengers: [
    {
      title: 'Mr',
      firstName: 'Amit',
      lastName: 'Kumar',
      type: 'ADULT',
      gender: 'MALE'
    }
  ]
});

console.log('Confirmed PNR:', bookResponse.data.data.pnr);
```

---

## 8. Technical Support & Account Management

- **API Integration Support:** `api-support@trippechalo.com`
- **Technical Hotline:** `+91 95559 34205`
- **Partner Portal:** `https://trippechalo.com/admin/b2b-partners`
- **Corporate Office:** TrippeChalo India Private Limited, New Delhi, India.

---
*© 2026 TrippeChalo India Private Limited. All rights reserved.*
