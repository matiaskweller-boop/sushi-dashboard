'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CurrencyContextType {
  currency: 'ARS' | 'USD';
  toggleCurrency: () => void;
  rates: { current: number; monthly: Record<string, number> } | null;
  getRate: (monthKey?: string) => number | undefined;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: 'ARS',
  toggleCurrency: () => {},
  rates: null,
  getRate: () => undefined,
});

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [rates, setRates] = useState<{ current: number; monthly: Record<string, number> } | null>(null);

  useEffect(() => {
    fetch('/api/exchange-rates')
      .then((r) => r.json())
      .then(setRates)
      .catch(() => {});
  }, []);

  const toggleCurrency = () => setCurrency((c) => (c === 'ARS' ? 'USD' : 'ARS'));

  const getRate = (monthKey?: string) => {
    if (!rates) return undefined;
    if (monthKey && rates.monthly[monthKey]) return rates.monthly[monthKey];
    return rates.current;
  };

  return (
    <CurrencyContext.Provider value={{ currency, toggleCurrency, rates, getRate }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
