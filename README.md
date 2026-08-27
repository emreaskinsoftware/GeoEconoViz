# GeoEconoViz

Dünya Bankası kalkınma göstergelerini 3B küre üzerinde gösteren etkileşimli
atlas. Bir gösterge seçersiniz, dünya o göstergeye göre boyanır; yıl sürgüsünü
oynatırsanız renkler ve sıralama otuz beş yıl boyunca birlikte kayar.

**Sunucu yok, veritabanı yok, API anahtarı yok, ücret yok.** Statik bir klasör;
veriyi tarayıcı doğrudan Dünya Bankası'ndan okuyup yerel olarak önbelleğe alıyor.

---

## Çalıştırma

```bash
npm start
```

Sonra `http://localhost:5173`. Kurulum adımı yok — `server.js` bağımlılıksızdır,
`npm install` gerekmez. Node 18 veya üstü yeterli.

`index.html` dosyasını çift tıklayıp açmak çalışmaz: uygulama ES modülleri
kullanıyor, bunlar `file://` üzerinden yüklenmez. HTTP gerekiyor.

## Yayına alma

Klasörü olduğu gibi GitHub Pages, Netlify, Vercel ya da herhangi bir statik
barındırıcıya koymak yeterli. Derleme adımı ve ortam değişkeni yoktur.

---

## Ne var içinde

| | |
|---|---|
| **Dokuz gösterge** | Kişi başına gelir, yaşam süresi, enflasyon, işsizlik, bebek ölüm hızı, intihar hızı, doğum hızı, sağlık harcaması, ilkokul kayıt oranı |
| **Küre** | CesiumJS; gerçek arazi ve batimetri dokusu üzerine ülkeler seçili göstergeye göre boyanıyor (choropleth). Üst çubuktaki düğmeyle düz veri görünümüne geçilebiliyor |
| **Yıl şeridi** | 1990'dan bugüne sürgü; oynat düğmesiyle otomatik ilerleme |
| **Sıralama** | Yıl değiştikçe satırlar yeni yerlerine kayarak gidiyor |
| **Ülke dosyası** | Dokuz göstergenin o yılki değeri, her birinin eğrisi, tam zaman serisi ve Vikipedi özeti |
| **Bağlantı** | `#/gösterge/yıl/ülke` — açtığınız görünüm paylaşılabilir |

Arazi dokusu Cesium'un kendi paketiyle gelen **Natural Earth II** kabartma ve
batimetri döşemeleri; dış servis, anahtar ya da depoya eklenmiş görsel yok.

Klavye: `/` aramaya odaklanır, ok tuşları gösterge listesinde dolaşır,
`Esc` açık paneli kapatır. `prefers-reduced-motion` açıksa tüm animasyonlar
kapanır, hiçbir bilgi kaybolmaz.

---

## Veri

