export type LocationLookupKind = "city" | "address";

export type LocationNominatimRow = {
  display_name: string;
  name?: string;
  type?: string;
  addresstype?: string;
  address?: Record<string, string | undefined>;
};

export type LocationAddressOption = {
  display_name: string;
};

export type LocationCityOption = {
  name: string;
  display: string;
};
