export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      reply: 'Method not allowed',
      error: 'Only POST requests are supported'
    });
  }

  // AUTH CHECK - Voeg dit toe
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        reply: 'Authentication required',
        error: 'No authorization header provided'
      });
    }

    // Validate session with Supabase
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
    if (authError || !user) {
      return res.status(401).json({
        reply: 'Invalid authentication',
        error: 'Session validation failed'
      });
    }

    console.log('✅ Authenticated request from:', user.email);
  } catch (authError) {
    console.error('❌ Auth validation error:', authError);
    return res.status(401).json({
      reply: 'Authentication failed',
      error: 'Unable to validate session'
    });
  }

  // Extract request data (bestaande code blijft hetzelfde)
  const { prompt, mode = 'technical', model = 'simple', includeSources = fa