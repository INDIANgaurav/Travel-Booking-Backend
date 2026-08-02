import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { Request, Response } from 'express';
import { getFlightsData } from '../searches/search.controller';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `You are TrippeChalo AI Assistant — a friendly, knowledgeable travel assistant for the TrippeChalo travel booking platform (an Indian travel company).

Your capabilities:
- Help users find real flights using the search_flights tool.
- Provide travel recommendations, tips, and destination info.
- Assist with booking-related queries (cancellations, refunds, status).
- Share visa and passport information.
- Suggest deals and offers.

Guidelines:
- Be conversational, warm, and helpful. Use emojis sparingly for friendliness.
- Keep responses concise (under 200 words) but informative.
- If a user asks for flights (e.g. "Delhi to Bali flight") but does NOT specify an EXACT date, DO NOT call the search_flights tool yet. Instead, politely ask them which date they want to travel on.
- If the user asks for a fuzzy date like "nearest date", "any date", or just a month "in August", you CANNOT use the tool. You MUST politely explain that you need an EXACT date (e.g., "15 August") to check live prices.
- Once you have the EXACT date and cities, YOU MUST call the search_flights tool. Do not tell them to use the search bar. Use the tool to find the flights and present the results beautifully.
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

    // Initialize the model with tools
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: [searchFlightsFunctionDeclaration] }]
    });

    // Start chat with history
    const chat = model.startChat({
      history: history,
    });

    // Send the user message
    let result = await chat.sendMessage(message);
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
          const flights = await getFlightsData({
            from: departureAirportCode,
            to: arrivalAirportCode,
            date: date,
            passengers: 1
          }, false); // isAgent = false

          // Map to simpler format for AI
          const simpleFlights = flights.map((f: any) => ({
            airline: f.airline,
            flightNumber: f.flightNumber,
            departureTime: new Date(f.departureTime).toLocaleString('en-US'),
            arrivalTime: new Date(f.arrivalTime).toLocaleString('en-US'),
            price: f.price,
            durationMinutes: f.durationMinutes
          }));

          const apiResponse = {
            flights: simpleFlights.length > 0 ? simpleFlights : "No flights found for this route."
          };

          // Send the function response back to the model
          result = await chat.sendMessage([{
            functionResponse: {
              name: 'search_flights',
              response: apiResponse
            }
          }]);
          
          response = result.response;
          botReply = response.text();
        } catch (dbError) {
          console.error('[AI DB Error]', dbError);
          // Send error back to model
          result = await chat.sendMessage([{
            functionResponse: {
              name: 'search_flights',
              response: { error: "Database search failed temporarily." }
            }
          }]);
          response = result.response;
          botReply = response.text();
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
