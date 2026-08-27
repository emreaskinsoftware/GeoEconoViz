/**
 * Cesium küresi.
 *
 * Küre artık sayfanın arkasında değil, ızgaranın ortasında sınırlı bir plaka:
 * basılı bir atlastaki şekil penceresi gibi. Çevresi uzay (koyu plaka), içi
 * gölgeli kabartma haritası, üstü de göstergeye göre boyanmış ülkeler.
 *
 * Uydu görüntüsü katmanı için Cesium Ion anahtarı gerekmiyor: kabartma dokusu
 * Cesium'un kendi paketiyle geliyor.
 *
 * Ülke bulma işi tamamen GPU'ya bırakıldı (scene.pick). Projenin ilk hâli her
 * fare hareketinde 180 çokgende ışın atma yapıyor ve küre takılıyordu.
 */

const GEOJSON_URL = './data/countries.geo.json';

/** GeoJSON kimliği ile Dünya Bankası kodunun ayrıldığı tek yer. */
const ISO_ALIAS = { 'CS-KM': 'XKX' };

const PLATE = '#101410';        // kürenin çevresi: uzay
const OCEAN_FLAT = '#ccd6d9';   // kabartma kapalıyken kağıt haritası okyanusu
const BORDER = 'rgba(27, 33, 25, 0.45)';
const NO_DATA = '#b9beb3';

/** Çokgenler yüzeyden bu kadar yükseğe çizilir; küre ölçeğinde görünmez ama
 *  derinlik çakışmasını (z-fighting) tamamen bitirir. */
const LIFT = 12000;

