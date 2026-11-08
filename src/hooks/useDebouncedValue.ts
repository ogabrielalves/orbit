import { useEffect, useState } from "react";

export function useDebouncedValue<TValue>(value: TValue, delayInMilliseconds: number): TValue {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayInMilliseconds);
    return () => clearTimeout(timer);
  }, [value, delayInMilliseconds]);

  return debouncedValue;
}
