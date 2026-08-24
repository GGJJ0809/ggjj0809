import { createClient } from '@supabase/supabase-js';
import { localDb } from './localDb';

function isElectron() {
  return typeof window !== 'undefined' && !!(window as any).electronAPI;
}

export const supabase = isElectron()
  ? (localDb as any)
  : createClient(
      'http://114.215.190.225',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE5MDAwMDAwMDB9.b69xNoiP31pDuwLvkOQOV6MpxVHYbRq6XuGpi9_Cqpc',
      {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE5MDAwMDAwMDB9.b69xNoiP31pDuwLvkOQOV6MpxVHYbRq6XuGpi9_Cqpc'
        }
      }
    );