import pandas as pd
import os
import wbdata
from get_countriess import get_countries
from utils import delete_files
from read_json_with_pandas import coordinates

indicators = {
    'FP.CPI.TOTL': 'Enflasyon Oranı (%)',
    'SH.STA.SUIC.P5': 'İntihar Oranı (100.000 Kişi Başına)',
    'SP.DYN.CBRT.IN': 'Doğum Oranı (1000 Kişi Başına)',
    'SH.DYN.MORT': 'Bebek Ölüm Oranı (1000 Canlı Doğum Başına)',
    'SH.XPD.CHEX.GD.ZS': 'Sağlık Harcamaları (% GSYİH)',
    'SP.DYN.LE00.IN': 'Doğumda Beklenen Yaşam Süresi (yıl)',
    'SE.PRM.ENRR': 'İlkokul Kaydı Oranı (%)',
    'SL.UEM.TOTL.ZS': 'İşsizlik Oranı (%)',
    'NY.GDP.PCAP.CD': 'Kişi Başına GSYİH (ABD Doları)',
}


countries = get_countries()

def get_datas_as_csv(countries):
    i=0
    n=0 
    while i < len(countries):
        df = wbdata.get_dataframe(indicators, country=countries[i:i+10])
        if i <= 280:
            i+=10
            n+=1
            df = df.reset_index()
            df["date"] = pd.to_datetime(df["date"])
            df = df[(df['date'] >= '1980-01-01') & (df['date'] <= '2023-01-01')]

            df.to_csv(f'data\\all_table_{n}.csv', encoding='utf-8')
            print(f"added table {n}")

        else:
            df = wbdata.get_dataframe(indicators, country=countries[290:296])
            n+=1
            i+=6
            df = df.reset_index()
            df["date"] = pd.to_datetime(df["date"])
            df = df[(df['date'] >= '1980-01-01') & (df['date'] <= '2023-01-01')]

            df.to_csv(f'data\\all_table_{n}.csv', encoding='utf-8')
            print(f"added table {n}")






def concat_tables(path):
    for root, dirs, files in os.walk(path):
        dfs = [pd.read_csv(os.path.join(path, file), on_bad_lines='skip') for file in files]
        concated_df = pd.concat(dfs, ignore_index = True)
        country_name_and_coordinates = coordinates()

        coordinates_list = []
        
        for c in concated_df["country"]:
            found = False
            for country_dict in country_name_and_coordinates:
                if c == country_dict["country"]:
                    coordinates_list.append(country_dict["coordinates"])
                    found = True
                    break
            if not found:
                coordinates_list.append("null")
        
        concated_df["coordinates"] = coordinates_list


        concated_df.to_csv('.\\one_table.csv', encoding='utf-8')
        print("concated discrete files..")

        delete_files('data')
        break





def fill_missing_values(csv_path):
    for root, dirs, files in os.walk(csv_path):
        for file in files:
            df = pd.read_csv(os.path.join(csv_path, file))
            cols = df.columns
            for col in cols[3:]:
                df[col] = df[col].fillna(df[col].mean())
                df.to_csv(os.path.join(csv_path, file), encoding='utf-8')
        break



if __name__ == "__main__":
    get_datas_as_csv(countries)
    fill_missing_values(".\\data")
    concat_tables(".\\data")
