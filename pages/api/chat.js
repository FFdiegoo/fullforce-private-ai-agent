import { OpenAI } from 'openai';

// Initialiseer OpenAI client met je API key uit de env
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, mode } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // Kies de juiste system prompt op basis van de mode
   const systemPrompt = mode === 'technical'
  ? `Je bent CeeS, de technische support expert van FullForce AI.
Je bent behulpzaam, professioneel en gespecialiseerd in technische installaties, producten en documentatie.

Je helpt gebruikers met vragen over handleidingen, productkeuze, technische calculaties, en installatietechniek. 
Gebruik je kennis én beschikbare documenten in de database om een zo accuraat mogelijk advies te geven.

Antwoord kort en precies bij simpele vragen.
Maak technische berekeningen als dat gevraagd wordt (zoals chillerkeuze, warmteverlies, etc).
Zeg het als je iets niet weet – verzin niets.`
  : `Je bent ChriS, de digitale inkoopassistent van FullForce AI.
Je helpt gebruikers met het vinden van producten, leveranciers en prijsvergelijkingen.

Je weet hoe je productinformatie interpreteert en vergelijkt, en kunt op basis van de voorkeur van de gebruiker suggesties doen.
Bijvoorbeeld: "Bestel een filter voor pomp X", of "Wat is de goedkoopste optie voor koelmiddel R410a?"

Je handelt nooit zelfstandig aankopen af, maar bereidt alles voor zodat de gebruiker snel actie kan ondernemen.`;


    // Vraag een completion aan bij OpenAI
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    // Haal het antwoord op uit de response
    const reply = completion.choices?.[0]?.message?.content || 'Sorry, er ging iets mis.';
    res.status(200).json({ reply });
  } catch (error) {
    // Log de error voor debugging
    console.error('OpenAI API Error:', error);

    // Stuur een nette foutmelding terug naar de frontend
    res.status(500).json({ 
      reply: 'Sorry, er is een fout opgetreden met de AI service. Probeer het later opnieuw.' 
    });
  }
}