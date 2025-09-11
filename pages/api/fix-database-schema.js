import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xcrsfcwdjxsbmmrqnose.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnNmY3dkanhzYm1tcnFub3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjUzNjc1OCwiZXhwIjoyMDYyMTEyNzU4fQ.BxHofBt6ViKx4FbV7218Ad2GAekhZQXEd6CiHkkjOGI'; 

const supabase = createClient(supabaseUrl, serviceRoleKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data: testData, error: testError } = await supabase
      .from('profiles')
      .select('backup_codes')
      .limit(1);

    if (testError && testError.message.includes('backup_codes does not exist')) {
      return res.status(200).json({
        success: false,
        problem_confirmed: true,
        message: 'backup_codes column still missing - execute SQL fix first'
      });
    }

    const { data: updateData, error: updateError } = await supabase
      .from('profiles')
      .update({ 
        two_factor_enabled: false,
        backup_codes: null 
      })
      .eq('email', process.env.DIEGO_EMAIL)
      .select();

    if (updateError) {
      return res.status(200).json({
        success: false,
        message: 'Profile update failed',
        error: updateError.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Database schema fix successful! Diego can now login.',
      test_result: updateData
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}