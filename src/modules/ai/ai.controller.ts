import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { Request, Response } from 'express';
import { getFlightsData, getNearestFlightsData } from '../searches/search.controller';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `You are TrippeChalo AI Assistant — a friendly, knowledgeable, and highly advanced travel assistant for the TrippeChalo travel booking platform (an Indian travel company).
CURRENT DATE: ${new Date().toDateString()} - NEVER pick a date in the past. If the user asks for August, assume the upcoming August (e.g., 2026).

Your capabilities:
- Help users find real flights using the search_flights tool.
- If the user explicitly agrees or asks to book a specific flight you presented, use the book_flight tool to initiate the booking process. Always share the returned checkout URL as a beautiful markdown link (e.g. [Click here to complete your booking](URL)).
- Provide travel recommendations, tips, and destination info. You can suggest the best and cheapest trips online when they ask for trip plans based on your knowledge!
- Assist with booking-related queries (cancellations, refunds, status).
- Share visa and passport information.
- Suggest deals and offers.

Guidelines:
- Be conversational, warm, and helpful. DO NOT use emojis. It doesn't look professional.
- Keep responses concise (under 200 words) but informative.
- Output ONLY the final response meant for the user. Do NOT include your internal reasoning, thinking process, or recite the guidelines.
- If a user asks for flights within a timeframe or after a certain date (e.g., "after 10th September", "next week", "in August"), determine the earliest valid date in that timeframe and provide it in the 'date' parameter. Do NOT omit it unless the user explicitly says "any date" or provides no time constraint at all.
- You MUST call the search_flights tool whenever the user asks for flights. Do not tell them to use the search bar. Use the tool to find the flights and present the results beautifully.
- If the tool returns "No flights found", apologize gently and suggest they try another date or route.
- For cancellations/refunds, direct them to "My Trips" section or share support contact: trippechaloindia@gmail.com / 9555934205.
- IMPORTANT: If the user writes in Hinglish (Hindi using the English alphabet), you MUST reply in Hinglish. NEVER use the Devanagari script (हिंदी) unless the user uses it first.
- Never reveal you are an AI model or mention Google/Gemini. You are "TrippeChalo AI Assistant".`;

// Store conversation history per session (in-memory, keyed by a session identifier)
// History parts can include function calls and function responses, so we type it as any for simplicity here
const conversationHistories = new Map<string, Array<{ role: string; parts: any[] }>>();

// Clean up old sessions every 30 minutes
setInterval(() => {
  conversationHistories.clear();
}, 30 * 60 * 1000);

const searchFlightsFunctionDeclaration: FunctionDeclaration = {
  name: "search_flights",
  description: "Search for available flights between two cities in the database.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      departureAirportCode: {
        type: SchemaType.STRING,
        description: "The 3-letter IATA airport code of departure, e.g., 'DEL' for Delhi, 'BOM' for Mumbai",
      },
      arrivalAirportCode: {
        type: SchemaType.STRING,
        description: "The 3-letter IATA airport code of arrival, e.g., 'DPS' for Bali, 'GOI' for Goa",
      },
      date: {
        type: SchemaType.STRING,
        description: "Optional. The specific date OR the starting date of a timeframe the user asked for (YYYY-MM-DD). E.g. if user asks 'after 10th September', provide '2026-09-11'. If 'this month', provide today's date. Only omit if the user asks for 'any day'.",
      }
    },
    required: ["departureAirportCode", "arrivalAirportCode"],
  },
};

const bookFlightFunctionDeclaration: FunctionDeclaration = {
  name: "book_flight",
  description: "Initiates the booking process when the user explicitly says they want to book a specific flight you showed them.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      flightNumber: { type: SchemaType.STRING, description: "The flight number, e.g., QP-1120" },
      date: { type: SchemaType.STRING, description: "The date of the flight in YYYY-MM-DD format" },
      departureAirportCode: { type: SchemaType.STRING, description: "Origin airport code" },
      arrivalAirportCode: { type: SchemaType.STRING, description: "Destination airport code" }
    },
    required: ["flightNumber", "date", "departureAirportCode", "arrivalAirportCode"]
  }
};