export async function createGlobe(container, handlers = {}) {
  const Cesium = window.Cesium;
  if (!Cesium) throw new Error('CesiumJS yüklenemedi');

  // Ion varlığı istemiyoruz; kütüphanenin yerleşik jetonunu boşaltıyoruz
  // ki kazara bir istek çıkmasın.
  Cesium.Ion.defaultAccessToken = '';

  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    geocoder: false,                  // Ion geocoder'ı kapat
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    animation: false,
    timeline: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: false,
    // Cesium varsayılanı yüksek yoğunluklu ekranlarda 1x çizer; küre sınırlı bir
    // plaka içinde olduğu için tam çözünürlük ucuz ve sınırlar belirgin çıkıyor.
    useBrowserRecommendedResolution: false,
    contextOptions: { webgl: { powerPreference: 'high-performance' } },
  });

  const { scene, camera } = viewer;
  scene.backgroundColor = Cesium.Color.fromCssColorString(PLATE);
  scene.globe.baseColor = Cesium.Color.fromCssColorString(OCEAN_FLAT);
  scene.globe.showGroundAtmosphere = true;
  scene.globe.enableLighting = false;      // gece yarısı yarımküresi okunmuyordu
  scene.skyBox.show = false;               // basılı şekilde yıldız alanı olmaz
  scene.skyAtmosphere.brightnessShift = -0.15;
  scene.skyAtmosphere.saturationShift = -0.3;
  scene.fog.enabled = false;
  scene.highDynamicRange = false;
  scene.screenSpaceCameraController.enableTilt = false;   // küre hep dik dursun
  scene.screenSpaceCameraController.minimumZoomDistance = 1.2e6;
  scene.screenSpaceCameraController.maximumZoomDistance = 4.2e7;

  // Kredi konteyneri lisans gereği durur, sadece küçültülür.
  viewer.cesiumWidget.creditContainer.classList.add('cesium-widget-credits');

  /* ---------------------------------------------------------------------
     Kabartma dokusu

     Cesium her sürümünde Natural Earth II kabartma ve batimetri döşemelerini
     kendi paketiyle getiriyor: gerçek kıtalar, çöller, buzullar, okyanus
     derinliği. Ion anahtarı, dış servis ya da depoya eklenecek görsel yok.

     Doygunluk düşürülüp parlaklık yükseltiliyor: basılı atlaslardaki gölgeli
     kabartma zemini gibi geride dursun, mürekkep öne çıksın.
     --------------------------------------------------------------------- */

  let relief = null;
  try {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
    );
    relief = new Cesium.ImageryLayer(provider);
    relief.brightness = 1.12;
    relief.saturation = 0.34;
    relief.contrast = 1.04;
    viewer.imageryLayers.add(relief);
  } catch {
    relief = null;     // doku alınamazsa küre düz kalır, uygulama çalışır
  }

  /* ---------------------------------------------------------------------
     Kapsayıcı boyutu

     Cesium yalnızca pencere yeniden boyutlanınca kendini ölçüyor. Küre artık
     ızgara içinde sınırlı bir kutu olduğu için (çekmece açılması, panel
     genişliği değişmesi) pencere değişmeden de boyutu değişebiliyor.
     --------------------------------------------------------------------- */

  const ro = new ResizeObserver(() => viewer.resize());
  ro.observe(container);

  /* ---------------------------------------------------------------------
     Ülke çokgenleri
     --------------------------------------------------------------------- */

  const source = await Cesium.GeoJsonDataSource.load(GEOJSON_URL, { clampToGround: false });
  viewer.dataSources.add(source);

  const borderColor = Cesium.Color.fromCssColorString(BORDER);
  const selectedColor = Cesium.Color.fromCssColorString('#0d100c');
  // Karşılaştırma kalemi — tokens.css'teki --compare ile aynı mavi
  const compareColor = Cesium.Color.fromCssColorString('#2f4b74');
  const noData = Cesium.Color.fromCssColorString(NO_DATA);

  /** ISO3 -> { entities: [...], name } */
  const countries = new Map();

  for (const entity of source.entities.values) {
    if (!entity.polygon) continue;

    // Cesium yinelenen kimlikleri "_1" ekleyerek ayırır; kökü geri alıyoruz.
    const rawId = String(entity.id).split('_')[0];
    const iso3 = ISO_ALIAS[rawId] || rawId;

    // Her çokgenin kendi değiştirilebilir rengi var. CallbackProperty bu nesneyi
    // her karede okuyor, biz de yerinde güncelliyoruz: kare başına tek bir tahsis
    // bile yapılmıyor.
    const color = Cesium.Color.fromCssColorString(NO_DATA);
    entity._tint = color;
    entity._iso3 = iso3;

    entity.polygon.material = new Cesium.ColorMaterialProperty(
      new Cesium.CallbackProperty(() => color, false)
    );
    entity.polygon.height = LIFT;
    entity.polygon.outline = true;
    entity.polygon.outlineColor = borderColor;
    entity.polygon.outlineWidth = 1;
    entity.polygon.arcType = Cesium.ArcType.GEODESIC;

    const record = countries.get(iso3);
    if (record) record.entities.push(entity);
    else countries.set(iso3, { entities: [entity], name: entity.name || iso3 });
  }

  /* ---------------------------------------------------------------------
     Boyama
     --------------------------------------------------------------------- */

  const target = new Map();       // iso3 -> Cesium.Color (hedef)
  let tween = null;
  let lastColorFor = null;        // katman açılıp kapanınca yeniden boyamak için
  let selected = null;
  let compared = null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Kabartma açıkken çokgenler saydamlaşır ki arazi görünsün; kapalıyken
     tam opak olurlar, çünkü altta okunacak bir şey kalmaz.

     İşaretli ülkeler her hâlükârda tam opak: Cesium'un çizgi kalınlığı çoğu
     platformda 1 pikselle sınırlı olduğu için seçimi asıl belli eden şey
     kenarlık değil, komşularından ayrışan doluluk. */
  const marked = (iso3) => iso3 !== null && (iso3 === selected || iso3 === compared);
  const dataAlpha = (iso3) => (marked(iso3) ? 1 : (relief && relief.show ? 0.78 : 1));
  const nullAlpha = (iso3) => (marked(iso3) ? 0.9 : (relief && relief.show ? 0.25 : 1));

  /**
   * @param {(iso3: string) => string|null} colorFor css rengi ya da veri yoksa null
   * @param {number} duration ms
   */
  function paint(colorFor, duration = 520) {
    lastColorFor = colorFor;
    for (const [iso3] of countries) {
      const css = colorFor(iso3);
      const color = css ? Cesium.Color.fromCssColorString(css) : Cesium.Color.clone(noData);
      color.alpha = css ? dataAlpha(iso3) : nullAlpha(iso3);
      target.set(iso3, color);
    }

    if (tween) cancelAnimationFrame(tween);

    // Sekme arka plandayken kare döngüsü durur; geçişi beklemek yerine
    // hedef renkleri doğrudan yazıyoruz ki küre eski renkte kalmasın.
    const hidden = document.visibilityState !== 'visible';

    if (reduceMotion || hidden || duration <= 0) {
      for (const [iso3, record] of countries) {
        const to = target.get(iso3);
        for (const e of record.entities) Cesium.Color.clone(to, e._tint);
      }
      scene.requestRender();
      return;
    }

    const from = new Map();
    for (const [iso3, record] of countries) {
      from.set(iso3, Cesium.Color.clone(record.entities[0]._tint, new Cesium.Color()));
    }

    const start = performance.now();
    const step = (now) => {
      const raw = Math.min(1, (now - start) / duration);
      const t = 1 - Math.pow(1 - raw, 3);          // ease-out cubic

      for (const [iso3, record] of countries) {
        const a = from.get(iso3);
        const b = target.get(iso3);
        for (const e of record.entities) {
          e._tint.red = a.red + (b.red - a.red) * t;
          e._tint.green = a.green + (b.green - a.green) * t;
          e._tint.blue = a.blue + (b.blue - a.blue) * t;
          e._tint.alpha = a.alpha + (b.alpha - a.alpha) * t;
        }
      }
      scene.requestRender();
      tween = raw < 1 ? requestAnimationFrame(step) : null;
    };
    tween = requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------------
     Seçim
     --------------------------------------------------------------------- */

  function setOutline(iso3, color, width) {
    const record = countries.get(iso3);
    if (!record) return;
    for (const e of record.entities) {
      e.polygon.outlineColor = color;
      e.polygon.outlineWidth = width;
    }
  }

  /** Tek bir ülkenin saydamlığını yeniden hesapla (tüm küreyi boyamadan). */
  function refreshAlpha(iso3) {
    const record = countries.get(iso3);
    if (!record || !lastColorFor) return;
    const css = lastColorFor(iso3);
    for (const e of record.entities) {
      e._tint.alpha = css ? dataAlpha(iso3) : nullAlpha(iso3);
    }
  }

  /**
   * Bir ülkenin çizgisini ve saydamlığını, o an taşıdığı role göre yeniden yaz.
   * İki işaret aynı ülkeye denk gelebildiği için "eskiyi sıfırla" demek yetmez:
   * seçim kalkarken ülke hâlâ karşılaştırma çifti olabilir.
   */
  function restoreMark(iso3) {
    if (!iso3) return;
    if (iso3 === selected) setOutline(iso3, selectedColor, 2);
    else if (iso3 === compared) setOutline(iso3, compareColor, 2);
    else setOutline(iso3, borderColor, 1);
    refreshAlpha(iso3);
  }

  function select(iso3) {
    if (selected === iso3) return;
    const previous = selected;
    selected = iso3;
    restoreMark(previous);
    restoreMark(iso3);
    scene.requestRender();
  }

  /** Karşılaştırma çifti — ikinci kalemle çizilmiş gibi ayrı bir çizgi rengi. */
  function setCompare(iso3) {
    if (compared === iso3) return;
    const previous = compared;
    compared = iso3;
    restoreMark(previous);
    restoreMark(iso3);
    scene.requestRender();
  }

  /* ---------------------------------------------------------------------
     İşaretleme — GPU seçimi
     --------------------------------------------------------------------- */

  const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
  let hovered = null;

  function pickIso(position) {
    const picked = scene.pick(position);
    const entity = picked && picked.id;
    return entity && entity._iso3 ? entity._iso3 : null;
  }

  handler.setInputAction((movement) => {
    const iso3 = pickIso(movement.endPosition);
    if (iso3 !== hovered) {
      hovered = iso3;
      scene.canvas.style.cursor = iso3 ? 'pointer' : 'grab';
      handlers.onHover?.(iso3, movement.endPosition);
    } else if (iso3) {
      handlers.onHoverMove?.(movement.endPosition);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((click) => {
    const iso3 = pickIso(click.position);
    if (iso3) handlers.onSelect?.(iso3);
    else handlers.onDismiss?.();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  /* ---------------------------------------------------------------------
     Boştaki dönüş
     Eski sürüm setInterval ile ve yanlış eksende (UNIT_Y) döndürüyordu; bu hem
     kare hızından bağımsızdı hem de küreyi takla attırıyordu. Artık gerçek
     dünya ekseninde (UNIT_Z), geçen süreye göre.
     --------------------------------------------------------------------- */

  let spinning = false;
  let held = false;             // ülke seçiliyken dönüş kendiliğinden başlamaz
  let idleTimer = null;
  let lastTick = 0;
  const IDLE_DELAY = 3500;
  const SPIN_RATE = 0.055;      // radyan / saniye ≈ tam tur 114 saniye

  scene.preRender.addEventListener(() => {
    if (!spinning) { lastTick = 0; return; }

    // Duvar saati kullanılıyor. Önceki sürüm Cesium'un simülasyon saatini
    // okuyordu; `shouldAnimate: false` olduğu için o saat hiç ilerlemiyor ve
    // her karede geçen süre sıfır çıkıyordu — dönüş kodu vardı ama ölüydü.
    const now = performance.now();
    if (lastTick) {
      // Sekme arka plandan dönünce küre birden fırlamasın
      const dt = Math.min(100, now - lastTick);
      camera.rotate(Cesium.Cartesian3.UNIT_Z, -SPIN_RATE * dt / 1000);
    }
    lastTick = now;
    scene.requestRender();
  });

  function startSpin() { if (!reduceMotion && !held) spinning = true; }
  function stopSpin() { spinning = false; lastTick = 0; }

  function noteInteraction() {
    stopSpin();
    clearTimeout(idleTimer);
    if (!held) idleTimer = setTimeout(startSpin, IDLE_DELAY);
  }

  /** Bir ülke seçiliyken küre kendiliğinden dönüp ondan uzaklaşmasın. */
  function holdSpin(on) {
    held = Boolean(on);
    if (held) { stopSpin(); clearTimeout(idleTimer); }
    else noteInteraction();
  }

  for (const evt of ['pointerdown', 'wheel', 'touchstart', 'keydown']) {
    scene.canvas.addEventListener(evt, noteInteraction, { passive: true });
  }

  /* ---------------------------------------------------------------------
     Kamera
     --------------------------------------------------------------------- */

  function flyTo(lon, lat, { height = 9.5e6, duration = 1.4 } = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    noteInteraction();
    camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      duration: reduceMotion ? 0 : duration,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    });
  }

  /** Açılış: uzaktan gelip yerine oturur. */
  function introFlight() {
    if (reduceMotion) {
      camera.setView({ destination: Cesium.Cartesian3.fromDegrees(20, 25, 2.0e7) });
      startSpin();
      return Promise.resolve();
    }
    camera.setView({ destination: Cesium.Cartesian3.fromDegrees(20, 25, 5.6e7) });
    return new Promise((resolve) => {
      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(20, 25, 2.0e7),
        duration: 2.0,
        easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
        complete: () => { startSpin(); resolve(); },
      });
    });
  }

  /**
   * Kabartma dokusunu aç/kapat.
   * @returns {boolean} yeni durum
   */
  function setRealistic(on) {
    if (!relief) return false;
    relief.show = Boolean(on);
    if (lastColorFor) paint(lastColorFor, 260);   // saydamlık değişti
    scene.requestRender();
    return relief.show;
  }

  return {
    viewer,
    countries,
    paint,
    select,
    setCompare,
    flyTo,
    introFlight,
    stopSpin,
    startSpin,
    holdSpin,
    noteInteraction,
    setRealistic,
    get realistic() { return Boolean(relief && relief.show); },
    get hasRelief() { return Boolean(relief); },
    /** Kürede çokgeni olan ülkeler — sıralamanın kürede karşılığı olsun diye. */
    hasPolygon: (iso3) => countries.has(iso3),
    destroy() { ro.disconnect(); handler.destroy(); viewer.destroy(); },
  };
}
