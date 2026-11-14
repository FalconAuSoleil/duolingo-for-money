"""Pre-compute compact per-customer profiles + peer benchmarks from the S-Pankki Junction dataset.

Output: web/src/data/profiles.json (demo customers) and web/src/data/peers.json (age-band medians).
Run: python3 scripts/build_profiles.py
"""
import json
import os

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data-repo")
OUT = os.path.join(ROOT, "web", "src", "data")
os.makedirs(OUT, exist_ok=True)

SPEND_CATS = ["Groceries", "Restaurants", "Transportation", "Utilities", "Entertainment", "Health",
              "Home & Tech", "Housing", "Lifestyle", "Travel"]
NAMES = ["Aino", "Mikko", "Emma", "Juha", "Sofia", "Antti", "Helmi", "Ville", "Ella", "Matti", "Olivia", "Timo",
         "Lumi", "Jari", "Aada", "Pekka", "Venla", "Kari", "Isla", "Mika", "Eevi", "Sami", "Hilla", "Janne",
         "Saara", "Petri", "Iida", "Teemu", "Kerttu", "Lauri", "Noora", "Ari", "Veera", "Heikki", "Linnea", "Tuomas",
         "Elsa", "Marko", "Pihla", "Esa"]


def age_band(a):
    for lo, hi in [(18, 25), (26, 35), (36, 45), (46, 55), (56, 65)]:
        if lo <= a <= hi:
            return f"{lo}-{hi}"
    return "66+"


print("loading transactions…")
tx = pd.read_csv(os.path.join(ROOT, "tx_full.csv"), encoding="utf-8-sig",
                 dtype={"merchant_id": str, "mcc_code": str, "customer_id": str})
tx["date"] = pd.to_datetime(tx["tx_date"])
tx["ym"] = tx["date"].dt.strftime("%Y-%m")
tx["ts"] = pd.to_datetime(tx["tx_timestamp"], format="%d%b%y:%H:%M:%S")
tx["hour"] = tx["ts"].dt.hour
tx["wd"] = tx["date"].dt.weekday
tx["amt"] = tx["tx_amount_eur"].abs()

cust = pd.read_csv(os.path.join(DATA, "tx_customers_junction.csv"), encoding="utf-8-sig", dtype=str)
cust["customer_age"] = cust["customer_age"].astype(int)
mlink = pd.read_csv(os.path.join(DATA, "mtg_tx_customer_link_and_final_mtg_infio.csv"), encoding="utf-8-sig")
mhist = pd.read_csv(os.path.join(DATA, "mtg_negotiation_history.csv"), encoding="utf-8-sig")

MONTHS = sorted(tx["ym"].unique())
LAST = MONTHS[-1]
L3 = MONTHS[-3:]
L12 = MONTHS[-12:]

# ---------- peer benchmarks over all customers ----------
print("peer benchmarks…")
monthly = tx.pivot_table(index=["customer_id", "ym"], columns="category", values="amt", aggfunc="sum", fill_value=0)
m12 = monthly[monthly.index.get_level_values("ym").isin(L12)].groupby("customer_id").mean()
cnt12 = (tx[tx["ym"].isin(L12)].pivot_table(index="customer_id", columns="category", values="amt",
                                            aggfunc="count", fill_value=0) / 12)
m12 = m12.join(cust.set_index("customer_id")["customer_age"])
m12["band"] = m12["customer_age"].map(age_band)
m12["spend"] = m12[[c for c in SPEND_CATS if c in m12]].sum(axis=1)
# salary sweeps move pay to another account; they are not savings
m12["save_rate"] = m12.get("Invest Deposit", 0) / m12["Salary"].replace(0, np.nan)
cnt12 = cnt12.join(m12["band"])
peers = {}
for band, g in m12.groupby("band"):
    c = cnt12[cnt12["band"] == band]
    peers[band] = {
        "n": int(len(g)),
        "spend": {k: round(float(g[k].median()), 2) for k in SPEND_CATS},
        "count": {k: round(float(c[k].median()), 1) for k in ["Restaurants", "Groceries", "Transportation"]},
        "totalSpend": round(float(g["spend"].median()), 2),
        "salary": round(float(g["Salary"].median()), 2),
        "saveRate": round(float(g["save_rate"].median(skipna=True)), 3),
        "investShare": round(float((g.get("Invest Deposit", 0) > 0).mean()), 3),
    }
json.dump({"months": L12, "bands": peers}, open(os.path.join(OUT, "peers.json"), "w"), indent=1)

# ---------- choose demo customers ----------
print("selecting demo customers…")
full = tx.groupby("customer_id")["ym"].nunique()
full = set(full[full == len(MONTHS)].index)
full_all = set(full)
# prefer active customers: they make for richer questions
active = tx[tx["ym"].isin(L3)].groupby("customer_id").size()
full &= set(active[active >= 120].index)
has_sal = set(tx[(tx["category"] == "Salary") & tx["ym"].isin(L3)]["customer_id"])
eligible = cust[cust["customer_id"].isin(full & has_sal)].copy()
eligible["band"] = eligible["customer_age"].map(age_band)
mort_ids = set(mlink["customer_id"])
rng = np.random.default_rng(2026)
chosen = []
# mortgage applicants are rarer, so relax the activity filter for them
mort_pool = cust[cust["customer_id"].isin(mort_ids & full_all & has_sal)]
mort_pool = mort_pool.assign(n=mort_pool["customer_id"].map(active).fillna(0)).sort_values("n", ascending=False)
chosen += list(mort_pool.head(8)["customer_id"])
for band, g in eligible[~eligible["customer_id"].isin(mort_ids)].groupby("band"):
    chosen += list(g.sample(min(5, len(g)), random_state=11)["customer_id"])
