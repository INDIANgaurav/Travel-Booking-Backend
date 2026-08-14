import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { Request, Response } from 'express';
import { getFlightsData, getNearestFlightsData } from '../searches/search.controller';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `You are TrippeChalo AI Assistant — a friendly, knowledgeable, and highly advanced travel assistant for the TrippeChalo travel booking platform (an Indian travel company).
CURRENT DATE: ${new Date().toDateString()} - NEVER pick a date in the past. If the user asks for August, assume the upcoming August (e.g., 2026).

Your capabilities:
- Help users find real flights using the search_flights tool.
- Provide travel recommendations, tips, and destination info.
- Assist with booking-related queries (cancellations, refunds, status).
- Share visa and passport information.
- Suggest deals and offers.

Guidelines:
- Be conversational, warm, and helpful. DO NOT use emojis. It doesn't look professional.
- Keep responses concise (under 200 words) but informative.
- If a user asks for flights (e.g., "Delhi to Bali flight in August" or "this month" or "any day") but does NOT specify an EXACT date, DO NOT guess or pick a random date. Instead, OMIT the date parameter completely when calling the search_flights tool. The system will automatically find the earliest available upcoming flights. In your response, inform the user about the earliest dates found.
- You MUST call the search_flights tool whenever the user asks for flights. Do not tell them to use the search bar. Use the tool to find the flights and present the results beautifully.
- If the tool returns "No flights found", apologize gently and suggest they try another date or route.
- For cancellations/refunds, direct them to "My Trips" section or share support contact: support@trippechalo.com / 1800-123-4567.
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
        description: "Optional. The date of departure in YYYY-MM-DD format. If the user didn't specify a date, leave this omitted.",
      }
    },
    required: ["departureAirportCode", "arrivalAirportCode"],
  },
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
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash',
      'gemini-2.5-flash',
      'gemini-2-flash'
    ];

    let chat;
    let result;
    let model;
    
    for (const modelName of FALLBACK_MODELS) {
      try {
        model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: [searchFlightsFunctionDeclaration] }]
        });

        chat = model.startChat({
          history: history,
        });

        result = await chat.sendMessage(message);
        console.log(`[AI] Successfully responded using model: ${modelName}`);
        break; 
      } catch (err: any) {
        console.log(`[AI] Model ${modelName} failed (likely rate limit). Trying next...`);
      }
    }

    if (!result || !chat || !model) {
      throw new Error('All fallback models exhausted or failed due to rate limits.');
    }
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
          const currentHistory = await chat.getHistory();
          const newContents = [
            ...currentHistory,
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
                  text: "Please write a friendly, conversational response to the user based on these flight search results. Do not return an empty message."
                }
              ]
            }
          ];

          const nextResult = await model.generateContent({ contents: newContents });
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
          const currentHistory = await chat.getHistory();
          const newContents = [
            ...currentHistory,
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
          const nextResult = await model.generateContent({ contents: newContents });
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
      }
    }

    // Keep history manageable (last 20 exchanges)
    // To properly maintain history with function calls, we just pull the chat history from the SDK
    const updatedHistory = await chat.getHistory();
    conversationHistories.set(sid, updatedHistory.slice(-40));

    res.json({ reply: botReply, sessionId: sid });
  } catch (error: any) {
    console.error('[AI Chat Error] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    res.status(500).json({ 
      error: 'AI service temporarily unavailable',
      reply: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment, or contact our support team at support@trippechalo.com for immediate assistance! 🙏"
    });
  }
};
