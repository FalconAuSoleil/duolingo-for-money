export const eur = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

/** "2026-09" -> "September 2026" (or "September" with short=true) */
export const monthName = (ym: string, short = false) => {
  const [y, m] = ym.split("-").map(Number);
  return short ? MONTH_NAMES[m - 1] : `${MONTH_NAMES[m - 1]} ${y}`;
};

export const monthAbbr = (ym: string) => MONTH_NAMES[Number(ym.split("-")[1]) - 1].slice(0, 3);

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const MCC_LABELS: Record<string, string> = {
  "7832": "Cinema",
  "7922": "Concert & theatre tickets",
  "7991": "Attractions",
  "7996": "Amusement parks",
  "7999": "Sports & recreation",
  "5411": "Supermarket",
  "5422": "Butcher & fish shop",
  "5451": "Bakery & dairy shop",
  "5499": "Kiosk & specialty food",
  "5912": "Pharmacy",
  "8011": "Doctor",
  "8021": "Dentist",
  "8099": "Health services",
  "5200": "Home improvement store",
  "5251": "Hardware store",
  "5712": "Furniture store",
  "5732": "Electronics store",
  "5734": "Software & apps",
  "5651": "Clothing store",
  "5691": "Fashion boutique",
  "5941": "Sports store",
  "5942": "Bookstore",
  "5945": "Toys & hobbies",
  "5999": "Specialty retail",
  "5812": "Restaurant",
  "5813": "Bar",
  "5814": "Fast food",
  "4111": "Public transport",
  "4121": "Taxi",
  "5541": "Service station",
  "5542": "Fuel pump",
  "7523": "Parking",
  "4511": "Airline",
  "4722": "Travel agency",
  "7011": "Hotel",
  "7512": "Car rental",
};