export const chatWithAI = async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sid = sessionId || 'default';

    // Get or create conversation history
    if (!conversationHistories.has(sid)) {
      conversationHistories.set(sid, []);
    }
    const history = conversationHistories.get(sid)!;

    const FALLBACK_MODELS = [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest'
    ];

    const generateWithFallback = async (contents: any[]) => {
      for (const modelName of FALLBACK_MODELS) {
        try {
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: SYSTEM_PROMPT,
            tools: [
              { functionDeclarations: [searchFlightsFunctionDeclaration, bookFlightFunctionDeclaration] }
            ]
          });
          const result = await model.generateContent({ contents });
          console.log(`[AI] Successfully responded using model: ${modelName}`);
          return result;
        } catch (err: any) {
          console.error(`[AI] Model ${modelName} failed:`, err.message);
        }
      }
      throw new Error('All fallback models exhausted or failed due to rate limits.');
    };

    const currentContents = [
      ...history,
      { role: "user", parts: [{ text: message }] }
    ];

    const result = await generateWithFallback(currentContents);
    let response = result.response;
    
    // Check if the model wants to call a function
    const functionCalls = response.functionCalls();
    let botReply = response.text();

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      
      if (call.name === 'search_flights') {
        const args = call.args as { departureAirportCode: string, arrivalAirportCode: string, date?: string };
        const { departureAirportCode, arrivalAirportCode, date } = args;
        
        console.log(`[AI Function Call] Searching live flights from ${departureAirportCode} to ${arrivalAirportCode} on ${date || 'default'}`);
        
        try {
          console.log(`[AI] Fetching flights from getFlightsData...`);
          const flights = await getFlightsData({
            from: departureAirportCode,
            to: arrivalAirportCode,
            date: date,
            passengers: 1
          }, false); // isAgent = false

          let apiResponse: any = {};

          if (flights && flights.length > 0) {
            console.log(`[AI] Fetched ${flights.length} flights. Formating response...`);
            const simpleFlights = flights.map((f: any) => ({
              airline: f.airline,
              flightNumber: f.flightNumber,
              departureTime: new Date(f.departureTime).toLocaleString('en-US'),
              arrivalTime: new Date(f.arrivalTime).toLocaleString('en-US'),
              price: f.price,
              durationMinutes: f.durationMinutes
            }));
            apiResponse.flights = simpleFlights;
          } else {
            console.log(`[AI] 0 flights found. Fetching nearest available dates...`);
            const nearestFlights = await getNearestFlightsData(departureAirportCode, arrivalAirportCode, date);
            if (nearestFlights && nearestFlights.length > 0) {
              apiResponse.note = date ? `No flights found on ${date}. But we found these nearest upcoming flights:` : `Here are the earliest available upcoming flights:`;
              apiResponse.flights = nearestFlights.map((f: any) => ({
                airline: f.airline,
                flightNumber: f.flightNumber,
                departureTime: new Date(f.departureTime).toLocaleString('en-US'),
                price: f.price,
                availableSeats: f.availableSeats
              }));
            } else {
              apiResponse.flights = "No flights found for this route on any upcoming dates.";
            }
          }

          console.log(`[AI] Sending Function Response to chat model...`);
          
          const functionCallResponseMsg = {
            role: "model",
            parts: [{ functionCall: call }]
          };

          const newContents = [
            ...currentContents,
            functionCallResponseMsg,
            {
              role: "user",
              parts: [
                {
                  functionResponse: {
                    name: 'search_flights',
                    response: apiResponse
                  }
                },
                {
                  text: "Please write a friendly, conversational response to the user based on these flight search results. Do not return an empty message. Output ONLY the final response, without any internal thinking, planning, or self-review."
                }
              ]
            }
          ];

          const nextResult = await generateWithFallback(newContents);
          response = nextResult.response;
          botReply = response.text();
          console.log(`[AI] botReply generated (length: ${botReply.length}):`, botReply);

          const finalHistory = [
            ...newContents,
            { role: "model", parts: [{ text: botReply }] }
          ];
          conversationHistories.set(sid, finalHistory.slice(-40));
          return res.json({ reply: botReply, sessionId: sid });

        } catch (dbError) {
          console.error('[AI DB Error]', dbError);
          const functionCallResponseMsg = {
            role: "model",
            parts: [{ functionCall: call }]
          };
          
          const newContents = [
            ...currentContents,
            functionCallResponseMsg,
            {
              role: "user",
              parts: [
                {
                  functionResponse: {
                    name: 'search_flights',
                    response: { error: "Database search failed temporarily." }
                  }
                },
                {
                  text: "Please apologize to the user and ask them to try again later."
                }
              ]
            }
          ];
          const nextResult = await generateWithFallback(newContents);
          response = nextResult.response;
          botReply = response.text();
          console.log(`[AI] Error botReply generated:`, botReply);

          const finalHistory = [
            ...newContents,
            { role: "model", parts: [{ text: botReply }] }
          ];
          conversationHistories.set(sid, finalHistory.slice(-40));
          return res.json({ reply: botReply, sessionId: sid });
        }
      } else if (call.name === 'book_flight') {
        const args = call.args as { flightNumber: string, date: string, departureAirportCode: string, arrivalAirportCode: string };
        const checkoutUrl = `/flights/booking?flight=${args.flightNumber}&date=${args.date}&from=${args.departureAirportCode}&to=${args.arrivalAirportCode}`;
        
        console.log(`[AI Function Call] Booking initiated for ${args.flightNumber}`);
        
        const functionCallResponseMsg = {
          role: "model",
          parts: [{ functionCall: call }]
        };
        
        const newContents = [
          ...currentContents,
          functionCallResponseMsg,
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: 'book_flight',
                  response: { success: true, checkoutUrl: checkoutUrl }
                }
              },
              {
                text: "The booking link has been generated. Provide the link to the user and ask them to click it to complete their booking. Output ONLY the final response."
              }
            ]
          }
        ];
        
        const nextResult = await generateWithFallback(newContents);
        response = nextResult.response;
        botReply = response.text();
        console.log(`[AI] Booking botReply generated:`, botReply);

        const finalHistory = [
          ...newContents,
          { role: "model", parts: [{ text: botReply }] }
        ];
        conversationHistories.set(sid, finalHistory.slice(-40));
        return res.json({ reply: botReply, sessionId: sid });
      }
    }

    // Keep history manageable (last 20 exchanges)
    const updatedHistory = [
      ...currentContents,
      { role: "model", parts: [{ text: botReply }] }
    ];
    conversationHistories.set(sid, updatedHistory.slice(-40));

    res.json({ reply: botReply, sessionId: sid });
  } catch (error: any) {
    console.error('[AI Chat Error] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    res.status(500).json({ 
      error: 'AI service temporarily unavailable',
      reply: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment, or contact our support team at trippechaloindia@gmail.com for immediate assistance! 🙏"
    });
  }
};
