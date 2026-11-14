export type Profile = {
  id: string;
  name: string;
  age: number;
  band: string;
  postal: string;
  months: string[];
  cat: Record<string, number[]>;
  cnt: Record<string, number[]>;
  mcc: Record<string, { l3: number; n3: number; lm: number; nlm: number }>;
  fav: Record<string, { visits: number; total: number; merchants: number }>;
  weekday: { sum: number[]; count: number[] };
  night: { count: number; sum: number; restaurants: number };
  eomBalance: number[];
  balance: number;
  daily: { dates: string[]; balance: number[] };
  salaryDay: number | null;
  top: { date: string; cat: string; mcc: string; amt: number }[];
  txCount3: number;
  smallBuys3: { count: number; sum: number };
  mortgage?: {
    decision: "approved" | "rejected";
    reason: string | null;
    price: number;
    loan: number;
    equity: number;
    collateral: number;
    requiredIncome: number;
    ltv: number;
    propertyType: string | null;
    expenses: { type: string; amt: number }[];
    contacts: number;
  };
};

export type PeerBand = {
  n: number;
  spend: Record<string, number>;
  count: Record<string, number>;
  totalSpend: number;
  salary: number;
  saveRate: number;
  /** share of the age group making monthly investment deposits */
  investShare: number;
};

export type Peers = { months: string[]; bands: Record<string, PeerBand> };

export type Level = 1 | 2 | 3;

/** Per-concept answer history: r = times right, w = times wrong. */
export type Mastery = Record<string, { r: number; w: number }>;

export type UnitId = "arki" | "ruoka" | "liikkuminen" | "palkka" | "saasto" | "vertailu" | "koti";

export type Chart = { labels: string[]; values: number[]; highlight?: number; unit?: string };

export type Question = {
  id: string;
  unit: UnitId | "project";
  /** 1 = basics, 2 = intermediate, 3 = advanced */
  level: Level;
  /** What the question teaches; drives mastery tracking and concept cards. */
  concept: string;
  kind: "choice" | "truefalse";
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
  tip?: string;
  chart?: Chart;
  /** Chart would give the answer away, so only show it after checking. */
  chartAfter?: boolean;
  /** Raw numbers handed to the LLM coach so it can personalise the explanation. */
  facts: Record<string, string | number>;
};
