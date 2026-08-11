document.getElementById('year').textContent = new Date().getFullYear();

// --- Procedural oil-painted background (Three.js + GLSL) ---
// Fractal domain-warped noise (Inigo Quilez "warping" technique) painted with
// the Huemint gradient-4 palette (gold / sky-blue / green / blush), with a
// thresholded contour pass so it reads like flowing topographic ridgelines
// and river veins — a nod to the map/GIS theme — rather than a generic
// color gradient. Runs continuously (no source images needed), so it never
// repeats identically and there are no seams to worry about.
//
// createOilShaderCanvas() is reused for two mounts: the gated intro splash
// (#hoverStage) and the persistent site-wide backdrop (#dreamyShaderStage,
// fixed behind every section) — same shader, same palette, so "the style"
// carries through past the Explore click instead of stopping at the cover.
function createOilShaderCanvas(stage, opts) {
  if (!stage || typeof THREE === 'undefined') return null;
  const vignetteStrength = opts && opts.vignette != null ? opts.vignette : 0.12;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: vignetteStrength }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform float uVignette;

      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(dot(hash2(i + vec2(0.0,0.0)), f - vec2(0.0,0.0)),
              dot(hash2(i + vec2(1.0,0.0)), f - vec2(1.0,0.0)), u.x),
          mix(dot(hash2(i + vec2(0.0,1.0)), f - vec2(0.0,1.0)),
              dot(hash2(i + vec2(1.0,1.0)), f - vec2(1.0,1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = rot * p * 2.0 + 3.1;
          a *= 0.5;
        }
        return v;
      }

      // raw fbm output sits roughly in [-0.4, 0.4] — rescale to 0..1 for color mixing
      float norm01(float x) {
        return clamp(x * 1.8 + 0.5, 0.0, 1.0);
      }

      void main() {
        vec2 uv = vUv;
        float aspect = uResolution.x / uResolution.y;
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.4;
        float t = uTime * 0.035;

        // domain warp — same trick used to paint clouds/marble/mountains
        vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t * 0.5), fbm(p + vec2(5.2, 1.3) - t * 0.35));
        vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + 0.15 * t),
                       fbm(p + 3.2 * q + vec2(8.3, 2.8) - 0.12 * t));
        float f = fbm(p + 3.2 * r);

        float f01 = norm01(f);
        float rx01 = norm01(r.x);
        float qy01 = norm01(q.y);

        // thresholded contour bands -> reads like topographic ridgelines / river veins
        float bands = fract(f * 3.0 + r.x * 1.2);
        float contour = abs(bands - 0.5) * 2.0;
        float river = 1.0 - smoothstep(0.0, 0.14, contour);

        // Huemint gradient-4 palette: eecf8b / 8bb4ea / 82d388 / e5d1d7
        vec3 gold  = vec3(0.933, 0.812, 0.545);
        vec3 blue  = vec3(0.545, 0.706, 0.918);
        vec3 green = vec3(0.510, 0.827, 0.533);
        vec3 blush = vec3(0.898, 0.820, 0.843);

        vec3 col = mix(gold, green, smoothstep(0.3, 0.65, f01));
        col = mix(col, blue, smoothstep(0.55, 0.85, rx01));
        // blush kept subtle — narrower band + capped amount so it reads as
        // highlight, not an overall wash across the whole canvas
        float blushAmt = smoothstep(0.8, 0.97, 0.5 * qy01 + 0.5 * f01) * 0.6;
        col = mix(col, blush, blushAmt);
        col = mix(col, blush, river * 0.2);

        // subtle vignette (stronger on the intro so text stays readable,
        // much lighter on the page-wide backdrop)
        float vig = smoothstep(1.1, 0.25, length((uv - 0.5) * vec2(aspect, 1.0)));
        col = mix(col * (1.0 - uVignette), col, vig);

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);

  function resize() {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    uniforms.uResolution.value.set(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  let raf;
  let running = true;
  function tick(now) {
    uniforms.uTime.value = now * 0.001;
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    }
  };
}

// Cover: gated intro splash, slightly stronger vignette to keep the text readable
const introPainting = createOilShaderCanvas(document.getElementById('hoverStage'), { vignette: 0.12 });

