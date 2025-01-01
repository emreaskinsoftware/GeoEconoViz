// Gerekli paketleri yükleme
require('dotenv').config({ path: '../.env' });
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const corsOptions = {
  origin: '*', // Gerekirse belirli bir domain ile sınırlandırabilirsiniz
  methods: ['GET', 'POST'],
};

// Frontend statik dosyalarını servis et
const frontendPath = path.join(__dirname, '../frontend');


app.use(cors(corsOptions));
app.use(express.json());

// .env dosyasından bağlantı URL'sini al
const mongoUri = process.env.MONGO_URI;


if (!mongoUri) {
  console.error('MONGO_URI tanımlanmamış! Lütfen .env dosyanızı kontrol edin.');
  process.exit(1);
}

mongoose.connect(mongoUri) // Artık seçeneklere gerek yok
  .then(() => console.log('MongoDB bağlantısı başarılı'))
  .catch(error => console.error('MongoDB bağlantı hatası:', error));

// Şema tanımlama
const countrySchema = new mongoose.Schema({
  country: String,
  date: Date,
  enflasyonOrani: Number,
  İntiharOrani: Number,
  dogumOrani: Number,
  bebekOlumOrani: Number,
  saglikHarcamalari: Number,
  yasamSuresi: Number,
  ilkokulKaydiOrani: Number,
  issizlikOrani: Number,
  kisiBasiGsyih: Number
}, { collection: 'Ulkeler' });  // Koleksiyon adı 'Ulkeler' olarak ayarlandı

const Country = mongoose.model('Country', countrySchema);

app.get('/countries', async (req, res) => {
  const { year, countryName, metrics } = req.query;

  // Filtreleme koşulları
  const matchStage = {};

  // Ülke adı belirtilmişse filtre ekle
  if (countryName) {
    matchStage.country = { $regex: new RegExp(`^${countryName}$`, 'i') }; // Büyük/küçük harf duyarsız eşleşme
  }

  // Yıl belirtilmişse filtre ekle
  if (year) {
    const yearArray = year.split(',').map(y => new Date(`${y}-01-01`));
    matchStage.date = { $in: yearArray };
  }

  // Varsayılan yıl 2023 (tüm ülkeler için)
  if (!countryName && !year) {
    matchStage.date = new Date("2023-01-01");
  }

  // Projection aşaması
  let projectionStage = { country: 1, date: 1 }; // Varsayılan olarak sadece ülke ve tarih alınır
  if (metrics) {
    const metricMapping = {
      enflasyonOrani: "Enflasyon Oranı (%)",
      İntiharOrani: "İntiharOrani",
      dogumOrani: "Doğum Oranı (1000 Kişi Başına)",
      bebekOlumOrani: "Bebek Ölüm Oranı (1000 Canlı Doğum Başına)",
      saglikHarcamalari: "Sağlık Harcamaları (% GSYİH)",
      yasamSuresi: "Doğumda Beklenen Yaşam Süresi (yıl)",
      ilkokulKayitOrani: "İlkokul Kaydı Oranı (%)",
      isizlikOrani: "İşsizlik Oranı (%)",
      kisiBasiGsyih: "Kişi Başına GSYİH (ABD Doları)"
    };

    const selectedMetrics = metrics.split(','); // Virgülle ayrılmış metrikleri al
    selectedMetrics.forEach(metric => {
      if (metricMapping[metric]) {
        projectionStage[metricMapping[metric]] = 1; // Seçilen metrikleri projection'a ekle
      }
    });
  }

  try {
    // Veritabanından verileri getirme
    const countries = await Country.find(matchStage)
      .select(projectionStage)
      .sort({ date: -1 }); // Tarihe göre sıralama (en güncel veriler)

    // Eğer sonuç boşsa 404 döndür
    if (countries.length === 0) {
      return res.status(404).json({ message: "Veri bulunamadı." });
    }

    // Sonuçları döndür
    res.json(countries);
  } catch (error) {
    console.error('Veri getirilirken hata oluştu:', error);
    res.status(500).json({ message: error.message });
  }
});




// Kişi başına gelir verilerini her ülke için yıl parametresi opsiyonel olan API
app.get('/countries/income', async (req, res) => {
  const { year } = req.query;

  try {
    // Eğer 'year' parametresi verilmişse belirtilen yıl ve kişi başına gelir dolu olanları eşleştir
    const matchStage = year
      ? { $match: { date: new Date(`${year}-01-01`), "Kişi Başına GSYİH (ABD Doları)": { $ne: null } } } // Belirtilen yıl ve dolu gelir verileri
      : { $match: { "Kişi Başına GSYİH (ABD Doları)": { $ne: null } } }; // Yıl belirtilmezse en güncel dolu gelir verilerini al

    const sortStage = year
      ? { $sort: { "Kişi Başına GSYİH (ABD Doları)": -1 } } // Eğer yıl belirtilmişse kişi başına gelirle sıralama
      : { $sort: { date: -1, "Kişi Başına GSYİH (ABD Doları)": -1 } }; // En güncel yılı bulmak için tarihe göre sıralama

    const countries = await Country.aggregate([
      matchStage,
      sortStage,
      {
        $group: {
          _id: "$country",
          kisiBasiGsyih: { $first: "$Kişi Başına GSYİH (ABD Doları)" },
          country: { $first: "$country" },
          date: { $first: "$date" }
        }
      },
      { $sort: { kisiBasiGsyih: -1 } }
    ]);

    if (countries.length === 0) {
      return res.status(404).json({ message: "Kişi başına gelir verisi bulunamadı." });
    }

    res.json(countries);
  } catch (error) {
    console.error('Error fetching income data:', error);
    res.status(500).json({ message: error.message });
  }
});



app.get('/countries/find-by-name', async (req, res) => {
  const { name, years } = req.query;

  if (!name) {
    return res.status(400).json({ message: "Ülke adı gereklidir." });
  }

  try {
    console.log("Gelen Yıllar:", years);

    // Gelen yılları işle
    let yearArray = [];
    if (years) {
      yearArray = years.split(',').map(year => {
        const date = new Date(year); // Tarihi `Date` formatına çevir
        if (isNaN(date.getTime())) {
          throw new Error(`Geçersiz tarih formatı: ${year}`);
        }
        return date; // Doğru şekilde tarih arrayine ekle
      });
    }

    // Sorguyu oluştur
    const query = {
      country: { $regex: new RegExp(`^${name}$`, 'i') } // Büyük/küçük harf duyarsız
    };

    if (yearArray.length > 0) {
      query.date = { $in: yearArray }; // Tarih sorgusunu ekle
    }

    console.log("Oluşturulan Sorgu:", query);

    const countries = await Country.find(query).sort({ date: -1 });

    if (countries.length > 0) {
      res.json(countries);
    } else {
      res.status(404).json({ message: "Veri bulunamadı." });
    }
  } catch (error) {
    console.error('Error fetching data by name and years:', error);
    res.status(500).json({ message: error.message });
  }
});

// Tüm statik dosyaları (CSS, JS, görüntüler vb.) servis etmek için middleware
app.use(express.static(frontendPath));

// Belirli bir dizini ayrı olarak servis etmek isterseniz, özel bir rota tanımlayabilirsiniz
app.use('/cssFiles', express.static(path.join(frontendPath, 'cssFiles')));

// Tüm bilinmeyen rotalar için index.html döndürme
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      console.error('Hata: index.html dosyası yüklenemedi.', err);
      res.status(500).send('Sunucu hatası.');
    }
  });
});

// Sunucuyu başlatmak için port belirleme
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