[Dünya Bankası Açık Verisi](https://data.worldbank.org), CC BY 4.0.

Tarayıcı `api.worldbank.org/v2` adresinden okuyor. Bir gösterge tek istekte
geliyor (tüm ülkeler × tüm yıllar) ve sıkıştırılmış hâliyle **IndexedDB**'ye
yedi günlüğüne yazılıyor; sonraki açılışlar ağa çıkmıyor.

Ülke eşleştirmesi **ISO 3166-1 alpha-3** kodları üzerinden yapılıyor —
`data/countries.geo.json` içindeki her sınırın kodu, API'nin döndürdüğü
`countryiso3code` ile birebir tutuyor. Türkçe ülke adları
`Intl.DisplayNames(['tr'])` ile üretiliyor.

Toplulaştırmalar ("Avrupa Birliği", "Yüksek gelirli ülkeler" gibi) ayıklanıyor;
sıralamaya girdiklerinde tabloyu bozuyorlardı.

### Veriyi çevrimdışı almak

Uygulama için gerekli değil, ama rapor ya da veritabanı yüklemesi için:

```bash
pip install requests
python scripts/export_worldbank.py --out data/gostergeler.csv
```

---

## Yapı

```
index.html              tek sayfa
server.js               bağımlılıksız yerel sunucu
app/css/
  tokens.css            renk, tipografi, boşluk, hareket belirteçleri
  base.css              sıfırlama ve ortak ilkeller
  shell.css             kabuk, üst çubuk, sol ray, zaman şeridi
  panels.css            sıralama, ülke dosyası, grafik, ipucu, bildirim
  responsive.css        uyarlanabilir düzen ve yazdırma
app/js/
  app.js                orkestrasyon ve durum
  indicators.js         gösterge kayıtları ve renk rampaları
  worldbank.js          API katmanı
  store.js              IndexedDB önbelleği
  scale.js              nicelik ölçeği ve renk ara değerleme
  globe.js              Cesium sarmalayıcı ve choropleth
  ui/                   ray, zaman şeridi, sıralama, dosya, arama, grafik, bildirim
data/countries.geo.json ISO3 kodlu ülke sınırları
scripts/                isteğe bağlı CSV dışa aktarma
```

Durum üç alandan ibaret: hangi gösterge, hangi yıl, hangi ülke seçili. Küre,
lejant, sıralama ve dosya bu üçünden türetiliyor.

---

## Tasarım

Yön: **basılı istatistik atlası.** Soğuk harita kağıdı zemin, matbaa mürekkebi,
ince çizgiler. Küre sayfanın ortasında koyu bir baskı plakası içinde oturur —
tıpkı basılı bir atlastaki şekil penceresi gibi.

Cam, bulanıklık ve neon geçiş yok. Bunun bir okunurluk gerekçesi var: metin
hareket eden bir kürenin üzerinde yarı saydam bir panelde durduğunda arka plan
sabit olmuyor ve kontrast sürekli oynuyordu. Artık her yazı düz ve durağan bir
zemin üzerinde; ikincil metinler beyaz kart üzerinde 6,56:1 veriyor
(WCAG AA eşiği 4,5).

Gösterge değiştiğinde lejant, sıralama çubukları, grafik çizgisi ve seçim
işaretleri birlikte renk değiştiriyor. Üç rampa var, hangisinin kullanılacağını
göstergenin anlamı belirliyor:

| Rampa | Kullanan göstergeler | Renk |
|---|---|---|
| Refah | gelir, yaşam süresi, sağlık, okullaşma | kağıt yeşili → koyu çam |
| Risk | enflasyon, işsizlik, bebek ölümü, intihar | açık kum → yanık kızıl |
| Yansız | doğum hızı | açık leylak → gece moru |

Matbaa mantığı: **açık = düşük, koyu = yüksek.** Basılı atlaslarda okuma yönü
budur ve ayrımı doygunluk değil koyuluk taşıdığı için hiçbir gösterge "uyarı
ışığı" gibi görünmez.

Renk, değerin kendisine değil o yılki **sıra yüzdesine** bağlanıyor. Kişi başına
gelir gibi ağır çarpık göstergelerde doğrusal ölçek kullanılsa dünyanın neredeyse
tamamı rampanın bir ucunda toplanır ve harita hiçbir şey anlatmaz.

Yazı: **Archivo** sözcükler için, **IBM Plex Mono** ölçümler için. Bu ayrım
tesadüfi değil — bir atlasın yaptığı da tam olarak düzyazı ile veriyi ayırmaktır.

## Sürüm 2 neyi değiştirdi

İlk sürüm Express + MongoDB Atlas + Render üçlüsüne dayanıyordu. Üçünün de
ücretsiz katmanı zamanla kapandı ve proje tamamen çalışmaz hâle geldi. İkinci
sürüm bu bağımlılıkların hepsini kaldırdı.

Yol boyunca düzeltilen, veriyi sessizce yanlış gösteren hatalar:

- `FP.CPI.TOTL` enflasyon oranı değil TÜFE endeksidir → `FP.CPI.TOTL.ZG`
- `SH.DYN.MORT` bebek değil 5 yaş altı ölüm hızıdır → `SP.DYN.IMRT.IN`
- İntihar oranı, veritabanında hiç var olmayan bir alana bağlıydı; her satırda
  "Veri yok" yazıyordu
- Eksik değerler, aynı toplu istekte bulunan **on alakasız ülkenin** ortalamasıyla
  dolduruluyordu — gözlem gibi görünen uydurma satırlar üretiyordu
- Türkçe kısaltmada `B` *bin* demektir; kısaltmayı elle çevirmek sayıyı bir
  milyon katına çıkarıyordu

Arayüz tarafında: sınır GeoJSON'u ile koddaki çeviri ve bayrak tabloları farklı
adlandırmalar kullanıyordu (bozuk bayraklar, çevrilmemiş ülke adları); Bootstrap'in
`.tooltip{opacity:0}` kuralı özel ipucunu tamamen görünmez kılıyordu; her fare
hareketinde 180 çokgende ışın atılıyordu; iki ayrı betik aynı tabloyu farklı
indeks düzenleriyle yazıp birbirini eziyordu; düzen tamamen sabit piksellerdi.

---

## Lisans

MIT — bkz. [LICENSE](LICENSE). Veri Dünya Bankası'na aittir (CC BY 4.0).
Küre [CesiumJS](https://cesium.com/platform/cesiumjs/) (Apache 2.0) ile çiziliyor,
bayraklar [flagcdn.com](https://flagcdn.com) üzerinden geliyor.
