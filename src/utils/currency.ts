/** Ghana cedis with thousands separators, e.g. GH₵1,234.56 */
export const formatGhanaCedis = (amount: number): string => {
  const value = Number.isFinite(amount) ? amount : 0;
  return `GH₵${value.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
