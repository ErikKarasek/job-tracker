// The résumé, copied from spidey-portfolio/scripts/cv/content.mjs, which renders the general
// PDFs on erikkarasek.cz. Here it feeds the tailored CV (server/cv/tailor.ts) and the profile
// the agents score postings against (server/agent/profile.ts). When the CV changes, change both.

// Already on the public résumé PDFs and in the portfolio repo.
export const PHONE = '+420 731 322 180'

const shared = {
  name: 'Erik Karásek',
  email: 'erikkarasek@centrum.cz',
  github: 'github.com/ErikKarasek',
  web: 'erikkarasek.cz',
  // Served by the portfolio; the head-only crop of the hero shot.
  photo: 'https://erikkarasek.cz/img/me-cv.jpg',
  tech: ['React', 'Node.js', 'JavaScript', 'Python', 'Java', 'REST/JSON API', 'Cloudflare Workers', 'Supabase', 'Jira', 'Git', 'AI nástroje'],
}

export const cv = {
  cs: {
    ...shared,
    file: 'erik-karasek-zivotopis.pdf',
    title: 'Analytik / Tester · Vývoj & AI · IT podpora',
    city: 'Hradec Králové',
    studyLabel: 'Případová studie',
    labels: {
      profile: 'Profil',
      experience: 'Pracovní zkušenosti',
      projects: 'Vlastní projekty',
      tech: 'Klíčové technologie',
      strengths: 'Silné stránky',
      skills: 'Dovednosti',
      education: 'Vzdělání',
      other: 'Jazyky & ostatní',
      qr: 'Portfolio',
    },
    profile:
      'IT profesionál, kterého nejvíc baví tvořit, od webových aplikací po automatizace, a naplno u toho využívat umělou inteligenci. Aktuálně pracuji jako analytik / tester na mezinárodním projektu ENTSO-E Transparency Platform ve společnosti Unicorn. AI je pro mě hlavní téma: aktivně sleduji její vývoj a používám ji při kódování, debuggingu i učení nových technologií. Mám zázemí v IT podpoře (helpdesk L1, Active Directory, vzdálená správa) a hledám roli, kde spojím techniku, vývoj a AI.',
    strengths: [
      ['Rychlé učení a samostatnost', 'v nových technologiích a procesech se zorientuju rychle.'],
      ['AI-first přístup', 'běžně využívám AI k rychlejšímu a kvalitnějšímu vývoji.'],
      ['Spolehlivost a smysl pro detail', 'dovádím věci do konce.'],
      ['Chuť tvořit', 've volném čase stavím vlastní projekty od nápadu po nasazení.'],
    ],
    jobs: [
      {
        role: 'Analytik / Tester',
        when: 'červenec 2026 – současnost',
        where: 'Unicorn · projekt ENTSO-E Transparency Platform · Hradec Králové (hybridně)',
        points: [
          'Psaní testovacích scénářů (test cases) pro datová rozšíření platformy.',
          'Testování na DEV prostředí a ověřování funkčnosti dle zadání.',
          'Práce s Jira: správa a evidence ticketů, dokumentace postupu.',
          'Spolupráce se seniornějšími testery a vedoucím projektu na revizích scénářů.',
        ],
      },
      {
        role: 'ICT Technik L1',
        when: 'duben 2026 – červen 2026',
        where: 'BEDNAR FMT s.r.o. · Rychnov nad Kněžnou',
        points: [
          'Uživatelská podpora 1. úrovně: příjem, řešení a uzavírání incidentů v systému JIRA.',
          'Diagnostika a oprava HW závad, výměna komponent (RAM, SSD, periferie).',
          'Příprava a konfigurace nových stanic (Windows), přidávání do domény přes Active Directory.',
          'Vzdálená správa a troubleshooting pomocí RDP / TeamViewer.',
          'Evidence a údržba IT vybavení, správa skladu HW.',
        ],
      },
      {
        role: 'Specialista zákaznického centra',
        when: 'prosinec 2025 – únor 2026',
        where: 'T-Mobile Czech Republic a.s. · Hradec Králové',
        points: [
          'Telefonická podpora zákazníků, řešení technických a smluvních požadavků.',
          'Práce s telekomunikačními zařízeními, tarify a interními CRM systémy.',
          'Aktivní nabídka produktů a služeb, plnění prodejních cílů.',
        ],
      },
      {
        role: 'Odborná stáž – 3D grafika',
        when: '2024',
        where: 'Erasmus+, Německo',
        points: ['Tvorba 3D modelů a jednoduchých animací v Blenderu.', 'Práce s texturami, osvětlením a exportem modelů pro digitální design.'],
      },
      {
        role: 'Brigádník',
        when: 'červen 2020 – leden 2024',
        where: "McDonald's · Hradec Králové",
        points: [
          'Obsluha zákazníků a příprava objednávek v rychlém provozu.',
          'Týmová spolupráce, spolehlivost a flexibilita ve směnném provozu souběžně se studiem.',
        ],
      },
    ],
    projects: [
      {
        name: 'Nexus Grind',
        when: '2026',
        link: 'github.com/ErikKarasek/nexus-grind-releases',
        study: 'erikkarasek.cz/nexus-grind',
        points: [
          'Cross-platform produktivní tracker (úkoly, návyky, projekty, spánek/wellness) s gamifikovaným companion stromem a AI Coachem.',
          'Desktop (React + Vite + Tauri) i mobil (React Native / Expo), sdílená doménová logika s unit testy, vícejazyčnost CS/EN.',
          'Local-first s volitelným cloud syncem přes Supabase; monorepo (pnpm), CI/CD buildí Windows installer, macOS app i Android APK.',
        ],
      },
      {
        name: 'LolStats',
        when: '2026',
        link: 'lolstats.erikkarasek2005.workers.dev',
        study: 'erikkarasek.cz/lol-stats',
        points: [
          'Osobní webová aplikace pro statistiky League of Legends: historie zápasů, výkonnost šampionů, win rate, KDA, tier list.',
          'Nasazeno na Cloudflare Workers, zpracování dat na straně klienta (client-side).',
          'Integrace s Riot Games API (Match v5, Summoner v4, League v4, Account v1, Data Dragon).',
        ],
      },
      {
        name: 'Monster-Watch',
        when: '2026',
        link: 'monster-watch.onrender.com',
        study: 'erikkarasek.cz/monster-watch',
        points: [
          'Web aplikace pro monitoring dostupnosti energetických nápojů v obchodech po ČR.',
          'Automatizované sledování cen a srovnání nejlevnějších variant.',
          'Appka v React Native (Expo), backend v Pythonu (Flask), web scraper, JSON API.',
          'Vývoj s podporou AI nástrojů (Claude, Gemini CLI): coding, debugging, optimalizace.',
        ],
      },
      {
        name: 'Job Tracker',
        when: '2026',
        link: 'job-tracker-10s.pages.dev',
        study: 'erikkarasek.cz/job-tracker',
        points: [
          'Kanban nástroj na sledování přihlášek do práce: karta na pozici, fáze wishlist → applied → interview → offer/rejected.',
          'Statistiky nad historií přechodů: funnel podle fází, denní timeline a hlídání přihlášek bez aktivity.',
          'React 19 + Vite + Tailwind v4, REST API v Hono jako Cloudflare Pages Function, data v Cloudflare D1; TypeScript se sdílenými typy, jeden deploy pro web i API.',
        ],
      },
      {
        name: 'Subscription Tracker',
        when: '2026',
        link: 'github.com/ErikKarasek/subscription-tracker',
        study: 'erikkarasek.cz/subscriptions',
        points: [
          'Přehled předplatných: útrata po kategoriích, skutečně zaplacené částky v čase, hlídání blížících se plateb a nevyužívaných služeb.',
          'Cloudflare Worker se statickými assety hostí web i Hono API a denní cron trigger posouvá platby a rozesílá e-maily přes Resend.',
          'Data v Cloudflare D1; import ze screenshotu platby přes obrazový model na Cloudflare Workers AI, převod měn přes kurzy ECB.',
        ],
      },
    ],
    skills: [
      ['Umělá inteligence', 'Claude, Gemini CLI a další; kódování, debugging, analýza dat, učení.'],
      ['Programování', 'Node.js, Python, Java, React; web scraping, JSON/REST API, datové struktury.'],
      ['Cloud & web', 'Cloudflare Workers, REST API integrace, client-side aplikace.'],
      ['Testování SW', 'Test cases, testovací scénáře, DEV prostředí, Jira.'],
      ['IT podpora', 'Helpdesk L1, ticketování (JIRA), eskalace incidentů.'],
      ['Systémy & správa', 'Windows 10/11, základy Active Directory, RDP, TeamViewer, LAN/Wi-Fi troubleshooting.'],
      ['Hardware', 'Diagnostika závad, výměna komponent, inventarizace stanic.'],
      ['3D grafika', 'Blender: modelování, textury, základní animace.'],
    ],
    education: [
      { what: 'Informační technologie a ekonomika (maturita)', where: 'Obchodní akademie T. G. Masaryka, Kostelec nad Orlicí', when: '2021 – 2025' },
      { what: 'Základní škola', where: 'ZŠ Týniště nad Orlicí', when: '2011 – 2020' },
    ],
    other: [
      ['Angličtina', 'B2, Cambridge English First (FCE)'],
      ['Řidičský průkaz', 'skupina B'],
      ['Zájmy', 'hardware a PC sestavy, AI a moderní technologie, fitness, móda a styl'],
    ],
  },

  en: {
    ...shared,
    tech: shared.tech.map((t) => (t === 'AI nástroje' ? 'AI tools' : t)),
    file: 'erik-karasek-resume.pdf',
    title: 'Analyst / Tester · Development & AI · IT Support',
    city: 'Hradec Králové, CZ',
    studyLabel: 'Case study',
    labels: {
      profile: 'Profile',
      experience: 'Experience',
      projects: 'Personal projects',
      tech: 'Key technologies',
      strengths: 'Strengths',
      skills: 'Skills',
      education: 'Education',
      other: 'Languages & more',
      qr: 'Portfolio',
    },
    profile:
      "An IT professional who loves building things, from web apps to automations, and making full use of AI while doing it. I currently work as an analyst / tester on the international ENTSO-E Transparency Platform project at Unicorn. AI is my main interest: I follow where it's heading and use it for coding, debugging and learning new technologies. I have a background in IT support (L1 helpdesk, Active Directory, remote administration) and I'm looking for a role that brings together tech, development and AI.",
    strengths: [
      ['Fast learner, self-driven', 'I find my way around new technologies and processes quickly.'],
      ['AI-first', 'I use AI every day to build faster and better.'],
      ['Reliable, detail-minded', 'I see things through to the end.'],
      ['Love to build', 'in my free time I take my own projects from idea to deployment.'],
    ],
    jobs: [
      {
        role: 'Analyst / Tester',
        when: 'July 2026 – present',
        where: 'Unicorn · ENTSO-E Transparency Platform project · Hradec Králové (hybrid)',
        points: [
          'Writing test cases for data extensions of the platform.',
          'Testing on the DEV environment and verifying features against the specification.',
          'Working in Jira: managing and tracking tickets, documenting the process.',
          'Reviewing scenarios together with senior testers and the project lead.',
        ],
      },
      {
        role: 'ICT Technician L1',
        when: 'April 2026 – June 2026',
        where: 'BEDNAR FMT s.r.o. · Rychnov nad Kněžnou',
        points: [
          'First-level user support: taking, resolving and closing incidents in JIRA.',
          'Diagnosing and fixing hardware faults, replacing components (RAM, SSD, peripherals).',
          'Preparing and configuring new Windows workstations, joining them to the domain via Active Directory.',
          'Remote administration and troubleshooting over RDP / TeamViewer.',
          'Tracking and maintaining IT equipment, managing the hardware stock.',
        ],
      },
      {
        role: 'Customer Care Specialist',
        when: 'December 2025 – February 2026',
        where: 'T-Mobile Czech Republic a.s. · Hradec Králové',
        points: [
          'Phone support for customers, handling technical and contract requests.',
          'Working with telecom devices, rate plans and internal CRM systems.',
          'Proactively offering products and services, meeting sales targets.',
        ],
      },
      {
        role: 'Internship – 3D graphics',
        when: '2024',
        where: 'Erasmus+, Germany',
        points: ['Creating 3D models and simple animations in Blender.', 'Working with textures, lighting and exporting models for digital design.'],
      },
      {
        role: 'Part-time crew member',
        when: 'June 2020 – January 2024',
        where: "McDonald's · Hradec Králové",
        points: ['Serving customers and preparing orders in a fast-paced environment.', 'Teamwork, reliability and flexibility on shifts alongside my studies.'],
      },
    ],
    projects: [
      {
        name: 'Nexus Grind',
        when: '2026',
        link: 'github.com/ErikKarasek/nexus-grind-releases',
        study: 'erikkarasek.cz/nexus-grind',
        points: [
          'Cross-platform productivity tracker (tasks, habits, projects, sleep/wellness) with a gamified companion tree and an AI Coach.',
          'Desktop (React + Vite + Tauri) and mobile (React Native / Expo), shared domain logic with unit tests, CS/EN localisation.',
          'Local-first with optional cloud sync via Supabase; pnpm monorepo, CI/CD builds the Windows installer, macOS app and Android APK.',
        ],
      },
      {
        name: 'LolStats',
        when: '2026',
        link: 'lolstats.erikkarasek2005.workers.dev',
        study: 'erikkarasek.cz/lol-stats',
        points: [
          'Personal web app for League of Legends stats: match history, champion performance, win rate, KDA, tier list.',
          'Deployed on Cloudflare Workers, all data processed client-side.',
          'Riot Games API integration (Match v5, Summoner v4, League v4, Account v1, Data Dragon).',
        ],
      },
      {
        name: 'Monster-Watch',
        when: '2026',
        link: 'monster-watch.onrender.com',
        study: 'erikkarasek.cz/monster-watch',
        points: [
          'Web app that tracks energy drink availability in stores across the Czech Republic.',
          'Automated price tracking and comparison of the cheapest options.',
          'React Native (Expo) app, Python (Flask) backend, web scraper, JSON API.',
          'Built with AI tools (Claude, Gemini CLI): coding, debugging, optimisation.',
        ],
      },
      {
        name: 'Job Tracker',
        when: '2026',
        link: 'job-tracker-10s.pages.dev',
        study: 'erikkarasek.cz/job-tracker',
        points: [
          'Kanban tool for tracking job applications: a card per role, moving wishlist → applied → interview → offer/rejected.',
          'Stats built on the history of stage changes: a funnel by stage, a per-day timeline and a watch on applications with no activity.',
          'React 19 + Vite + Tailwind v4, REST API in Hono as a Cloudflare Pages Function, data in Cloudflare D1; TypeScript with shared types, one deploy for the site and the API.',
        ],
      },
      {
        name: 'Subscription Tracker',
        when: '2026',
        link: 'github.com/ErikKarasek/subscription-tracker',
        study: 'erikkarasek.cz/subscriptions',
        points: [
          'Subscription overview: spend by category, what was actually paid over time, and a watch on upcoming payments and unused services.',
          'A Cloudflare Worker with static assets serves the site and a Hono API, and a daily cron trigger rolls payments forward and sends email through Resend.',
          'Data in Cloudflare D1; payment screenshots imported through a vision model on Cloudflare Workers AI, currencies converted at ECB rates.',
        ],
      },
    ],
    skills: [
      ['AI', 'Claude, Gemini CLI and more; coding, debugging, data analysis, learning.'],
      ['Programming', 'Node.js, Python, Java, React; web scraping, JSON/REST APIs, data structures.'],
      ['Cloud & web', 'Cloudflare Workers, REST API integrations, client-side apps.'],
      ['Software testing', 'Test cases, test scenarios, DEV environments, Jira.'],
      ['IT support', 'L1 helpdesk, ticketing (JIRA), incident escalation.'],
      ['Systems', 'Windows 10/11, Active Directory basics, RDP, TeamViewer, LAN/Wi-Fi troubleshooting.'],
      ['Hardware', 'Fault diagnosis, component replacement, workstation inventory.'],
      ['3D graphics', 'Blender: modelling, texturing, basic animation.'],
    ],
    education: [
      { what: 'Information Technology and Economics (school-leaving exam)', where: 'T. G. Masaryk Business Academy, Kostelec nad Orlicí', when: '2021 – 2025' },
      { what: 'Primary school', where: 'Týniště nad Orlicí', when: '2011 – 2020' },
    ],
    other: [
      ['English', 'B2, Cambridge English First (FCE)'],
      ['Driving licence', 'category B'],
      ['Interests', 'PC hardware and builds, AI and new tech, fitness, fashion and style'],
    ],
  },
}

export type Cv = typeof cv.cs
export type CvLang = keyof typeof cv
