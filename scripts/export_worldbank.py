"""
Göstergeleri tek bir düz CSV'ye aktarır.

Uygulamanın çalışması için gerekli değil — tarayıcı veriyi doğrudan Dünya
Bankası'ndan okuyor. Bu betik veriyi çevrimdışı incelemek, rapora koymak ya da
bir veritabanına yüklemek isteyenler için duruyor.

    python scripts/export_worldbank.py --out data/gostergeler.csv

Projenin ilk hâlindeki toplama betiklerine göre dört şey değişti:

1. İki gösterge kodu yanlıştı ve sessizce yanlış sayı üretiyordu.
   FP.CPI.TOTL enflasyon oranı değil TÜFE endeksidir  -> FP.CPI.TOTL.ZG
   SH.DYN.MORT bebek değil 5 yaş altı ölüm hızıdır    -> SP.DYN.IMRT.IN

2. Eksik değerler artık uydurulmuyor. Eskiden bir ülkenin boş hücresi, aynı
   dosyada bulunan on alakasız ülkenin ortalamasıyla dolduruluyordu; bu, gözlem
   gibi görünen ama gözlem olmayan satırlar üretiyordu. Boş, boş kalır.

3. Ülke listesi elle dilimlenmiyor (eski kod 280/290/296 gibi sabitlerle
   bölüyordu) ve "Avrupa Birliği", "Yüksek gelirli ülkeler" gibi toplulaştırmalar
   ayıklanıyor — bunlar sıralamaya girince tabloyu bozuyordu.

4. Dosya döngü içinde değil, bir kez yazılıyor.

Tek bağımlılık: requests. (pandas isteğe bağlı, yalnızca --parquet için.)
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from typing import Any

import requests

BASE = "https://api.worldbank.org/v2"

INDICATORS: dict[str, str] = {
    "NY.GDP.PCAP.CD":     "Kişi Başına GSYİH (ABD doları)",
    "SP.DYN.LE00.IN":     "Doğumda Beklenen Yaşam Süresi (yıl)",
    "FP.CPI.TOTL.ZG":     "Enflasyon, Tüketici Fiyatları (yıllık %)",
    "SL.UEM.TOTL.ZS":     "İşsizlik Oranı (% işgücü)",
    "SP.DYN.IMRT.IN":     "Bebek Ölüm Hızı (1.000 canlı doğumda)",
    "SH.STA.SUIC.P5":     "İntihar Hızı (100.000 kişide)",
    "SP.DYN.CBRT.IN":     "Kaba Doğum Hızı (1.000 kişide)",
    "SH.XPD.CHEX.GD.ZS":  "Sağlık Harcaması (% GSYİH)",
    "SE.PRM.ENRR":        "İlkokul Brüt Kayıt Oranı (%)",
}

TIMEOUT = 60


def get_json(url: str, *, retries: int = 2) -> Any:
    """Yeniden denemeli JSON isteği."""
    for attempt in range(retries + 1):
        try:
            response = requests.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            body = response.json()
            if not isinstance(body, list):
                raise ValueError("Beklenmeyen yanıt biçimi")
            if body and isinstance(body[0], dict) and "message" in body[0]:
                raise ValueError(body[0]["message"][0].get("value", "API hata bildirdi"))
            return body
        except Exception as err:                     # noqa: BLE001
            if attempt == retries:
                raise
            print(f"  yeniden deneniyor ({err})", file=sys.stderr)
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("ulaşılamaz")


def fetch_countries() -> dict[str, dict[str, str]]:
    """ISO3 -> künye. Toplulaştırmalar (region.id == 'NA') elenir."""
    body = get_json(f"{BASE}/country?format=json&per_page=400")
    countries = {}
    for row in body[1]:
        if row["region"]["id"] == "NA":
            continue
        countries[row["id"]] = {
            "iso3": row["id"],
            "iso2": row["iso2Code"],
            "country": row["name"].strip(),
            "region": row["region"]["value"].strip(),
            "income": (row["incomeLevel"] or {}).get("value", "").strip(),
            "capital": (row["capitalCity"] or "").strip(),
        }
    return countries


def fetch_indicator(code: str, start: int, end: int) -> dict[tuple[str, int], float]:
    """(ISO3, yıl) -> değer. Tüm ülkeler tek istekte gelir."""
    url = (
        f"{BASE}/country/all/indicator/{code}"
        f"?format=json&per_page=20000&date={start}:{end}"
    )
    body = get_json(url)
    out: dict[tuple[str, int], float] = {}
    for row in body[1] or []:
        iso3 = row.get("countryiso3code")
        value = row.get("value")
        # Toplulaştırmaların ISO3'ü boş gelir; değeri olmayan satır işe yaramaz.
        if not iso3 or value is None:
            continue
        out[(iso3, int(row["date"]))] = float(value)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default="data/gostergeler.csv", help="çıktı CSV yolu")
    parser.add_argument("--start", type=int, default=1990, help="başlangıç yılı")
    parser.add_argument("--end", type=int, default=2024, help="bitiş yılı")
    args = parser.parse_args()

    print("Ülke künyeleri alınıyor…")
    countries = fetch_countries()
    print(f"  {len(countries)} ülke (toplulaştırmalar elendi)")

    series: dict[str, dict[tuple[str, int], float]] = {}
    for code, label in INDICATORS.items():
        print(f"{code} — {label}")
        series[code] = fetch_indicator(code, args.start, args.end)
        print(f"  {len(series[code])} gözlem")

    # Yalnızca en az bir göstergesi dolu olan ülke-yıl satırları yazılır.
    keys = sorted({key for table in series.values() for key in table})

    header = ["iso3", "iso2", "country", "region", "income", "capital", "year"]
    header += list(INDICATORS.values())

    written = 0
    with open(args.out, "w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        for iso3, year in keys:
            meta = countries.get(iso3)
            if meta is None:          # ülke değil ya da künyesi yok
                continue
            row = [meta["iso3"], meta["iso2"], meta["country"],
                   meta["region"], meta["income"], meta["capital"], year]
            # Eksik değer boş bırakılır; ortalamayla doldurulmaz.
            row += [series[code].get((iso3, year), "") for code in INDICATORS]
            writer.writerow(row)
            written += 1

    print(f"\n{written} satır yazıldı → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
