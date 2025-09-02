#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('❌ Missing Supabase envs'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const { data, error } = await supabase
  .from('documents_metadata')
  .select('id, filename, storage_path, last_updated')
  .eq('needs_ocr', true)
  .eq('processed', false)
  .order('last_updated', { ascending: true })
  .limit(20);
if (error) { console.error('❌', error.message); process.exit(1); }
console.table(data || []);
