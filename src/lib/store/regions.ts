/**
 * First-level regions for the countries shops can take payments in, so the
 * merchant picks from a list rather than typing. Other countries look their
 * region up through /api/location/search.
 */
export const COUNTRY_REGIONS: Record<string, { label: string; regions: readonly string[] }> = {
  NG: {
    label: "State",
    regions: [
      "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
      "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi",
      "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
    ],
  },
  GH: {
    label: "Region",
    regions: [
      "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah",
      "Upper East", "Upper West", "Volta", "Western", "Western North",
    ],
  },
  KE: {
    label: "County",
    regions: [
      "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega",
      "Kericho", "Kiambu", "Kilifi", "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni",
      "Mandera", "Marsabit", "Meru", "Migori", "Mombasa", "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
      "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi", "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga",
      "Wajir", "West Pokot",
    ],
  },
  ZA: {
    label: "Province",
    regions: ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"],
  },
};

export function regionLabel(countryCode: string) {
  return COUNTRY_REGIONS[countryCode]?.label ?? "State or region";
}
