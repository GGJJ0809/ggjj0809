import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AIRecognitionResult {
  name: string;
  category: string;
  typicalUnit: string;
  matchType: 'exact' | 'range' | 'fuzzy' | 'ambiguous';
  confidence: number;
  estimatedQuantity: number;
  estimatedUnitWeight: number;
  detail: string;
}

export interface AIRecognitionResponse {
  weight: number;
  weightDisplay: string;
  results: AIRecognitionResult[];
  isAmbiguous: boolean;
  totalMatches: number;
}

export interface IngredientSearchItem {
  name: string;
  category: string;
  typicalUnit: string;
  weightRange: string;
  midWeight: number;
  aliases: string[];
}

export function useScaleAI() {
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState('g');
  const [category, setCategory] = useState('');
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<AIRecognitionResponse | null>(null);
  const [searchResults, setSearchResults] = useState<IngredientSearchItem[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 根据重量识别
  const recognize = useCallback(async () => {
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      setError('请输入有效的重量值');
      return;
    }

    setRecognizing(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('dish-recognition', {
        body: {
          weight: w,
          unit: weightUnit,
          category: category.trim() || undefined,
          keyword: keyword.trim() || undefined,
          topN: 5,
        },
      });

      if (fnErr) throw fnErr;

      const resp = data as { code: number; message: string; data: AIRecognitionResponse };
      if (resp.code !== 200 || !resp.data) {
        throw new Error(resp.message || '识别失败');
      }
      setResult(resp.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '识别失败');
    } finally {
      setRecognizing(false);
    }
  }, [weight, weightUnit, category, keyword]);

  // 关键词搜索食材
  const searchIngredients = useCallback(async (kw: string) => {
    if (!kw.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('dish-recognition', {
        body: { keyword: kw, limit: 8 },
      });
      if (fnErr) throw fnErr;
      const resp = data as { code: number; data: { items: IngredientSearchItem[] } };
      setSearchResults(resp?.data?.items ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const reset = useCallback(() => {
    setCategory('');
    setKeyword('');
    setResult(null);
    setError(null);
  }, []);

  return {
    weight,
    setWeight,
    weightUnit,
    setWeightUnit,
    category,
    setCategory,
    keyword,
    setKeyword,
    result,
    searchResults,
    recognizing,
    searching,
    error,
    setError,
    recognize,
    searchIngredients,
    reset,
  };
}