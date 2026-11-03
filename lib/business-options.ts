// Curated onboarding options. Codes match the DB contracts:
// businesses.country_code char(2), currency_code char(3), timezone (IANA).

export interface CountryOption {
  code: string;
  name: string;
  currency: string;
  timezone: string;
  locale: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: "IN", name: "India", currency: "INR", timezone: "Asia/Kolkata", locale: "en-IN" },
  { code: "US", name: "United States", currency: "USD", timezone: "America/New_York", locale: "en-US" },
  { code: "GB", name: "United Kingdom", currency: "GBP", timezone: "Europe/London", locale: "en-GB" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", timezone: "Asia/Dubai", locale: "en-AE" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", timezone: "Asia/Riyadh", locale: "ar-SA" },
  { code: "SG", name: "Singapore", currency: "SGD", timezone: "Asia/Singapore", locale: "en-SG" },
  { code: "MY", name: "Malaysia", currency: "MYR", timezone: "Asia/Kuala_Lumpur", locale: "en-MY" },
  { code: "AU", name: "Australia", currency: "AUD", timezone: "Australia/Sydney", locale: "en-AU" },
  { code: "CA", name: "Canada", currency: "CAD", timezone: "America/Toronto", locale: "en-CA" },
  { code: "DE", name: "Germany", currency: "EUR", timezone: "Europe/Berlin", locale: "de-DE" },
  { code: "FR", name: "France", currency: "EUR", timezone: "Europe/Paris", locale: "fr-FR" },
  { code: "IE", name: "Ireland", currency: "EUR", timezone: "Europe/Dublin", locale: "en-IE" },
  { code: "NL", name: "Netherlands", currency: "EUR", timezone: "Europe/Amsterdam", locale: "nl-NL" },
  { code: "JP", name: "Japan", currency: "JPY", timezone: "Asia/Tokyo", locale: "ja-JP" },
  { code: "BR", name: "Brazil", currency: "BRL", timezone: "America/Sao_Paulo", locale: "pt-BR" },
  { code: "ZA", name: "South Africa", currency: "ZAR", timezone: "Africa/Johannesburg", locale: "en-ZA" },
  { code: "NG", name: "Nigeria", currency: "NGN", timezone: "Africa/Lagos", locale: "en-NG" },
  { code: "KE", name: "Kenya", currency: "KES", timezone: "Africa/Nairobi", locale: "en-KE" },
  { code: "PH", name: "Philippines", currency: "PHP", timezone: "Asia/Manila", locale: "en-PH" },
  { code: "TH", name: "Thailand", currency: "THB", timezone: "Asia/Bangkok", locale: "th-TH" },
  { code: "ID", name: "Indonesia", currency: "IDR", timezone: "Asia/Jakarta", locale: "id-ID" },
  { code: "VN", name: "Vietnam", currency: "VND", timezone: "Asia/Ho_Chi_Minh", locale: "vi-VN" },
  { code: "BD", name: "Bangladesh", currency: "BDT", timezone: "Asia/Dhaka", locale: "bn-BD" },
  { code: "NZ", name: "New Zealand", currency: "NZD", timezone: "Pacific/Auckland", locale: "en-NZ" },
];

export const CURRENCIES: { code: string; name: string }[] = [
  { code: "INR", name: "Indian Rupee" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "ZAR", name: "South African Rand" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "THB", name: "Thai Baht" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "VND", name: "Vietnamese Dong" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "CHF", name: "Swiss Franc" },
];

export const TIMEZONES: string[] = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Tokyo",
  "Asia/Jakarta",
  "Asia/Manila",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Dhaka",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Dublin",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
];

export const BUSINESS_TYPES: { value: string; label: string }[] = [
  { value: "retail", label: "Retail" },
  { value: "f&b", label: "Food & Beverage" },
  { value: "services", label: "Services" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "other", label: "Other" },
];

export function countryByCode(code: string): CountryOption | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
