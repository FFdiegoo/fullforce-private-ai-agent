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

  const { prompt, mode, model } = req.body;

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
      ? 'Je bent CeeS, een technische AI-assistent voor CS Rental. Help gebruikers met technische documentatie en ondersteuning. Geef duidelijke, praktische antwoorden.'
      : 'Je bent ChriS, een inkoop AI-assistent voor CS Rental. Help gebruikers met inkoop en onderdelen informatie. Focus op praktische inkoop-gerelateerde vragen.';

    // Bepaal welk model te gebruiken
    let selectedModel;
    if (model === 'complex') {
      selectedModel = process.env.OPENAI_MODEL_COMPLEX || 'gpt-4';
    } else {
      selectedModel = process.env.OPENAI_MODEL_SIMPLE || 'gpt-4-turbo';
    }

    // Vraag een completion aan bij OpenAI
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: model === 'complex' ? 2000 : 1000, // Meer tokens voor complexe vragen
      temperature: model === 'complex' ? 0.3 : 0.7, // Lagere temperature voor complexe vragen
    });

    // Haal het antwoord op uit de response
    const reply = completion.choices?.[0]?.message?.content || 'Sorry, er ging iets mis.';
    res.status(200).json({ reply, modelUsed: selectedModel });
  } catch (error) {
    // Log de error voor debugging
    console.error('OpenAI API Error:', error);

    // Check for specific authentication errors
    if (error.status === 401) {
      return res.status(500).json({ 
        reply: 'OpenAI API authentication failed. Please check your API key configuration.' 
      });
    }

    // Stuur een nette foutmelding terug naar de frontend
    res.status(500).json({ 
      reply: 'Sorry, er is een fout opgetreden met de AI service. Probeer het later opnieuw.' 
    });
  }
}
</parameter>