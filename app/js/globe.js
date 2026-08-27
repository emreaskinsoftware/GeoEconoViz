/**
 * Cesium küresi.
 *
 * Uydu görüntüsü katmanı yok: bu yüzden Cesium Ion anahtarı, aylık kota ve
 * döşeme trafiği de yok. Küre düz koyu bir okyanus, ülkeler ise yerel GeoJSON'dan
 * çizilip seçili göstergeye göre boyanan çokgenler. Görsel olarak bir veri
 * küresi zaten böyle görünmeli.
 *
 * Ülke bulma işi tamamen GPU'ya bırakıldı (scene.pick). Projenin ilk hâli her
 * fare hareketinde 180 çokgende ışın atma yapıyor ve küre takılıyordu.
 */

const GEOJSON_URL = './data/countries.geo.json';

/** GeoJSON kimliği ile Dünya Bankası kodunun ayrıldığı tek yer. */
const ISO_ALIAS = { 'CS-KM': 'XKX' };

const OCEAN = '#0a1526';
const BORDER = 'rgba(140,170,210,0.30)';
const NO_DATA = '#202d44';

/** Çokgenler yüzeyden bu kadar yükseğe çizilir; küre ölçeğinde görünmez ama
 *  derinlik çakışmasını (z-fighting) tamamen bitirir. */
const LIFT = 12000;

export async function createGlobe(container, handlers = {}) {
  const Cesium = window.Cesium;
  if (!Cesium) throw new Error('CesiumJS yüklenemedi');

  // Ion varlığı istemiyoruz; yine de kütüphanenin yerleşik jetonunu boşaltıyoruz
  // ki kazara bir istek çıkmasın.
  Cesium.Ion.defaultAccessToken = '';

  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,                 // görüntü katmanı yok -> anahtar gerekmez
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
    contextOptions: { webgl: { alpha: false, powerPreference: 'high-performance' } },
  });

  const { scene, camera } = viewer;
  scene.globe.baseColor = Cesium.Color.fromCssColorString(OCEAN);
  scene.globe.showGroundAtmosphere = true;
  scene.globe.enableLighting = false;      // gece yarısı yarımküresi okunmuyordu
  scene.skyAtmosphere.hueShift = -0.06;
  scene.skyAtmosphere.saturationShift = 0.1;
  scene.skyAtmosphere.brightnessShift = -0.1;
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
     kendi paketiyle birlikte getiriyor. Yani gerçek kıtalar, çöller, buzullar
     ve okyanus derinliği için Ion anahtarına, dış servise ya da depoya
     eklenecek bir görsele gerek yok — Cesium'un yüklendiği yerden geliyor.

     Ülke çokgenleri bunun üzerine yarı saydam biniyor: renk okunaklı kalıyor,
     altındaki arazi dokusu görünüyor. Veri odaklı düz görünüm isteyen için
     katman kapatılabiliyor.
     --------------------------------------------------------------------- */

  let relief = null;
  try {
    const provider = await Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
    );
    relief = new Cesium.ImageryLayer(provider);
    // Arazi geri planda dursun, veri öne çıksın
    relief.brightness = 0.62;
    relief.saturation = 0.55;
    relief.contrast = 1.08;
    viewer.imageryLayers.add(relief);
  } catch {
    relief = null;     // doku alınamazsa küre düz koyu kalır, uygulama çalışır
  }

  /* ---------------------------------------------------------------------
     Ülke çokgenleri
     --------------------------------------------------------------------- */

  const source = await Cesium.GeoJsonDataSource.load(GEOJSON_URL, {
    clampToGround: false,
  });
  viewer.dataSources.add(source);

  const borderColor = Cesium.Color.fromCssColorString(BORDER);
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
     Boyama — eski renkten yeni renge yumuşak geçiş
     --------------------------------------------------------------------- */

  const target = new Map();       // iso3 -> Cesium.Color (hedef)
  let tween = null;
  let lastColorFor = null;        // katman açılıp kapanınca yeniden boyamak için

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Kabartma açıkken çokgenler saydamlaşır ki arazi görünsün; kapalıyken
     tam opak olurlar, çünkü altta okunacak bir şey kalmaz. */
  const dataAlpha = () => (relief && relief.show ? 0.82 : 1);
  const nullAlpha = () => (relief && relief.show ? 0.3 : 1);

  /**
   * @param {(iso3: string) => string|null} colorFor css rengi ya da veri yoksa null
   * @param {number} duration ms
   */
  function paint(colorFor, duration = 520) {
    lastColorFor = colorFor;
    for (const [iso3] of countries) {
      const css = colorFor(iso3);
      const color = css ? Cesium.Color.fromCssColorString(css) : Cesium.Color.clone(noData);
      color.alpha = css ? dataAlpha() : nullAlpha();
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

    // Başlangıç renklerini sakla
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
     Seçim vurgusu
     --------------------------------------------------------------------- */

  const selectedColor = Cesium.Color.fromCssColorString('#e0bb3b');
  let selected = null;

  function setOutline(iso3, color, width) {
    const record = countries.get(iso3);
    if (!record) return;
    for (const e of record.entities) {
      e.polygon.outlineColor = color;
      e.polygon.outlineWidth = width;
    }
  }

  function select(iso3) {
    if (selected === iso3) return;
    if (selected) setOutline(selected, borderColor, 1);
    selected = iso3;
    if (iso3) setOutline(iso3, selectedColor, 2);
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
  let idleTimer = null;
  let lastTick = 0;
  const IDLE_DELAY = 4500;
  const SPIN_RATE = 0.028;      // radyan / saniye

  scene.preRender.addEventListener((_, time) => {
    if (!spinning) { lastTick = 0; return; }
    const ms = Cesium.JulianDate.toDate(time).getTime();
    if (lastTick) camera.rotate(Cesium.Cartesian3.UNIT_Z, -SPIN_RATE * (ms - lastTick) / 1000);
    lastTick = ms;
    scene.requestRender();
  });

  function startSpin() { if (!reduceMotion) spinning = true; }
  function stopSpin() { spinning = false; lastTick = 0; }

  function noteInteraction() {
    stopSpin();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(startSpin, IDLE_DELAY);
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
    camera.setView({ destination: Cesium.Cartesian3.fromDegrees(20, 25, 6.4e7) });
    return new Promise((resolve) => {
      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(20, 25, 2.0e7),
        duration: 2.2,
        easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
        complete: () => { startSpin(); resolve(); },
      });
    });
  }

  /**
   * Kabartma dokusunu aç/kapat. Açıkken küre gerçek bir Dünya gibi görünür,
   * kapalıyken renkler tam doygunlukta okunur.
   * @returns {boolean} yeni durum
   */
  function setRealistic(on) {
    if (!relief) return false;
    relief.show = Boolean(on);
    scene.globe.baseColor = Cesium.Color.fromCssColorString(on ? '#000000' : OCEAN);
    // Saydamlık değiştiği için mevcut renkleri yeniden uygula
    if (lastColorFor) paint(lastColorFor, 260);
    scene.requestRender();
    return relief.show;
  }

  return {
    viewer,
    countries,
    paint,
    select,
    flyTo,
    setRealistic,
    get realistic() { return Boolean(relief && relief.show); },
    get hasRelief() { return Boolean(relief); },
    introFlight,
    stopSpin,
    startSpin,
    noteInteraction,
    /** Kürede çokgeni olan ülkeler — sıralamanın kürede karşılığı olsun diye. */
    hasPolygon: (iso3) => countries.has(iso3),
  };
}