// Page-wide backdrop: same shader/palette, fixed behind every section so the
// "oil painting" style carries through past the Explore click, not just the cover
createOilShaderCanvas(document.getElementById('dreamyShaderStage'), { vignette: 0.04 });

// --- Gated intro splash: must click Explore to unlock scrolling ---
const introSplash = document.getElementById('introSplash');
const exploreBtn = document.getElementById('exploreBtn');

function dismissIntro() {
  document.body.classList.remove('intro-locked');
  if (introSplash) introSplash.classList.add('is-dismissed');
  // intro canvas is fully hidden after its fade-out — stop its render loop
  // to save GPU/battery; the page-wide backdrop keeps running independently
  if (introPainting) setTimeout(() => introPainting.stop(), 1000);
}

if (exploreBtn) exploreBtn.addEventListener('click', dismissIntro);

// Escape key also dismisses, for accessibility
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('intro-locked')) dismissIntro();
});

// --- Journey map interactivity (real Leaflet map, real coordinates) ---
// Four real stops pulled from Trinity's actual CV (claude/cv download/Trinity_Pei_GIS.pdf)
// + her own framing of the story: Yangzhou (teaching) and Huai'an (the
// pet-project idea, born on the side during the same stretch) are both in
// Jiangsu and happen concurrently, so they're merged into one stop. Brisbane
// is home base for the whole Master's (the two Brisbane visits — arriving,
// and being back now — are also merged into one stop), with excursions to
// Shanghai (internship) and Beijing (summer school).
// The one real GIS project from the CV (Spatial Data Analysis — Airbnb/STR
// Study, UQ, Mar 2026–Present) is shown on the Brisbane stop.
// Hand-drawn-style line illustrations (stroke/fill = white, sits on the
// gradient card backgrounds) — a little scene per project card, filling the
// whole image slot rather than a small centered glyph. They sit still by
// default and give a playful wiggle/scale on hover (see
// .project-card:hover .card-icon in style.css).
const icons = {
  // Airbnb/STR hotspot analysis — a city block grid with kernel-density
  // rings and a pin, echoing the actual hotspot-mapping work.
  hotspot: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.5" opacity="0.45">
      <rect x="18" y="92" width="24" height="34"/>
      <rect x="48" y="102" width="20" height="24"/>
      <rect x="74" y="80" width="24" height="46"/>
      <rect x="104" y="96" width="20" height="30"/>
    </g>
    <circle cx="152" cy="68" r="34" stroke-width="2" opacity="0.35"/>
    <circle cx="152" cy="68" r="22" stroke-width="2" opacity="0.55"/>
    <circle cx="152" cy="68" r="9" fill="#fff" stroke="none" opacity="0.9"/>
    <path d="M152 44c-9 0-16.5 7.3-16.5 16.5 0 12.4 16.5 30 16.5 30s16.5-17.6 16.5-30c0-9.2-7.5-16.5-16.5-16.5z" stroke-width="2.5"/>
  </svg>`,
  // Pet-tracking app — a phone mockup with a map pin + dotted geofence route
  // on screen, and a paw print beside it.
  paw: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <rect x="122" y="14" width="68" height="120" rx="10" stroke-width="2.5"/>
    <rect x="130" y="25" width="52" height="86" rx="3" stroke-width="1.5" opacity="0.7"/>
    <path d="M156 42c-6.6 0-12 5.4-12 12 0 8.8 12 22 12 22s12-13.2 12-22c0-6.6-5.4-12-12-12z" fill="#fff" stroke="none"/>
    <path d="M140 88c6 6 12-3 18 3s10 7 16 1" stroke-width="1.6" stroke-dasharray="3 4" opacity="0.85"/>
    <g stroke-width="2.2">
      <circle cx="46" cy="96" r="10"/>
      <circle cx="28" cy="78" r="5.6"/>
      <circle cx="46" cy="64" r="5.6"/>
      <circle cx="64" cy="78" r="5.6"/>
    </g>
  </svg>`,
  // Geography teacher — a tiny standing figure (same limb style as the
  // journey timeline's tiny-Trinity) pointing at a chalkboard mountain range.
  teach: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <rect x="118" y="24" width="82" height="58" rx="4" stroke-width="2.5"/>
    <path d="M126 74 L148 40 L163 58 L178 36 L192 74" stroke-width="1.8"/>
    <circle cx="182" cy="38" r="4.5" stroke-width="1.4" opacity="0.85"/>
    <circle cx="55" cy="44" r="9" fill="#fff" stroke="none"/>
    <path d="M55 53 L53 90" stroke-width="4"/>
    <path d="M54 62 L34 73" stroke-width="4"/>
    <path d="M54 62 L100 50" stroke-width="3.2"/>
    <path d="M53 90 L39 129" stroke-width="4.5"/>
    <path d="M53 90 L65 129" stroke-width="4.5"/>
  </svg>`,
  // Bilibili data/commercial ops — an upward trend line over bar chart
  // columns, with a small car for the NEV/automotive audience work.
  data: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="3" opacity="0.55">
      <line x1="30" y1="126" x2="30" y2="86"/>
      <line x1="58" y1="126" x2="58" y2="64"/>
      <line x1="86" y1="126" x2="86" y2="100"/>
      <line x1="114" y1="126" x2="114" y2="48"/>
    </g>
    <path d="M26 92 L56 68 L84 104 L116 42" stroke-width="2.4"/>
    <g transform="translate(148,88)" stroke-width="2.4">
      <path d="M2 20 L7 6 h30 l7 14 h6 v11 H-4 v-11 z"/>
      <circle cx="13" cy="33" r="4.4"/>
      <circle cx="37" cy="33" r="4.4"/>
    </g>
  </svg>`,
  // Placeholder graduation cap for the (still-TBD) Beijing summer school.
  grad: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="M110 46 L167 67 L110 88 L53 67 Z" stroke-width="2.4"/>
    <path d="M80 75 v20 c0 6.5 14 13 30 13 s30 -6.5 30 -13 v-20" stroke-width="2.4"/>
    <line x1="167" y1="67" x2="167" y2="98" stroke-width="2.2"/>
    <circle cx="167" cy="102" r="3.2" fill="#fff" stroke="none"/>
  </svg>`,
  // Remote sensing — a satellite scanning a city block below, with an
  // upward change-detection arrow for the ENDISI/growth-hotspot analysis.
  satellite: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.6" opacity="0.5">
      <rect x="26" y="108" width="26" height="26"/>
      <rect x="56" y="118" width="20" height="16"/>
      <rect x="82" y="98" width="24" height="36"/>
    </g>
    <path d="M148 46 L92 100" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.75"/>
    <path d="M148 46 L58 118" stroke-width="1.4" stroke-dasharray="3 4" opacity="0.5"/>
    <g transform="translate(148,42) rotate(20)" stroke-width="2.2">
      <rect x="-8" y="-6" width="16" height="12" rx="2"/>
      <line x1="-8" y1="-2" x2="-20" y2="-8"/>
      <line x1="-8" y1="2" x2="-20" y2="8"/>
      <line x1="8" y1="-2" x2="20" y2="-8"/>
      <line x1="8" y1="2" x2="20" y2="8"/>
    </g>
    <path d="M172 122 L172 90 M164 98 L172 88 L180 98" stroke-width="2.6"/>
  </svg>`,
  // Public safety / distance-decay — concentric rings fading outward from a
  // central alert pin, echoing the crime-mapping distance-decay method.
  safety: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="110" cy="80" r="52" stroke-width="1.6" opacity="0.28"/>
    <circle cx="110" cy="80" r="35" stroke-width="1.8" opacity="0.45"/>
    <circle cx="110" cy="80" r="19" stroke-width="2" opacity="0.65"/>
    <path d="M110 55c-8.3 0-15 6.7-15 15 0 10.9 15 27 15 27s15-16.1 15-27c0-8.3-6.7-15-15-15z" fill="#fff" stroke="none"/>
    <line x1="110" y1="63" x2="110" y2="73" stroke="#c1693b" stroke-width="2.4"/>
    <circle cx="110" cy="78.5" r="1.7" fill="#c1693b" stroke="none"/>
  </svg>`,
  // No-code app build — a tablet with a checklist (task/care logging) next
  // to a small standing figure (same limb style as tiny-Trinity), for the
  // childcare-management app project.
  childapp: `<svg class="card-icon" viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <rect x="65" y="15" width="90" height="120" rx="10" stroke-width="2.5"/>
    <rect x="73" y="26" width="74" height="86" rx="3" stroke-width="1.5" opacity="0.7"/>
    <line x1="82" y1="42" x2="138" y2="42" stroke-width="2"/>
    <circle cx="82" cy="42" r="2.4" fill="#fff" stroke="none"/>
    <line x1="82" y1="58" x2="138" y2="58" stroke-width="2"/>
    <circle cx="82" cy="58" r="2.4" fill="#fff" stroke="none"/>
    <line x1="82" y1="74" x2="138" y2="74" stroke-width="2"/>
    <circle cx="82" cy="74" r="2.4" fill="#fff" stroke="none"/>
    <circle cx="35" cy="70" r="8" fill="#fff" stroke="none"/>
    <path d="M35 78 L34 100" stroke-width="3.5"/>
    <path d="M34 84 L22 92" stroke-width="3.5"/>
    <path d="M34 84 L46 92" stroke-width="3.5"/>
    <path d="M34 100 L26 122" stroke-width="4"/>
    <path d="M34 100 L42 122" stroke-width="4"/>
  </svg>`
};

// Brisbane is the "home base" stop — shown as a 3-up showcase grid (image on
// top, text below, left to right) rather than the single stacked card other
// stops use, since this is where the real project work gets the spotlight.
// Project 1 has a real screenshot; 2 and 3 are placeholders until their
// content is filled in.
const brisbaneProjects = [
  {
    title: "Spatial Data Analysis: Airbnb / Short-Term Rental Study",
    meta: "University of Queensland · Supervised by Prof. Thomas Siglar · Mar 2026 – Present",
    bullets: [
      "Studied how Gold Coast short-term rentals respond to major events, through supply geography, event structure, and visitor type.",
      "Found that sport, festival, and business events each leave a distinct, measurable footprint on rental demand and pricing.",
      "As the Gold Coast enters a sustained cycle of major-event hosting, including the 2032 Brisbane Olympics, this lens matters most."
    ],
    tags: ["Hotspot Analysis", "Python", "R", "ArcGIS Pro", "QGIS"],
    cardClass: "map-1",
    images: ["assets/pic/gc1.png", "assets/pic/gc2.png"]
  },
  {
    title: "Urban Expansion Mapping: Perth (Burswood Peninsula)",
    meta: "University of Queensland · Nov 2025",
    bullets: [
      "7 years of Landsat + ENDISI traced how Perth quietly grows inward instead of sprawling outward.",
      "Caught a false alarm: a 2018 spike was dry-season glare, not construction; double-checking made it trustworthy.",
      "Real growth (+0.36 km²) clustered in Burswood/Belmont Park, matching Perth's infill policy, verified at 86% accuracy."
    ],
    tags: ["Remote Sensing", "Landsat ARD", "ENDISI", "GMM Classification", "Change Detection"],
    cardClass: "map-2",
    images: ["assets/pic/perth1.png", "assets/pic/perth2.png"],
    link: "https://arcg.is/iaDvX",
    linkText: "🔗 View the interactive StoryMap"
  },
  {
    title: "Mapping Assault Incidents in Fortitude Valley",
    meta: "University of Queensland · Sep 2025",
    bullets: [
      "Mapped 2024 QPS assault & theft data against land use and socio-economic context in Fortitude Valley, Brisbane's nightlife hub.",
      "Found a dual-centre distance-decay pattern: crime clusters sharply around entertainment venues, tapering into residential blocks.",
      "Findings can guide safer nightlife planning (licensing, crowd flow, guardianship) without undermining the precinct's vibrancy."
    ],
    tags: ["Spatial Analysis", "Distance Decay", "Python", "GeoPandas"],
    cardClass: "map-3",
    images: ["assets/pic/crime1.png", "assets/pic/crime2.png"]
  },
  {
    title: "UQKids Childcare Management App",
    meta: "University of Queensland · Oct 2025",
    bullets: [
      "Built a no-code childcare app in Glide, covering child sign-in/out, staff logins, and parent vs carer permissions.",
      "Modelled daily care logging: meals, sleep, toileting, room capacity, so parents see a clear picture of their day.",
      "A fun detour from GIS: turning a formal systems spec into a real, usable no-code product was genuinely enjoyable."
    ],
    tags: ["No-Code", "Glide", "UML", "Product Design"],
    cardClass: "map-1",
    img: "assets/pic/kid-collage.png",
    link: "https://go.glideapps.com/template/VJtc6dZxO1O5gqz6G3rJ-template-published?privateTemplateToken=oldUGxZku8JDIK8UNY0a",
    linkText: "🔗 Try the Glide app"
  }
];

// Yangzhou stop covers two concurrent threads: the day job (teaching) and
// the side project (the pet-tracking app) that first turned an idea into
// something real and spatial.
const yangzhouProjects = [
  {
    title: "Geography Teacher",
    meta: "Yangzhou Middle School · Sep 2022 – Jan 2025",
    bullets: [
      "Two years teaching geography to middle schoolers back home in Yangzhou, Jiangsu.",
      "Built lessons that turned map-reading into a skill students could genuinely use."
    ],
    note: "I loved this job — there's real fulfillment in a kid's smile when something finally clicks, and in watching them progress. But wanting to go deeper into GIS eventually pushed me out of that comfort zone and into study abroad to get there.",
    tags: ["Teaching", "Geography Education"],
    cardClass: "map-2",
    icon: icons.teach
  },
  {
    title: "Internet+ Innovation Competition: Geo-Product Design Lead",
    meta: "Provincial Silver Award, Top 5% of 200+ teams · Jun 2024 – Dec 2024",
    bullets: [
      "Designed a GPS + BeiDou dual-mode positioning app for pet tracking, integrating geofencing alerts and location-based social features informed by 760+ survey responses analysed with AI-assisted clustering.",
      "Built 18 interactive Figma screens; key-path optimisation lifted click-through conversion by 35% in usability testing."
    ],
    tags: ["GPS/BeiDou", "Geofencing", "Figma", "UX Research"],
    cardClass: "map-3",
    icon: icons.paw
  }
];

const shanghaiProjects = [
  {
    title: "Data & Commercial Operations Intern (Automotive)",
    meta: "Bilibili, Shanghai · Nov 2025 – Feb 2026",
    bullets: [
      "Built a data monitoring framework on first-party platform data, delivering 20+ weekly/monthly reports on traffic structure, creative performance and audience-matching.",
      "Applied Python + AI-assisted segmentation to define 10+ NEV client audience profiles (Huawei HIMA, Zeekr, Li Auto), lifting campaign CTR by 15–25%."
    ],
    note: "Watching those numbers move after a segmentation change was genuinely exciting — it's where my interest in using data to actually shape decisions really took hold.",
    tags: ["Python", "Data Monitoring", "Audience Segmentation", "NEV/Automotive"],
    cardClass: "map-1",
    img: "assets/pic/bilibili.png"
  }
];

const beijingProjects = [
  {
    title: "AI & Agricultural Remote Sensing Summer School",
    meta: "China Agricultural University, Beijing · Jul 2026",
    bullets: [
      "Two-week international summer school on AI and agricultural remote sensing, covering spatial causal inference, vegetation monitoring and radiative transfer modeling under Prof. Yelu Zeng's guidance.",
      "Delivered an oral presentation and toured the National Engineering Research Center for Information Technology in Agriculture, exchanging ideas with researchers from around the world."
    ],
    tags: ["Remote Sensing", "AI", "GIS", "Agriculture"],
    cardClass: "map-2",
    img: "assets/pic/summer school.png"
  }
];

const journeyStops = {
  1: {
    city: "Yangzhou, Jiangsu",
    title: "Geography Teacher & the pet-project idea",
    meta: "Yangzhou Middle School · Sep 2022 – Jan 2025",
    desc: "Two years back home in Yangzhou, teaching the next generation to read maps and the world — and in the middle of it, an idea that quietly became real and spatial.",
    img: "assets/journey/2_yangzhou.jpg",
    lat: 32.95, lng: 119.285,
    projects: yangzhouProjects
  },
  2: {
    city: "Brisbane, Australia",
    title: "★ Master of Geographic Information Science",
    meta: "University of Queensland · Feb 2025 – Nov 2026",
    desc: "Landed in Brisbane to start the Master's, then carried two years of teaching, a shipped app, and a Shanghai data internship back into it — now finishing the degree, the chapter that ties teaching, the pet app, and GIS together.",
    img: "assets/journey/5_brisbane.jpg",
    lat: -27.47, lng: 153.03,
    isCurrent: true,
    projects: brisbaneProjects,
    cardsLayout: "grid"
  },
  3: {
    city: "Shanghai",
    title: "Data & Commercial Operations Intern (Automotive)",
    meta: "Bilibili · Nov 2025 – Feb 2026",
    desc: "Built a data monitoring framework on first-party platform data, delivering 20+ weekly/monthly reports. Used Python + AI-assisted segmentation to define 10+ NEV client audience profiles (Huawei HIMA, Zeekr, Li Auto), lifting CTR by 15–25%.",
    img: "assets/journey/4_shanghai_bilibili.jpg",
    lat: 31.20, lng: 121.50,
    projects: shanghaiProjects
  },
  4: {
    city: "Beijing",
    title: "AI & Agricultural Remote Sensing Summer School",
    meta: "China Agricultural University · Jul 2026",
    desc: "A two-week international summer school at China Agricultural University, sitting at the intersection of AI, remote sensing, GIS and sustainable agriculture.",
    img: "assets/journey/5_brisbane.jpg",
    lat: 39.9042, lng: 116.4074,
    projects: beijingProjects
  }
};

const detail = document.getElementById('journeyDetail');

function renderStop(id) {
  const s = journeyStops[id];
  if (!s || !detail) return;

  // Two card layouts:
  // - default: image-left / text-right, one per experience, stacked — used
  //   by most stops (the cards themselves carry the story, no separate top
  //   "overview" block).
  // - "grid" (Brisbane): a 3-up showcase row, image on top / text below,
  //   for stops where the project work itself is the point and deserves a
  //   bigger, more prominent picture.
  const layoutClass = s.cardsLayout ? ` journey-projects-${s.cardsLayout}` : '';
  const projectsHtml = (s.projects || []).map((p, idx) => {
    // multi-image cards (p.images) render the first photo + small dot
    // indicators; click-to-advance is wired up below after the HTML lands.
    const hasCarousel = p.images && p.images.length > 1;
    const hasPhoto = hasCarousel || !!p.img;
    const mapContent = hasCarousel
      ? `<img src="${p.images[0]}" alt="${p.title}" class="card-photo">
         <div class="carousel-dots">${p.images.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}</div>`
      : (p.img ? `<img src="${p.img}" alt="${p.title}" class="card-photo">` : (p.icon || ''));
    // real photos get a neutral backdrop that blends with the card instead
    // of the bold map-1/2/3 gradients (those are reserved for the SVG
    // illustrations, where the bright color is part of the drawing)
    const mapClass = hasPhoto ? 'card-map-photo' : (p.cardClass || 'map-1');
    return `
    <article class="project-card">
      <div class="card-map ${mapClass}${hasCarousel ? ' card-carousel' : ''}" data-idx="${idx}" aria-hidden="true">${mapContent}</div>
      <div class="project-card-body">
        <h3>${p.title}</h3>
        <p class="meta">${p.meta}</p>
        ${p.desc ? `<p>${p.desc}</p>` : ''}
        ${p.bullets && p.bullets.length ? `<ul class="card-bullets">${p.bullets.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
        ${p.note ? `<p class="card-note">${p.note}</p>` : ''}
        ${p.tags && p.tags.length ? `<div class="tags">${p.tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
        ${p.link ? `<a class="card-link" href="${p.link}" target="_blank" rel="noopener">${p.linkText || 'View project ↗'}</a>` : ''}
      </div>
    </article>
  `;
  }).join('');

  detail.innerHTML = `
    ${projectsHtml ? `<div class="journey-projects${layoutClass}">${projectsHtml}</div>` : ''}
  `;

  // Wire up click-to-advance for multi-image cards (e.g. Perth's before/after
  // pair) — each click steps to the next image and wraps back to the first.
  (s.projects || []).forEach((p, idx) => {
    if (!p.images || p.images.length < 2) return;
    const mapEl = detail.querySelector(`.card-map[data-idx="${idx}"]`);
    if (!mapEl) return;
    const imgEl = mapEl.querySelector('img.card-photo');
    const dots = mapEl.querySelectorAll('.carousel-dots span');
    let current = 0;
    mapEl.addEventListener('click', () => {
      current = (current + 1) % p.images.length;
      imgEl.src = p.images[current];
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    });
  });
}

(function initJourneyMap() {
  const el = document.getElementById('journeyMap');
  if (!el || typeof L === 'undefined') return;

  const map = L.map(el, {
    scrollWheelZoom: false,
    zoomControl: true,
    attributionControl: true
  });

  // Free, no-API-key raster tiles (CartoDB Voyager) — real world geography,
  // tinted toward the site's cream/mint/terracotta palette via CSS filter
  // on .leaflet-tile-pane. Swap this URL for Stadia's Stamen Watercolor
  // tiles (needs a free API key) for an even more painterly look:
  // https://docs.stadiamaps.com/map-styles/stamen-watercolor/
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  }).addTo(map);

  // move off bottom-right so it doesn't collide with the tiny-Trinity timeline widget
  map.attributionControl.setPosition('bottomleft');

  const order = ['1', '2', '3', '4'];

  // Brisbane (2) is home base, not just one link in a chain — Jiangsu (1)
  // leads into it, then Shanghai (3) and Beijing (4) are each a separate
  // excursion FROM Brisbane, not from each other. So this is a hub-and-spoke
  // set of legs, not one continuous path. The 3-2 and 4-2 legs are the
  // return trips — no layover on the way back, drawn on a different curve
  // than the outbound so each excursion reads as "there and back" rather
  // than one retraced line.
  const legs = ['1-2', '2-3', '2-4', '3-2', '4-2'];

  // Real transit hubs for the outbound international legs only — the return
  // legs (3-2, 4-2) go direct, no layover.
  const layovers = {
    '1-2': [1.3521, 103.8198],    // Singapore — Jiangsu to Brisbane
    '2-3': [-8.6500, 115.2167],   // Denpasar, Bali — Brisbane to Shanghai
    '2-4': [22.3193, 114.1694]    // Hong Kong — Brisbane to Beijing
  };

  // Per-leg curvature. 1-2, 2-3 and 2-4 all touch Brisbane, so they get
  // different signs/magnitudes to fan out visibly instead of overlapping
  // at that shared point. Return legs (3-2, 4-2) get a smaller, opposite-sign
  // bend from their outbound counterpart so the round trip shows as two
  // distinct curves instead of one retraced line. Bigger magnitude = bigger bulge.
  const legBend = {
    '1-2': 0.3,
    '2-3': 0.36,
    '2-4': -0.42,
    '3-2': -0.2,
    '4-2': 0.24
  };

  // Quadratic-bezier arc between two points, like a flight-route map — a
  // gentle outward bulge instead of a straight chord. `bend` controls how
  // far the curve pushes out relative to the leg's own length (sign flips
  // which side it bulges toward).
  function arcBetween(a, b, bend = 0.28, segments = 40) {
    const [lat0, lng0] = a;
    const [lat1, lng1] = b;
    const dLat = lat1 - lat0;
    const dLng = lng1 - lng0;
    const mLat = (lat0 + lat1) / 2 - dLng * bend;
    const mLng = (lng0 + lng1) / 2 + dLat * bend;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const lat = (1 - t) * (1 - t) * lat0 + 2 * (1 - t) * t * mLat + t * t * lat1;
      const lng = (1 - t) * (1 - t) * lng0 + 2 * (1 - t) * t * mLng + t * t * lng1;
      pts.push([lat, lng]);
    }
    return pts;
  }

  const layoverPoints = [];
  const allRoutePoints = [];

  legs.forEach(leg => {
    const [fromId, toId] = leg.split('-');
    const from = [journeyStops[fromId].lat, journeyStops[fromId].lng];
    const to = [journeyStops[toId].lat, journeyStops[toId].lng];
    const bend = legBend[leg];
    const hub = layovers[leg];

    let legPoints;
    if (hub) {
      layoverPoints.push(hub);
      legPoints = [...arcBetween(from, hub, bend), ...arcBetween(hub, to, bend).slice(1)];
    } else {
      legPoints = arcBetween(from, to, bend);
    }

    // each leg is its own polyline (they branch from Brisbane, so this isn't
    // one continuous path anymore)
    L.polyline(legPoints, {
      color: '#e08c69',
      weight: 2.5,
      dashArray: '6 7',
      lineCap: 'round',
      smoothFactor: 1
    }).addTo(map);

    allRoutePoints.push(...legPoints);
  });

  // layover hubs — unobtrusive small grey dots, not part of the numbered
  // story beats, just a hint that the trip passed through here
  layoverPoints.forEach(pt => {
    L.circleMarker(pt, {
      radius: 3.5,
      color: '#9a9488',
      weight: 1,
      fillColor: '#c9c3b6',
      fillOpacity: 0.8,
      interactive: false
    }).addTo(map);
  });

  const markers = {};

  order.forEach(id => {
    const s = journeyStops[id];
    // Brisbane (2) is flagged isCurrent — it gets a pulsing ring and a
    // "You are here" tag so it reads as the one that matters most, not
    // just another numbered stop on the route.
    const currentExtras = s.isCurrent
      ? '<span class="pin-pulse"></span><span class="pin-label">📍 I\'m here</span>'
      : '';
    const icon = L.divIcon({
      className: '',
      html: `<div class="map-pin${s.isCurrent ? ' pin-current' : ''}" data-stop="${id}">${currentExtras}<span>${id}</span></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    const marker = L.marker([s.lat, s.lng], { icon }).addTo(map);
    marker.on('click', () => selectStop(id));
    markers[id] = marker;
  });

  // --- tiny-Trinity walking the 2022–2026 timeline in the corner ---
  // One representative date per stop (some stops span a range in
  // journeyStops[].meta — this picks the moment that best represents "she
  // was here" for the walk position, not a precise interval).
  const timelineStart = new Date('2021-01-01').getTime();
  const timelineEnd = new Date('2027-12-31').getTime();
  const stopDates = {
    '1': '2022-09-01', // Jiangsu (Yangzhou) — start of the teaching post (also covers the Huai'an pet-project window, Jun–Dec 2024)
    '2': '2025-08-31', // Brisbane — tuned so the walk lands right on the "2025" tick
    '3': '2026-10-31', // Shanghai — tuned so the walk lands right on the "2026" tick
    '4': '2027-06-01'  // Beijing — tuned so the walk lands midway between the "2026" and "2027" ticks
  };

  function timelineFraction(id) {
    const d = new Date(stopDates[id]).getTime();
    return Math.max(0, Math.min(1, (d - timelineStart) / (timelineEnd - timelineStart)));
  }

  function walkTinyTrinityTo(id) {
    const figure = document.getElementById('tinyTrinity');
    if (!figure) return;
    const pct = timelineFraction(id) * 100;
    figure.style.left = `${pct}%`;
    figure.classList.add('walking');
    clearTimeout(figure._walkTimeout);
    figure._walkTimeout = setTimeout(() => figure.classList.remove('walking'), 950);
  }

  function selectStop(id) {
    order.forEach(oid => {
      const pinEl = markers[oid].getElement()?.querySelector('.map-pin');
      if (pinEl) pinEl.classList.toggle('pin-active', oid === id);
    });
    walkTinyTrinityTo(id);
    renderStop(id);
  }

  // fit to the full route (stops + layover hubs) so the wider Asia-Pacific
  // spread is visible, not just a tight box around the pins
  map.fitBounds(L.latLngBounds(allRoutePoints), { padding: [30, 30] });
  selectStop('2');
})();

// --- Contact section: "leave a message" feedback form ---
// No backend on this static site, so submitting hands the message off to the
// visitor's own email client via a mailto: link (prefilled subject/body)
// rather than silently failing or requiring a form-service signup.
(function initFeedbackForm() {
  const form = document.getElementById('feedbackForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('feedbackName').value.trim();
    const email = document.getElementById('feedbackEmail').value.trim();
    const message = document.getElementById('feedbackMessage').value.trim();
    const status = document.getElementById('feedbackStatus');

    if (!message) {
      status.textContent = 'Please write a message first.';
      return;
    }

    const subject = `Website feedback from ${name || 'a visitor'}`;
    const bodyLines = [message, ''];
    if (email) bodyLines.push(`Reply to: ${email}`);
    const body = bodyLines.join('\n');

    const mailto = `mailto:trinitypei666@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    status.textContent = 'Opening your email app…';
  });
})();
