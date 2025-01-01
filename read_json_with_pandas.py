import pandas as pd

coordinates_path = ".\countries.geo.json"


def coordinates():
    df_coordinates = pd.read_json(coordinates_path)
    df_coordinates = pd.DataFrame(df_coordinates)
    country_name_and_coordinates = []
    for feauture in df_coordinates["features"]:
        coordinates_df = feauture["geometry"]["coordinates"]
        country_names_df = feauture["properties"]["name"]
        country_name_and_coordinates.append({"country": country_names_df, "coordinates": coordinates_df})
    return country_name_and_coordinates



if __name__ == "__main__":
    print(coordinates())
