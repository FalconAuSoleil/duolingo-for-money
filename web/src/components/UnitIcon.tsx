import { Bus, CalendarDays, ChartLine, House, PiggyBank, Receipt, Sprout, Target, Users, Utensils, Wallet, type LucideProps } from "lucide-react";

const ICONS = {
  wallet: Wallet, utensils: Utensils, bus: Bus, calendar: CalendarDays, sprout: Sprout,
  users: Users, home: House, piggy: PiggyBank, chart: ChartLine, receipt: Receipt, target: Target,
};

export function UnitIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? Sprout;
  return <Icon {...props} />;
}
