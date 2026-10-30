// OpenAPI 3.1.0 Specification and Postman 2.1.0 Collection Generator for TrippeChalo India B2B API

export const getOpenApiSpec = (baseUrl: string = 'https://api.trippechalo.com') => {
  return {
    openapi: '3.1.0',
    info: {
      title: 'TrippeChalo India B2B Flight Series API',
      version: '1.2.0',
      description: `Official RESTful & OpenAPI 3.1 specification for TrippeChalo India's Fixed Departure (Series Fare) flight distribution engine.
Designed for high-throughput OTA integrations, corporate travel booking tools, and wholesale travel agents.

### Key Capabilities:
- **Real-Time Atomic CAS Inventory**: Zero double-booking race conditions.
- **Idempotency-Key Support**: Safe automated retries on network timeouts.
- **Structured Fare Breakdown**: Explicit base fare, tax, and per-passenger breakdown for Adults, Children, and Infants.
- **Sandbox UAT Catalogue**: Guaranteed test flights with fixed seat counts for deterministic integration testing.`,
      contact: {
        name: 'TrippeChalo India B2B Integration Support',
        email: 'support@trippechalo.com',
        url: 'https://trippechalo.com'
      },
      license: {
        name: 'Proprietary - Commercial B2B Use Only'
      }
    },
    servers: [
      {
        url: `${baseUrl}/api/v1/b2b`,
        description: 'Production API Gateway'
      },
      {
        url: 'https://sandbox-api.trippechalo.com/api/v1/b2b',
        description: 'Sandbox Test Environment'
      }
    ],
    tags: [
      { name: 'Authentication', description: 'OAuth2 and session token issuance' },
      { name: 'Sectors', description: 'Query active airport sectors and calendar availability' },
      { name: 'Search', description: 'Real-time Series Fare flight search' },
      { name: 'Booking', description: 'Atomic CAS flight booking and idempotency handling' },
      { name: 'Manage', description: 'Retrieve booking status, e-tickets, and cancellation policies' },
      { name: 'Specification', description: 'Machine-readable OpenAPI and Postman contracts' }
    ],
    paths: {
      '/oauth2/tokens': {
        post: {
          tags: ['Authentication'],
          summary: 'Obtain OAuth2 Session Token',
          description: 'Authenticates B2B partner using credentials or API key and issues a 24-hour signed JWT session token.',
          operationId: 'authenticateB2BClient',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    username: { type: 'string', example: 'makemytrip_b2b' },
                    password: { type: 'string', format: 'password', example: 'Secr3tP@ss2026' },
                    apiKey: { type: 'string', example: 'tc_live_a89f92e8d...' },
                    auth_channel: { type: 'string', example: 'cugtest.trippechalo.com' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Authentication successful',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthSuccessResponse' }
                }
              }
            },
            '401': {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardErrorResponse' }
                }
              }
            }
          }
        }
      },
      '/flights/sectors': {
        get: {
          tags: ['Sectors'],
          summary: 'Get Available Sectors',
          description: 'Returns list of all active Origin-Destination flight routes, minimum fares, and available calendar dates.',
          operationId: 'getSectors',
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { TokenIdAuth: [] }],
          responses: {
            '200': {
              description: 'List of available sectors',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SectorsResponse' }
                }
              }
            },
            '401': { $ref: '#/components/responses/UnauthorizedError' },
            '429': { $ref: '#/components/responses/RateLimitError' }
          }
        }
      },
      '/flights/search': {
        post: {
          tags: ['Search'],
          summary: 'Search Available Flights',
          description: 'Queries live inventory for specified sector and date. Returns detailed flight info and structured fare breakdown.',
          operationId: 'searchFlights',
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { TokenIdAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['origin', 'destination', 'date'],
                  properties: {
                    origin: { type: 'string', example: 'DEL', description: '3-letter IATA Airport Code' },
                    destination: { type: 'string', example: 'BOM', description: '3-letter IATA Airport Code' },
                    date: { type: 'string', format: 'date', example: '2026-12-15', description: 'Travel Date (YYYY-MM-DD)' },
                    adults: { type: 'integer', minimum: 1, maximum: 9, default: 1 },
                    children: { type: 'integer', minimum: 0, maximum: 8, default: 0 },
                    infants: { type: 'integer', minimum: 0, maximum: 4, default: 0 }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Flights found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FlightSearchResponse' }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/UnauthorizedError' }
          }
        },
        get: {
          tags: ['Search'],
          summary: 'Search Flights via Query Parameters',
          description: 'GET alternative for flight search.',
          operationId: 'searchFlightsGet',
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { TokenIdAuth: [] }],
          parameters: [
            { name: 'origin', in: 'query', required: true, schema: { type: 'string', example: 'DEL' } },
            { name: 'destination', in: 'query', required: true, schema: { type: 'string', example: 'BOM' } },
            { name: 'date', in: 'query', required: true, schema: { type: 'string', example: '2026-12-15' } },
            { name: 'adults', in: 'query', required: false, schema: { type: 'integer', default: 1 } }
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FlightSearchResponse' }
                }
              }
            }
          }
        }
      },
      '/flights/book': {
        post: {
          tags: ['Booking'],
          summary: 'Book Flight (Atomic CAS & Idempotent)',
          description: `Performs atomic seat decrement via MongoDB Compare-And-Swap (CAS).
Safely handles retries via the \`Idempotency-Key\` header. If a duplicate request is received, the existing booking confirmation is returned without double-deduction.`,
          operationId: 'bookFlight',
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { TokenIdAuth: [] }],
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: false,
              schema: { type: 'string', format: 'uuid', example: '7d6e4b21-4f18-4b72-9b22-421710ec9471' },
              description: 'Unique UUID to prevent duplicate bookings upon network timeout retries.'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sfId', 'passengers'],
                  properties: {
                    sfId: { type: 'string', example: 'SF-DEL-BOM-AI-20261215-01', description: 'Series Fare ID from search response' },
                    clientBookingRef: { type: 'string', example: 'MMT-BK-2026-9921', description: 'Your internal system booking reference' },
                    contactDetails: {
                      type: 'object',
                      properties: {
                        email: { type: 'string', format: 'email', example: 'operations@partner.com' },
                        phone: { type: 'string', example: '+919876543210' }
                      }
                    },
                    passengers: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 9,
                      items: { $ref: '#/components/schemas/PassengerInput' }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Flight successfully booked',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BookingSuccessResponse' }
                }
              }
            },
            '200': {
              description: 'Idempotency Replay: Duplicate request previously processed, returning existing booking without duplicate charge.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BookingSuccessResponse' }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '402': {
              description: 'Insufficient API Wallet Balance',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardErrorResponse' }
                }
              }
            },
            '409': {
              description: 'Seat Inventory Exhausted (Race Condition Prevented)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardErrorResponse' }
                }
              }
            },
            '422': {
              description: 'Passenger Validation Failed (e.g. Infant count > Adult count)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardErrorResponse' }
                }
              }
            }
          }
        }
      },
      '/flights/booking/{bookingId}': {
        get: {
          tags: ['Manage'],
          summary: 'Retrieve Booking by ID or PNR',
          description: 'Fetches existing booking details, ticketing status, and passenger list using internal BookingId or airline PNR.',
          operationId: 'getBookingDetails',
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { TokenIdAuth: [] }],
          parameters: [
            {
              name: 'bookingId',
              in: 'path',
              required: true,
              schema: { type: 'string', example: 'BK-B2B-821942' },
              description: 'TrippeChalo India Booking ID or Airline PNR'
            }
          ],
          responses: {
            '200': {
              description: 'Booking details retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BookingSuccessResponse' }
                }
              }
            },
            '404': {
              description: 'Booking not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardErrorResponse' }
                }
              }
            }
          }
        }
      },
      '/flights/cancellation-policy': {
        get: {
          tags: ['Manage'],
          summary: 'Get Series Fare Cancellation & Refund Policy',
          description: 'Returns explicit legal fare rules. Fixed Departure Series Fares are strictly Non-Refundable.',
          operationId: 'getCancellationPolicy',
          security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }, { TokenIdAuth: [] }],
          responses: {
            '200': {
              description: 'Cancellation terms and fare rules',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      statusCode: { type: 'integer', example: 200 },
                      data: {
                        type: 'object',
                        properties: {
                          fareType: { type: 'string', example: 'SERIES_FARE_FIXED_DEPARTURE' },
                          isRefundable: { type: 'boolean', example: false },
                          cancellationAllowed: { type: 'boolean', example: false },
                          penaltyPercentage: { type: 'number', example: 100 },
                          notes: {
                            type: 'array',
                            items: { type: 'string' },
                            example: [
                              'Fixed Departure series inventory is bulk-contracted and 100% non-refundable upon PNR generation.',
                              'Name changes are permitted up to 24 hours prior to scheduled departure via offline operations desk.',
                              'Date changes are strictly prohibited on series fares.'
                            ]
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/docs/openapi.json': {
        get: {
          tags: ['Specification'],
          summary: 'Get OpenAPI 3.1 Spec (JSON)',
          description: 'Returns machine-readable OpenAPI 3.1 contract for programmatic SDK generation.',
          operationId: 'getOpenApiJson',
          responses: {
            '200': {
              description: 'OpenAPI 3.1 Specification',
              content: {
                'application/json': {
                  schema: { type: 'object' }
                }
              }
            }
          }
        }
      },
      '/docs/postman.json': {
        get: {
          tags: ['Specification'],
          summary: 'Get Ready-to-Import Postman Collection',
          description: 'Returns pre-configured Postman v2.1.0 collection with auto-login scripts and environment variables.',
          operationId: 'getPostmanJson',
          responses: {
            '200': {
              description: 'Postman Collection v2.1',
              content: {
                'application/json': {
                  schema: { type: 'object' }
                }
              }
            }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Pass the 24-hour session JWT token returned by /oauth2/tokens'
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Direct partner API key (test or live)'
        },
        TokenIdAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'tokenId',
          description: 'Legacy GAPI token header'
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Invalid or missing authentication credentials',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StandardErrorResponse' },
              example: {
                success: false,
                statusCode: 401,
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'Authentication required. Provide "Authorization: Bearer <token>" or "x-api-key".'
                }
              }
            }
          }
        },
        ValidationError: {
          description: 'Request payload validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StandardErrorResponse' },
              example: {
                success: false,
                statusCode: 400,
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid payload: origin, destination, and date are required.',
                  details: [{ field: 'date', issue: 'Date must be formatted as YYYY-MM-DD' }]
                }
              }
            }
          }
        },
        RateLimitError: {
          description: 'API rate limit exceeded',
          headers: {
            'X-RateLimit-Limit': { schema: { type: 'integer' }, description: 'Max allowed requests per minute' },
            'X-RateLimit-Remaining': { schema: { type: 'integer' }, description: 'Remaining requests in current window' },
            'X-RateLimit-Reset': { schema: { type: 'integer' }, description: 'Window reset timestamp (epoch seconds)' },
            'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait before retrying' }
          },
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StandardErrorResponse' },
              example: {
                success: false,
                statusCode: 429,
                error: {
                  code: 'RATE_LIMIT_EXCEEDED',
                  message: 'Rate limit of 60 req/min exceeded. Please throttle requests.'
                }
              }
            }
          }
        }
      },
      schemas: {
        StandardErrorResponse: {
          type: 'object',
          required: ['success', 'statusCode', 'error'],
          properties: {
            success: { type: 'boolean', example: false },
            statusCode: { type: 'integer', example: 400 },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  enum: [
                    'UNAUTHORIZED',
                    'VALIDATION_ERROR',
                    'SEATS_NOT_AVAILABLE',
                    'INSUFFICIENT_FUNDS',
                    'FLIGHT_NOT_FOUND',
                    'FLIGHT_ALREADY_DEPARTED',
                    'RATE_LIMIT_EXCEEDED',
                    'IDEMPOTENCY_CONFLICT',
                    'INFANT_COUNT_EXCEEDED',
                    'INTERNAL_SERVER_ERROR'
                  ],
                  example: 'SEATS_NOT_AVAILABLE'
                },
                message: { type: 'string', example: 'Only 1 seat remaining, but 3 were requested.' },
                details: {
                  type: 'array',
                  items: { type: 'object' },
                  example: [{ requested: 3, available: 1 }]
                }
              }
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                environment: { type: 'string', example: 'SANDBOX' },
                requestId: { type: 'string', example: 'req_b2b_9f812' }
              }
            }
          }
        },
        AuthSuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'integer', example: 200 },
            tokenId: { type: 'string', example: 'eyJhbGciOiJIUzI1Ni...' },
            data: {
              type: 'object',
              properties: {
                tokenId: { type: 'string' },
                tokenType: { type: 'string', example: 'Bearer' },
                expiresIn: { type: 'integer', example: 86400 },
                environment: { type: 'string', example: 'SANDBOX' },
                client: {
                  type: 'object',
                  properties: {
                    companyName: { type: 'string', example: 'MakeMyTrip India' },
                    email: { type: 'string', example: 'b2b@partner.com' },
                    username: { type: 'string', example: 'makemytrip_b2b' },
                    status: { type: 'string', example: 'Testing' },
                    apiWalletBalance: { type: 'number', example: 500000 }
                  }
                }
              }
            }
          }
        },
        SectorsResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'integer', example: 200 },
            count: { type: 'integer', example: 4 },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  origin: { type: 'string', example: 'DEL' },
                  destination: { type: 'string', example: 'BOM' },
                  airline: { type: 'string', example: 'Air India' },
                  minFare: { type: 'number', example: 4200 },
                  currency: { type: 'string', example: 'INR' },
                  availableDates: {
                    type: 'array',
                    items: { type: 'string', format: 'date' },
                    example: ['2026-12-15', '2026-12-16', '2026-12-17']
                  },
                  totalFlights: { type: 'integer', example: 6 }
                }
              }
            }
          }
        },
        FlightSearchResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'integer', example: 200 },
            count: { type: 'integer', example: 2 },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/FlightItem' }
            },
            meta: {
              type: 'object',
              properties: {
                currency: { type: 'string', example: 'INR' },
                timezone: { type: 'string', example: 'Asia/Kolkata (IST)' },
                fareValidUntil: { type: 'string', format: 'date-time' },
                environment: { type: 'string', example: 'SANDBOX' }
              }
            }
          }
        },
        FlightItem: {
          type: 'object',
          properties: {
            sfId: { type: 'string', example: 'SF-DEL-BOM-AI-20261215-01' },
            airline: { type: 'string', example: 'Air India' },
            flightNo: { type: 'string', example: 'AI-101' },
            origin: { type: 'string', example: 'DEL' },
            destination: { type: 'string', example: 'BOM' },
            travelDate: { type: 'string', format: 'date', example: '2026-12-15' },
            departureTime: { type: 'string', example: '07:00 (IST)' },
            arrivalTime: { type: 'string', example: '09:15 (IST)' },
            availableSeats: { type: 'integer', example: 9 },
            isRefundable: { type: 'boolean', example: false },
            pricing: {
              type: 'object',
              properties: {
                currency: { type: 'string', example: 'INR' },
                baseFare: { type: 'number', example: 3500 },
                taxAndCharges: { type: 'number', example: 700 },
                totalFare: { type: 'number', example: 4200 },
                breakdown: {
                  type: 'object',
                  properties: {
                    adultFare: { type: 'number', example: 4200 },
                    childFare: { type: 'number', example: 4200 },
                    infantFare: { type: 'number', example: 1500 }
                  }
                },
                fareValidUntil: { type: 'string', format: 'date-time' }
              }
            },
            baggage: {
              type: 'object',
              properties: {
                cabin: { type: 'string', example: '7 Kg' },
                checkin: { type: 'string', example: '15 Kg' }
              }
            }
          }
        },
        PassengerInput: {
          type: 'object',
          required: ['title', 'firstName', 'lastName'],
          properties: {
            title: { type: 'string', enum: ['Mr', 'Ms', 'Mrs', 'Master', 'Miss'], example: 'Mr' },
            firstName: { type: 'string', minLength: 2, maxLength: 50, example: 'Rahul' },
            lastName: { type: 'string', minLength: 2, maxLength: 50, example: 'Sharma' },
            type: { type: 'string', enum: ['ADULT', 'CHILD', 'INFANT'], default: 'ADULT', example: 'ADULT' },
            gender: { type: 'string', enum: ['Male', 'Female', 'Other'], default: 'Male' },
            dob: { type: 'string', format: 'date', example: '1992-05-14' },
            passportNumber: { type: 'string', description: 'Required for International sectors', example: 'Z1234567' },
            passportExpiry: { type: 'string', format: 'date', example: '2031-10-20' }
          }
        },
        BookingSuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'integer', example: 201 },
            data: {
              type: 'object',
              properties: {
                bookingId: { type: 'string', example: 'BK-B2B-821942' },
                pnr: { type: 'string', example: 'TESTDOM821942' },
                status: { type: 'string', example: 'CONFIRMED' },
                idempotencyReplay: { type: 'boolean', example: false },
                clientBookingRef: { type: 'string', example: 'MMT-BK-2026-9921' },
                totalAmount: { type: 'number', example: 8400 },
                currency: { type: 'string', example: 'INR' },
                seatsAllocated: { type: 'integer', example: 2 },
                flight: {
                  type: 'object',
                  properties: {
                    sfId: { type: 'string' },
                    airline: { type: 'string' },
                    flightNo: { type: 'string' },
                    origin: { type: 'string' },
                    destination: { type: 'string' },
                    travelDate: { type: 'string' },
                    departureTime: { type: 'string' },
                    arrivalTime: { type: 'string' }
                  }
                },
                passengers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      type: { type: 'string' },
                      status: { type: 'string', example: 'CONFIRMED' },
                      passportMasked: { type: 'string', example: 'Z1****67' }
                    }
                  }
                }
              }
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                environment: { type: 'string', example: 'SANDBOX' }
              }
            }
          }
        }
      }
    }
  };
};

