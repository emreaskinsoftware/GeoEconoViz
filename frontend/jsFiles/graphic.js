// İlk tabloyu kişi başına gelire göre sıralayıp doldurma
function loadIncomeTable() {
    // API'den veriyi çek
    fetch(`https://geoeconoviz-1.onrender.com/countries/income`)
        .then(response => {
            if (!response.ok) {
                throw new Error("Veri çekme işlemi başarısız oldu.");
            }
            return response.json();
        })
        .then(countries => {
            const incomeTableBody = document.getElementById('incomeTableBody');
            incomeTableBody.innerHTML = ''; // Tabloyu sıfırla

            // Gelen veriyi kişi başına gelire göre sıralayın
            const sortedCountries = [...countries].sort((a, b) => (b.kisiBasiGsyih || 0) - (a.kisiBasiGsyih || 0));

            // Her ülke için tabloya satır ekleyin
            sortedCountries.forEach((country, index) => {
                const row = `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${country.country}</td>
                        <td>${country.kisiBasiGsyih ? country.kisiBasiGsyih.toFixed(2) : "Veri yok"}</td>
                    </tr>
                `;
                incomeTableBody.innerHTML += row; // Tablonun gövdesine satır ekle
            });
        })
        .catch(error => {
            console.error('API isteğinde hata:', error);
        });
}


// Checkbox'ların seçimini dinle
const checkboxes = document.querySelectorAll('.form-check-input');
checkboxes.forEach((checkbox, index) => {
    checkbox.addEventListener('change', function() {
        const selectedMetrics = [];
        checkboxes.forEach((cb, i) => {
            if (cb.checked) {
                selectedMetrics.push(i); // Seçilen metriklerin index'lerini tut
            }
        });
        updateMetricTable(selectedMetrics); // Metrik tablosunu güncelle
    });
});

function updateMetricTable(selectedMetrics, year, countryName) {
    const metricTableContainer = document.getElementById('metricTableContainer');
    const metricTableHead = document.getElementById('metricTableHead');
    const metricTableBody = document.getElementById('metricTableBody');

    // Eğer hiçbir metrik seçilmemişse tabloyu gizle
    if (selectedMetrics.length === 0) {
        metricTableContainer.style.display = 'none';
        return;
    }

    // Tabloyu göster ve başlıkları güncelle
    metricTableContainer.style.display = 'inline-block';
    metricTableHead.innerHTML = '<th>Ülke</th><th>Tarih</th>';

    // Metrik eşlemeleri
    const metricMapping = {
        enflasyonOrani: "Enflasyon Oranı (%)",
        dogumOrani: "Doğum Oranı (1000 Kişi Başına)",
        bebekOlumOrani: "Bebek Ölüm Oranı (1000 Canlı Doğum Başına)",
        saglikHarcamalari: "Sağlık Harcamaları (% GSYİH)",
        yasamSuresi: "Doğumda Beklenen Yaşam Süresi (yıl)",
        ilkokulKayitOrani: "İlkokul Kaydı Oranı (%)",
        isizlikOrani: "İşsizlik Oranı (%)",
        kisiBasiGsyih: "Kişi Başına GSYİH (ABD Doları)",
        İntiharOrani: "İntiharOrani"
    };

    // Metriklerin kısa ve uzun adları
    const metrics = [
        { key: 'enflasyonOrani', short: 'Enf(%)', full: 'Enflasyon Oranı' },
        { key: 'dogumOrani', short: 'Doğ(‰)', full: 'Doğum Oranı' },
        { key: 'bebekOlumOrani', short: 'Beb(‰)', full: 'Bebek Ölüm Oranı' },
        { key: 'saglikHarcamalari', short: 'Sağ(% GSYİH)', full: 'Sağlık Harcamaları' },
        { key: 'yasamSuresi', short: 'Yaş(yıl)', full: 'Yaşam Süresi' },
        { key: 'ilkokulKayitOrani', short: 'İlk(%)', full: 'İlkokul Kayıt Oranı' },
        { key: 'isizlikOrani', short: 'İşs(%)', full: 'İşsizlik Oranı' },
        { key: 'kisiBasiGsyih', short: 'GSYİH(ABD Doları)', full: 'Kişi Başına Gelir' },
        { key: 'İntiharOrani', short: 'İnt(%)', full: 'İntihar Oranı' }
    ];

    // Tablo başlıklarına seçilen metrikleri ekle
    selectedMetrics.forEach(metricIndex => {
        metricTableHead.innerHTML += `<th>${metrics[metricIndex].short}</th>`;
    });

    // İstek URL'sini oluştur ve seçilen metrikleri query parametrelerine ekle
    const metricsQuery = selectedMetrics.map(i => metrics[i].key).join(',');
    const url = `https://geoeconoviz-1.onrender.com/countries?year=${year || ''}&countryName=${countryName || ''}&metrics=${metricsQuery}`;

    // API'den veriyi çek
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Veri bulunamadı.');
            }
            return response.json();
        })
        .then(countries => {
            if (!countries || countries.length === 0) {
                console.error('Veri bulunamadı.');
                return;
            }

            metricTableBody.innerHTML = ''; // Tablo gövdesini temizle

            // Her ülke için seçilen metrikleri tabloya ekle
            countries.forEach(country => {
                const row = [
                    `<td>${country.country}</td>`,
                    `<td>${new Date(country.date).toLocaleDateString()}</td>`
                ];

                selectedMetrics.forEach(metricIndex => {
                    const metricKey = metrics[metricIndex].key;
                    const value = country[metricMapping[metricKey]] !== undefined
                        ? country[metricMapping[metricKey]]
                        : "Veri yok";
                    row.push(`<td>${value}</td>`);
                });

                metricTableBody.innerHTML += `<tr>${row.join('')}</tr>`;
            });
        })
        .catch(error => {
            console.error('API isteğinde hata:', error);
        });
}
let countries = []; // Ülke isimlerini saklamak için bir dizi




// Sayfa yüklendiğinde ilk tabloyu göster
loadIncomeTable();






