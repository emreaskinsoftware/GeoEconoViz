/**
 * Gösterge kayıtları.
 *
 * Kodlar Dünya Bankası'nın resmî gösterge kimlikleridir. Projenin ilk hâlinde
 * ikisi yanlıştı ve bu sessizce yanlış sayı üretiyordu:
 *   FP.CPI.TOTL     -> TÜFE endeks seviyesi (2010 = 100), enflasyon oranı değil.
 *                      Doğrusu FP.CPI.TOTL.ZG (yıllık % değişim).
 *   SH.DYN.MORT     -> 5 yaş altı ölüm hızı, bebek ölüm hızı değil.
 *                      Doğrusu SP.DYN.IMRT.IN.
 *
 * `tone` renk rampasını seçer. Rampanın sıcak ucu her zaman yüksek değeri
 * gösterir; bu yüzden "yüksek olması kötü" göstergeler `risk` rampasını alır ve
 * sıcak uç kendiliğinden uyarı rengi olur.
 */

export const RAMPS = {
  // Refah: derin deniz yeşilinden ışıklı limona
  prosperity: {
    stops: ['#08313a', '#0e6b72', '#1fa88e', '#6fd68a', '#d9f27e'],
    key: '#1fa88e',
  },
  // Risk: mürdüm eriğinden közlenmiş kehribara
  risk: {
    stops: ['#2b1035', '#6b1548', '#b32b4c', '#e3663c', '#f7c24b'],
    key: '#e3663c',
  },
  // Yansız: gece çividisinden orkideye — "iyi/kötü" yargısı taşımaz
  neutral: {
    stops: ['#101c3d', '#33409e', '#6e5bc6', '#a87fd6', '#e3b7e0'],
    key: '#6e5bc6',
  },
};

/** Sayı biçimleyicileri — hepsi Türkçe yerel ayarla. */
const nf = (opts) => new Intl.NumberFormat('tr-TR', opts);
const f0 = nf({ maximumFractionDigits: 0 });
const f1 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Dar sütunlar için kısa para gösterimi.
 *
 * Intl'in `notation: 'compact'` çıktısı burada kullanılamaz: Türkçede kısaltma
 * "B" *bin* demektir, İngilizcedeki "B" (billion) değil. Kısaltmaları elle
 * çevirmeye kalkmak sayıyı bir milyon katına çıkarıyordu — bu yüzden birim
 * açıkça yazılıyor.
 */
const fUsdShort = (v) =>
  Math.abs(v) >= 10000 ? `${f0.format(v / 1000)} bin` : f0.format(v);

export const INDICATORS = [
  {
    id: 'gdppc',
    code: 'NY.GDP.PCAP.CD',
    name: 'Kişi başına gelir',
    long: 'Kişi başına gayrisafi yurt içi hasıla',
    unit: 'ABD doları',
    short: '$',
    tone: 'prosperity',
    format: (v) => f0.format(v) + ' $',
    formatShort: fUsdShort,
  },
  {
    id: 'life',
    code: 'SP.DYN.LE00.IN',
    name: 'Yaşam süresi',
    long: 'Doğumda beklenen yaşam süresi',
    unit: 'yıl',
    short: 'yıl',
    tone: 'prosperity',
    format: (v) => f1.format(v) + ' yıl',
    formatShort: (v) => f1.format(v),
  },
  {
    id: 'inflation',
    code: 'FP.CPI.TOTL.ZG',
    name: 'Enflasyon',
    long: 'Tüketici fiyatlarında yıllık değişim',
    unit: '% / yıl',
    short: '%',
    tone: 'risk',
    format: (v) => f1.format(v) + ' %',
    formatShort: (v) => f1.format(v),
  },
  {
    id: 'unemployment',
    code: 'SL.UEM.TOTL.ZS',
    name: 'İşsizlik',
    long: 'İşsizlik oranı, toplam işgücünün payı',
    unit: '% işgücü',
    short: '%',
    tone: 'risk',
    format: (v) => f1.format(v) + ' %',
    formatShort: (v) => f1.format(v),
  },
  {
    id: 'infant',
    code: 'SP.DYN.IMRT.IN',
    name: 'Bebek ölüm hızı',
    long: 'Bir yaşına gelmeden ölen bebek sayısı',
    unit: '1.000 doğumda',
    short: '‰',
    tone: 'risk',
    format: (v) => f1.format(v) + ' ‰',
    formatShort: (v) => f1.format(v),
  },
  {
    id: 'suicide',
    code: 'SH.STA.SUIC.P5',
    name: 'İntihar hızı',
    long: 'Yaşa göre düzeltilmiş intihar hızı',
    unit: '100.000 kişide',
    short: '/100b',
    tone: 'risk',
    format: (v) => f1.format(v),
    formatShort: (v) => f1.format(v),
  },
  {
    id: 'birth',
    code: 'SP.DYN.CBRT.IN',
    name: 'Doğum hızı',
    long: 'Kaba doğum hızı',
    unit: '1.000 kişide',
    short: '‰',
    tone: 'neutral',
    format: (v) => f1.format(v) + ' ‰',
    formatShort: (v) => f1.format(v),
  },
  {
    id: 'health',
    code: 'SH.XPD.CHEX.GD.ZS',
    name: 'Sağlık harcaması',
    long: 'Cari sağlık harcamasının GSYİH içindeki payı',
    unit: '% GSYİH',
    short: '%',
    tone: 'prosperity',
    format: (v) => f1.format(v) + ' %',
    formatShort: (v) => f1.format(v),
  },
  {
    id: 'school',
    code: 'SE.PRM.ENRR',
    name: 'İlkokul kayıt oranı',
    long: 'İlkokul brüt okullaşma oranı',
    unit: '% brüt',
    short: '%',
    tone: 'prosperity',
    format: (v) => f0.format(v) + ' %',
    formatShort: (v) => f0.format(v),
  },
];

export const BY_ID = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));

export const DEFAULT_INDICATOR = 'gdppc';

/** Sorgulanan yıl aralığı. Alt sınır çoğu göstergenin makul kapsamda olduğu yer. */
export const YEAR_MIN = 1990;
export const YEAR_MAX = new Date().getUTCFullYear();
