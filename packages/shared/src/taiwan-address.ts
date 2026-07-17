import { TAIWAN_POSTAL_CODES } from './taiwan/postal-codes';

export const TAIWAN_ADDRESS_POSTAL_CODES = TAIWAN_POSTAL_CODES;

export interface ParsedTaiwanAddress {
  city: string | null;
  district: string | null;
  postalCode: string | null;
  normalizedAddress: string;
}

export interface TaiwanDistrictOption {
  district: string;
  postalCode: string;
}

export const TAIWAN_ADDRESS_OPTIONS = Object.entries(TAIWAN_ADDRESS_POSTAL_CODES).map(
  ([city, districts]) => ({
    city,
    districts: Object.entries(districts).map(([district, postalCode]) => ({
      district,
      postalCode,
    })),
  }),
);

export function getTaiwanCities(): string[] {
  return TAIWAN_ADDRESS_OPTIONS.map((option) => option.city);
}

export function getDistrictsByCity(city?: string | null): TaiwanDistrictOption[] {
  if (!city) return [];
  return TAIWAN_ADDRESS_OPTIONS.find((option) => option.city === city)?.districts ?? [];
}

export function getPostalCodeByDistrict(city?: string | null, district?: string | null): string | null {
  if (!city || !district) return null;
  return TAIWAN_ADDRESS_POSTAL_CODES[city]?.[district] ?? null;
}

function normalizeTaiwanText(value: string): string {
  return value.trim().replace(/臺/g, '台');
}

function compactForAddressMatch(value: string): string {
  return normalizeTaiwanText(value).replace(/\s+/g, '');
}

function withoutLeadingThreeDigitPostalCode(value: string): string {
  return value.replace(/^\d{3}\s*/, '');
}

export function parseTaiwanAddress(address: string): ParsedTaiwanAddress {
  const normalizedAddress = address.trim();
  if (!normalizedAddress) {
    return {
      city: null,
      district: null,
      postalCode: null,
      normalizedAddress,
    };
  }

  const compactAddress = compactForAddressMatch(normalizedAddress);
  const compactAddressWithoutPostalCode = withoutLeadingThreeDigitPostalCode(compactAddress);

  for (const [city, districts] of Object.entries(TAIWAN_ADDRESS_POSTAL_CODES)) {
    const normalizedCity = compactForAddressMatch(city);
    const cityMatchedAddresses = [compactAddress, compactAddressWithoutPostalCode].filter((candidate) =>
      candidate.startsWith(normalizedCity),
    );

    if (cityMatchedAddresses.length === 0) continue;

    const sortedDistricts = Object.entries(districts).sort(
      ([districtA], [districtB]) => districtB.length - districtA.length,
    );

    for (const [district, postalCode] of sortedDistricts) {
      const normalizedDistrict = compactForAddressMatch(district);
      const expectedPrefix = `${normalizedCity}${normalizedDistrict}`;
      const isPrefixMatch = cityMatchedAddresses.some((candidate) => candidate.startsWith(expectedPrefix));

      if (isPrefixMatch) {
        return {
          city,
          district,
          postalCode,
          normalizedAddress,
        };
      }
    }
  }

  return {
    city: null,
    district: null,
    postalCode: null,
    normalizedAddress,
  };
}