chosen = chosen[:38]

# ---------- per-customer profiles ----------
print("building profiles…")
profiles = []
for i, cid in enumerate(chosen):
    t = tx[tx["customer_id"] == cid].sort_values("ts")
    c = cust[cust["customer_id"] == cid].iloc[0]
    spend = t[t["tx_amount_eur"] < 0]
    purch = t[t["transaction_type"] == "purchase"]
    cat_m = t.pivot_table(index="ym", columns="category", values="amt", aggfunc="sum", fill_value=0).reindex(MONTHS, fill_value=0)
    cnt_m = t.pivot_table(index="ym", columns="category", values="amt", aggfunc="count", fill_value=0).reindex(MONTHS, fill_value=0)
    last3 = purch[purch["ym"].isin(L3)]
    lastm = purch[purch["ym"] == LAST]

    mcc = {}
    for code, g in purch[purch["ym"].isin(L3)].groupby("mcc_code"):
        gl = g[g["ym"] == LAST]
        mcc[code] = {"l3": round(g["amt"].sum(), 2), "n3": int(len(g)), "lm": round(gl["amt"].sum(), 2), "nlm": int(len(gl))}

    fav = {}
    for cat, g in last3.groupby("category"):
        top = g.groupby("merchant_id")["amt"].agg(["count", "sum"]).sort_values("count", ascending=False)
        if len(top):
            fav[cat] = {"visits": int(top.iloc[0]["count"]), "total": round(float(top.iloc[0]["sum"]), 2),
                        "merchants": int(len(top))}

    wd = last3.groupby("wd")["amt"].agg(["sum", "count"]).reindex(range(7), fill_value=0)
    night = last3[(last3["hour"] >= 22) | (last3["hour"] < 5)]
    eom_bal = t.groupby("ym")["balance_after_eur"].last().reindex(MONTHS).ffill().fillna(0)
    daily = t[t["date"] >= t["date"].max() - pd.Timedelta(days=89)].groupby("tx_date")["balance_after_eur"].last()
    sal = t[t["category"] == "Salary"]
    sal_day = int(sal["date"].dt.day.mode().iloc[0]) if len(sal) else None
    top5 = lastm.sort_values("amt", ascending=False).head(5)

    prof = {
        "id": cid,
        "name": NAMES[i % len(NAMES)],
        "age": int(c["customer_age"]),
        "band": age_band(int(c["customer_age"])),
        "postal": c["customer_postal_code"],
        "months": MONTHS,
        "cat": {k: [round(float(x), 2) for x in cat_m[k]] for k in cat_m.columns},
        "cnt": {k: [int(x) for x in cnt_m[k]] for k in cnt_m.columns},
        "mcc": mcc,
        "fav": fav,
        "weekday": {"sum": [round(float(x), 2) for x in wd["sum"]], "count": [int(x) for x in wd["count"]]},
        "night": {"count": int(len(night)), "sum": round(float(night["amt"].sum()), 2),
                  "restaurants": int((night["category"] == "Restaurants").sum())},
        "eomBalance": [round(float(x), 2) for x in eom_bal],
        "balance": round(float(t["balance_after_eur"].iloc[-1]), 2),
        "daily": {"dates": list(daily.index), "balance": [round(float(x), 2) for x in daily.values]},
        "salaryDay": sal_day,
        "top": [{"date": r.tx_date, "cat": r.category, "mcc": None if pd.isna(r.mcc_code) else r.mcc_code, "amt": round(r.amt, 2)} for r in top5.itertuples()],
        "txCount3": int(len(last3)),
        "smallBuys3": {"count": int((last3["amt"] < 10).sum()), "sum": round(float(last3[last3["amt"] < 10]["amt"].sum()), 2)},
    }
    ml = mlink[mlink["customer_id"] == cid]
    if len(ml):
        r = ml.iloc[0]
        h = mhist[mhist["mortgage_customer_id"] == r["mortgage_customer_id"]]
        exp = h[h["event_type"] == "expense_recorded"]
        prof["mortgage"] = {
            "decision": r["final_decision"],
            "reason": None if pd.isna(r["rejection_reason"]) else r["rejection_reason"],
            "price": float(r["final_property_price_eur"]),
            "loan": float(r["final_requested_loan_eur"]),
            "equity": float(r["final_equity_amount_eur"]),
            "collateral": float(r["final_collateral_value_eur"]),
            "requiredIncome": round(float(r["required_monthly_income_eur"]), 2),
            "ltv": round(float(r["lfinal_loan_to_value"]), 4),
            "propertyType": next((x for x in h["property_type"].dropna()), None),
            "expenses": [{"type": e.expense_type, "amt": float(e.expense_amount)} for e in exp.itertuples()
                         if not pd.isna(e.expense_amount)],
            "contacts": int((h["event_type"] == "customer_contact").sum()),
        }
    profiles.append(prof)

json.dump(profiles, open(os.path.join(OUT, "profiles.json"), "w"), separators=(",", ":"), allow_nan=False)
print("done:", len(profiles), "profiles,", os.path.getsize(os.path.join(OUT, "profiles.json")) // 1024, "KB")