export const getPostmanCollection = (partner?: any, isLive: boolean = false, baseUrl: string = 'https://api.trippechalo.com') => {
  const company = partner?.companyName || 'B2B Partner';
  const apiKey = isLive ? partner?.liveApiKey || 'tc_live_your_key' : partner?.testApiKey || 'tc_test_your_key';
  const username = partner?.username || 'partner_b2b';
  const password = partner?.password || 'PartnerPass2026!';

  return {
    info: {
      _postman_id: `trippechalo-b2b-${isLive ? 'live' : 'sandbox'}-${Date.now()}`,
      name: `TrippeChalo India B2B API (${isLive ? 'LIVE' : 'SANDBOX'}) - ${company}`,
      description: `Official Postman Collection for TrippeChalo India B2B Flight API.
Configured for ${company} in ${isLive ? 'LIVE PRODUCTION' : 'SANDBOX TEST'} environment.
Includes automated JWT extraction, Idempotency-Key generation, and CAS flight booking.`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'baseUrl', value: isLive ? baseUrl : 'https://sandbox-api.trippechalo.com', type: 'string' },
      { key: 'apiKey', value: apiKey, type: 'string' },
      { key: 'username', value: username, type: 'string' },
      { key: 'password', value: password, type: 'string' },
      { key: 'tokenId', value: '', type: 'string' },
      { key: 'activeSfId', value: 'SF-TC-C1A-20261205', type: 'string' }
    ],
    item: [
      {
        name: '1. Authentication (OAuth2 Token)',
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                'var jsonData = pm.response.json();',
                'if (jsonData.success && jsonData.tokenId) {',
                '    pm.collectionVariables.set("tokenId", jsonData.tokenId);',
                '    console.log("Session token captured successfully.");',
                '}'
              ],
              type: 'text/javascript'
            }
          }
        ],
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                username: '{{username}}',
                password: '{{password}}',
                apiKey: '{{apiKey}}',
                auth_channel: 'cugtest.trippechalo.com'
              },
              null,
              2
            )
          },
          url: {
            raw: '{{baseUrl}}/api/v1/b2b/oauth2/tokens',
            host: ['{{baseUrl}}'],
            path: ['api', 'v1', 'b2b', 'oauth2', 'tokens']
          }
        }
      },
      {
        name: '2. Get Available Sectors',
        request: {
          method: 'GET',
          header: [
            { key: 'Authorization', value: 'Bearer {{tokenId}}' },
            { key: 'x-api-key', value: '{{apiKey}}' }
          ],
          url: {
            raw: '{{baseUrl}}/api/v1/b2b/flights/sectors',
            host: ['{{baseUrl}}'],
            path: ['api', 'v1', 'b2b', 'flights', 'sectors']
          }
        }
      },
      {
        name: '3. Search Flights (Domestic DEL-BOM)',
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                'var jsonData = pm.response.json();',
                'if (jsonData.success && jsonData.data && jsonData.data.length > 0) {',
                '    pm.collectionVariables.set("activeSfId", jsonData.data[0].sfId);',
                '    console.log("Captured active sfId: " + jsonData.data[0].sfId);',
                '}'
              ],
              type: 'text/javascript'
            }
          }
        ],
        request: {
          method: 'POST',
          header: [
            { key: 'Authorization', value: 'Bearer {{tokenId}}' },
            { key: 'x-api-key', value: '{{apiKey}}' },
            { key: 'Content-Type', value: 'application/json' }
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                origin: 'DEL',
                destination: 'BOM',
                date: '2026-12-15',
                adults: 1
              },
              null,
              2
            )
          },
          url: {
            raw: '{{baseUrl}}/api/v1/b2b/flights/search',
            host: ['{{baseUrl}}'],
            path: ['api', 'v1', 'b2b', 'flights', 'search']
          }
        }
      },
      {
        name: '4. Book Flight (With Idempotency & CAS)',
        event: [
          {
            listen: 'prerequest',
            script: {
              exec: [
                '// Generate a unique Idempotency-Key and Client Booking Ref for every run',
                'var uuid = "idemp-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);',
                'pm.variables.set("dynamicIdempotencyKey", uuid);'
              ],
              type: 'text/javascript'
            }
          }
        ],
        request: {
          method: 'POST',
          header: [
            { key: 'Authorization', value: 'Bearer {{tokenId}}' },
            { key: 'x-api-key', value: '{{apiKey}}' },
            { key: 'Idempotency-Key', value: '{{dynamicIdempotencyKey}}' },
            { key: 'Content-Type', value: 'application/json' }
          ],
          body: {
            mode: 'raw',
            raw: JSON.stringify(
              {
                sfId: '{{activeSfId}}',
                clientBookingRef: 'BK-TEST-{{$timestamp}}',
                passengers: [
                  {
                    title: 'Mr',
                    firstName: 'Rohan',
                    lastName: 'Sharma',
                    gender: 'Male',
                    type: 'ADULT',
                    dob: '1990-05-15'
                  },
                  {
                    title: 'Mrs',
                    firstName: 'Priya',
                    lastName: 'Sharma',
                    gender: 'Female',
                    type: 'ADULT',
                    dob: '1992-08-22'
                  },
                  {
                    title: 'Mstr',
                    firstName: 'Aarav',
                    lastName: 'Sharma',
                    gender: 'Male',
                    type: 'CHILD',
                    dob: '2018-03-10'
                  },
                  {
                    title: 'Miss',
                    firstName: 'Anaya',
                    lastName: 'Sharma',
                    gender: 'Female',
                    type: 'INFANT',
                    dob: '2025-06-14'
                  }
                ],
                contactDetails: {
                  email: 'ops@partner.com',
                  phone: '+919876543210'
                }
              },
              null,
              2
            )
          },
          url: {
            raw: '{{baseUrl}}/api/v1/b2b/flights/book',
            host: ['{{baseUrl}}'],
            path: ['api', 'v1', 'b2b', 'flights', 'book']
          }
        }
      },
      {
        name: '5. Retrieve Booking by ID or PNR',
        request: {
          method: 'GET',
          header: [
            { key: 'Authorization', value: 'Bearer {{tokenId}}' },
            { key: 'x-api-key', value: '{{apiKey}}' }
          ],
          url: {
            raw: '{{baseUrl}}/api/v1/b2b/flights/booking/BK-B2B-SAMPLE',
            host: ['{{baseUrl}}'],
            path: ['api', 'v1', 'b2b', 'flights', 'booking', 'BK-B2B-SAMPLE']
          }
        }
      },
      {
        name: '6. Check Cancellation & Non-Refundable Policy',
        request: {
          method: 'GET',
          header: [
            { key: 'Authorization', value: 'Bearer {{tokenId}}' },
            { key: 'x-api-key', value: '{{apiKey}}' }
          ],
          url: {
            raw: '{{baseUrl}}/api/v1/b2b/flights/cancellation-policy',
            host: ['{{baseUrl}}'],
            path: ['api', 'v1', 'b2b', 'flights', 'cancellation-policy']
          }
        }
      }
    ]
  };
};
