import fs from "fs";

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function getKoreaBaseRate(ecosKey) {
  const today = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(today.getFullYear() - 1);
  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${ecosKey}/json/kr/1/500/722Y001/D/${formatDate(oneYearAgo)}/${formatDate(today)}/0101000`;
  const res = await fetch(url);
  const data = await res.json();
  const rows = data.StatisticSearch?.row;
  if (!rows) throw new Error("ECOS 기준금리 조회 실패: " + JSON.stringify(data));
  const latest = rows[rows.length - 1];
  return { date: latest.TIME, value: latest.DATA_VALUE };
}

async function getUsdKrwRate(ecosKey) {
  const url = `https://ecos.bok.or.kr/api/KeyStatisticList/${ecosKey}/json/kr/1/100`;
  const res = await fetch(url);
  const data = await res.json();
  const rows = data.KeyStatisticList?.row;
  if (!rows) throw new Error("ECOS 환율 조회 실패: " + JSON.stringify(data));
  const rate = rows.find((r) => r.KEYSTAT_NAME === "원/달러 환율(종가)");
  return rate ? { date: rate.CYCLE, value: rate.DATA_VALUE, unit: rate.UNIT_NAME } : null;
}

async function getUSBaseRate(fredKey) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&api_key=${fredKey}&file_type=json&sort_order=desc&limit=1`;
  const res = await fetch(url);
  const data = await res.json();
  const obs = data.observations?.[0];
  if (!obs) throw new Error("FRED 조회 실패: " + JSON.stringify(data));
  return { date: obs.date, value: obs.value };
}

async function main() {
  const ecosKey = process.env.ECOS_KEY;
  const fredKey = process.env.FRED_KEY;

  const [kr, fx, us] = await Promise.all([
    getKoreaBaseRate(ecosKey),
    getUsdKrwRate(ecosKey),
    getUSBaseRate(fredKey),
  ]);

  const result = {
    krBaseRate: kr,
    usdKrw: fx,
    usTargetRateUpper: us,
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/rates.json", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});