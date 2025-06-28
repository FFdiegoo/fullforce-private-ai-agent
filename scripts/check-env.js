// Environment variables check script
require('dotenv').config({ path: '.env.local' });

console.log('======================================');
console.log('ENVIRONMENT VARIABLES CHECK');
console.log('======================================');

// Supabase Configuration
checkEnvVar('NEXT_PUBLIC_SUPABASE_URL');
checkEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');
checkEnvVar('SUPABASE_SERVICE_ROLE_KEY');

// OpenAI Configuration
checkEnvVar('OPENAI_API_KEY');
checkEnvVar('OPENAI_MODEL');
checkEnvVar('OPENAI_MODEL_SIMPLE');
checkEnvVar('OPENAI_MODEL_COMPLEX');

// Database
checkEnvVar('DATABASE_URL');
checkEnvVar('DIRECT_URL');

// Rate Limiting & Security
checkEnvVar('RATE_LIMIT_WINDOW_MS');
checkEnvVar('RATE_LIMIT_MAX_REQUESTS');
checkEnvVar('TOTP_ISSUER');
checkEnvVar('TOTP_WINDOW');
checkEnvVar('ALLOWED_IPS');
checkEnvVar('ENABLE_AUDIT_LOGGING');
checkEnvVar('MAX_FILE_SIZE');
checkEnvVar('ALLOWED_FILE_TYPES');

console.log('======================================');

// Helper function to check if an environment variable is defined
function checkEnvVar(name) {
  const value = process.env[name];
  const isDefined = !!value;
  const status = isDefined ? '✅ Defined' : '❌ Not defined';
  
  // For sensitive values, don't show the actual value
  const isSensitive = name.includes('KEY') || name.includes('URL') || name.includes('PASSWORD');
  const displayValue = isSensitive && isDefined 
    ? `${value.substring(0, 5)}...${value.substring(value.length - 5)}` 
    : value;
  
  console.log(`${name}: ${status}${isDefined ? ` (${isSensitive ? displayValue : value})` : ''}`);
  
  return isDefined;
}