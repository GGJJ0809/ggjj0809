import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface Supplier {
  id: number;
  name: string;
  contact: string;
  phone: string;
  address: string;
  category: string;
  is_active: boolean;
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setSuppliers((data || []) as Supplier[]);
        setLoading(false);
      });
  }, []);

  return { suppliers, loading };
}