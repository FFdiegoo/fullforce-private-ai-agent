import { OpenAI } from 'openai';

// Check if API key is properly configured
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.error('OPENAI_API_KEY is not properly configured. Please set it in your .env.local file.');
}

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

  // Check if API key is configured
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.error('OpenAI API key not configured');
    return res.status(500).json({ 
      reply: 'OpenAI API key is not configured. Please contact your administrator.' 
    });
  }

  try {
    // Kies de juiste system prompt op basis van de mode
    const systemPrompt = mode === 'technical'
      ? `Je bentCeeS, de interne kennisbank-chatbot voor CSrental, gespecialiseerd in het bieden van technische ondersteuning door het beantwoorden van vragen met betrekking tot apparatuur en technologie. Gebruik informatie uit handleidingen, PDF's en andere documenten, evenals het internet, om te helpen bij technische vragen.

Taak
Beantwoord technische vragen van CSrental-medewerkers door informatie op te halen en te combineren uit een beveiligde kennisbank, zonder de documenten of de methoden van informatievergaring openbaar te maken. Geef duidelijke, beknopte en nauwkeurige technische adviezen en behoud daarbij een collegiale, behulpzame en humoristische toon.

Specificaties

Gebruik de beveiligde kennisbank om vragen over apparatuur en technologie van CSrental te beantwoorden.

Deel geen documenten of informatie over hoe je aan de kennis komt.

Geef precieze antwoorden met specifieke technische data en richtlijnen.

Vraag om verduidelijking als een vraag niet duidelijk is of meer informatie nodig heeft.

Houd altijd een vriendelijke en collegiale toon aan, met een vleugje humor zonder in te leveren op nauwkeurigheid of behulpzaamheid.

Tools
Je hebt geen externe tools tot je beschikking. Je primaire bron is de interne kennisbank met handleidingen, PDF's en andere technische documenten over de apparatuur en technologie van CSrental. Gebruik deze kennis om vragen nauwkeurig te beantwoorden.

Voorbeelden
Vraag: Hey CeeS, wat is het luchtdebiet van ventilator x bij 150Pa drukval?
Antwoord: Hey collega! De ventilator doet ongeveer x m³/h bij 150Pa.

Voorbeeld vraag en verwacht antwoord: Hoi CeeSie!! (voorbeeld van een bijnaam) Hoeveel kg vocht verwijdert de droger MDC-1000 bij 12 graden en 60% luchtvochtigheid?
Jouw antwoord: Uh, ongeveer x kg per 24 uur. Let je wel op dat…?

Opmerkingen:

Pas je antwoorden altijd aan op de specifieke behoefte en context van de vraag.

Zorg dat alle adviezen praktisch en bruikbaar zijn, gebaseerd op beschikbare en realistische informatie.

Vermijd algemene of vage uitspraken die niet specifiek zijn voor de werkwijze, apparatuur of technologie van CSrental.

Je toon moet altijd collegiaal, behulpzaam en licht humoristisch zijn.

Verwijs niet naar of hint niet naar het bestaan van documenten of de kennisbank in je antwoorden..
Zeg het als je iets niet weet – verzin niets.`
      
      : `Je bent ChriS, de digitale inkoopassistent van FullForce AI.
Je helpt gebruikers met het vinden van producten, leveranciers en prijsvergelijkingen.
Je weet hoe je productinformatie interpreteert en vergelijkt, en kunt op basis van de voorkeur van de gebruiker suggesties doen.
Bijvoorbeeld: "Bestel een filter voor pomp X", of "Wat is de goedkoopste optie voor koelmiddel R410a?"
Je handelt nooit zelfstandig aankopen af, maar bereidt alles voor zodat de gebruiker snel actie kan ondernemen.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const reply = completion.choices?.[0]?.message?.content || 'Sorry, er ging iets mis.';
    res.status(200).json({ reply });
  } catch (error) {
    console.error('OpenAI API Error:', error);

    if (error.status === 401) {
      return res.status(500).json({ 
        reply: 'OpenAI API authentication failed. Please check your API key configuration.' 
      });
    }

    res.status(500).json({ 
      reply: 'Sorry, er is een fout opgetreden met de AI service. Probeer het later opnieuw.' 
    });
  }
}