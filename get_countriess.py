import wbdata

def get_countries():
    countries = wbdata.get_countries()
    country_codes = [country['id'] for country in countries]
    return country_codes

if __name__=="__main__":
    print(get_countries())

