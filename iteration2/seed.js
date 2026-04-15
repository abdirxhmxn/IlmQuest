const mongoose = require("mongoose");
const Reflection = require("./models/Verses");
require("dotenv").config({ path: "./config/.env" });

const reflections = [
  {
    type: "Quran",
    arabic: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
    translation: "For indeed, with hardship comes ease.",
    reference: "94:5",
    surah: "Ash-Sharh",
    tags: ["patience", "hope", "trials"]
  },
  {
    type: "Quran",
    arabic: "لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا",
    translation: "Allah does not burden a soul beyond what it can bear.",
    reference: "2:286",
    surah: "Al-Baqarah",
    tags: ["patience", "strength"]
  },
  {
    type: "Quran",
    arabic: "ادْعُونِي أَسْتَجِبْ لَكُمْ",
    translation: "Call upon Me; I will respond to you.",
    reference: "40:60",
    surah: "Ghafir",
    tags: ["dua", "hope", "faith"]
  },
  {
    type: "Quran",
    arabic: "وَمَنْ يَتَّقِ اللَّهَ يَجْعَلْ لَهُ مَخْرَجًا • وَيَرْزُقْهُ مِنْ حَيْثُ لَا يَحْتَسِبُ",
    translation: "And whoever fears Allah — He will make for him a way out and provide for him from where he does not expect.",
    reference: "65:2-3",
    surah: "At-Talaq",
    tags: ["taqwa", "rizq", "trust"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ",
    translation: "Indeed, Allah is with the patient.",
    reference: "2:153",
    surah: "Al-Baqarah",
    tags: ["patience", "faith"]
  },
  {
    type: "Quran",
    arabic: "وَقُلْ رَبِّ زِدْنِي عِلْمًا",
    translation: "And say, 'My Lord, increase me in knowledge.'",
    reference: "20:114",
    surah: "Ta-Ha",
    tags: ["knowledge", "dua", "growth"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ مَعَ الْعُسْرِ يُسْرًا",
    translation: "Indeed, with hardship comes ease.",
    reference: "94:6",
    surah: "Ash-Sharh",
    tags: ["comfort", "patience"]
  },
  {
    type: "Quran",
    arabic: "فَاذْكُرُونِي أَذْكُرْكُمْ",
    translation: "So remember Me; I will remember you.",
    reference: "2:152",
    surah: "Al-Baqarah",
    tags: ["dhikr", "faith"]
  },
  {
    type: "Quran",
    arabic: "وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ",
    translation: "My success is only by Allah.",
    reference: "11:88",
    surah: "Hud",
    tags: ["success", "tawakkul"]
  },
  {
    type: "Quran",
    arabic: "وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ",
    translation: "And He is with you wherever you are.",
    reference: "57:4",
    surah: "Al-Hadid",
    tags: ["allah", "presence", "faith"]
  },
  {
    type: "Quran",
    arabic: "وَاصْبِرْ وَمَا صَبْرُكَ إِلَّا بِاللَّهِ",
    translation: "And be patient, for your patience is only through Allah.",
    reference: "16:127",
    surah: "An-Nahl",
    tags: ["patience", "tawakkul"]
  },
  {
    type: "Quran",
    arabic: "وَبَشِّرِ الصَّابِرِينَ",
    translation: "Give good tidings to the patient.",
    reference: "2:155",
    surah: "Al-Baqarah",
    tags: ["patience", "virtue"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ رَبِّي لَطِيفٌ لِمَا يَشَاءُ",
    translation: "Indeed, my Lord is Subtle in what He wills.",
    reference: "12:100",
    surah: "Yusuf",
    tags: ["patience", "trust"]
  },
  {
    type: "Quran",
    arabic: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ",
    translation: "Sufficient for us is Allah, and He is the best disposer of affairs.",
    reference: "3:173",
    surah: "Aal-Imran",
    tags: ["tawakkul", "strength"]
  },
  {
    type: "Quran",
    arabic: "وَمَنْ يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ",
    translation: "And whoever relies upon Allah – then He is sufficient for him.",
    reference: "65:3",
    surah: "At-Talaq",
    tags: ["tawakkul"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ يُدَافِعُ عَنِ الَّذِينَ آمَنُوا",
    translation: "Indeed, Allah defends those who have believed.",
    reference: "22:38",
    surah: "Al-Hajj",
    tags: ["protection", "faith"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ مَعِيَ رَبِّي سَيَهْدِينِ",
    translation: "Indeed, with me is my Lord; He will guide me.",
    reference: "26:62",
    surah: "Ash-Shuara",
    tags: ["hope", "guidance"]
  },
  {
    type: "Quran",
    arabic: "قُل لَّن يُصِيبَنَا إِلَّا مَا كَتَبَ اللَّهُ لَنَا",
    translation: "Say, 'Nothing will happen to us except what Allah has decreed for us.'",
    reference: "9:51",
    surah: "At-Tawbah",
    tags: ["trust", "destiny"]
  },
  {
    type: "Quran",
    arabic: "فَفِرُّوا إِلَى اللَّهِ",
    translation: "So flee to Allah.",
    reference: "51:50",
    surah: "Adh-Dhariyat",
    tags: ["repentance", "hope"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ رَبَّكَ سَرِيعُ الْعِقَابِ وَإِنَّهُ لَغَفُورٌ رَّحِيمٌ",
    translation: "Indeed, your Lord is swift in penalty; but indeed, He is Forgiving and Merciful.",
    reference: "7:167",
    surah: "Al-Araf",
    tags: ["fear", "mercy"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ رَبِّي قَرِيبٌ مُّجِيبٌ",
    translation: "Indeed, my Lord is near and responsive.",
    reference: "11:61",
    surah: "Hud",
    tags: ["dua", "comfort"]
  },
  {
    type: "Quran",
    arabic: "وَلَنَبْلُوَنَّكُمْ بِشَيْءٍ مِّنَ الْخَوْفِ وَالْجُوعِ",
    translation: "And We will surely test you with something of fear and hunger...",
    reference: "2:155-157",
    surah: "Al-Baqarah",
    tags: ["trials", "test"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ",
    translation: "Indeed, Allah does not allow to be lost the reward of the good-doers.",
    reference: "9:120",
    surah: "At-Tawbah",
    tags: ["reward", "justice"]
  },
  {
    type: "Quran",
    arabic: "لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ",
    translation: "Do not despair of the mercy of Allah.",
    reference: "39:53",
    surah: "Az-Zumar",
    tags: ["hope", "mercy"]
  },
  {
    type: "Quran",
    arabic: "وَمَا أَنفَقْتُم مِّن شَيْءٍ فَهُوَ يُخْلِفُهُ",
    translation: "Whatever you spend of anything — He will replace it.",
    reference: "34:39",
    surah: "Saba",
    tags: ["charity", "trust"]
  },
  {
    type: "Quran",
    arabic: "وَأَقِمِ ٱلصَّلَوٰةَ إِنَّ ٱلصَّلَوٰةَ تَنْهَىٰ عَنِ ٱلْفَحْشَآءِ وَٱلْمُنكَرِ",
    translation: "Establish prayer — indeed, prayer restrains from immorality and wrongdoing.",
    reference: "29:45",
    surah: "Al-Ankabut",
    tags: ["salah", "guidance"]
  },
  {
    type: "Quran",
    arabic: "وَأَقِمِ ٱلصَّلَوٰةَ وَءَاتِ ٱلزَّكَوٰةَ",
    translation: "Establish prayer and give zakāh.",
    reference: "2:110",
    surah: "Al-Baqarah",
    tags: ["salah", "zakat"]
  },
  {
    type: "Quran",
    arabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
    translation: "Say, 'He is Allah, One.'",
    reference: "112:1",
    surah: "Al-Ikhlas",
    tags: ["tawheed", "faith"]
  },
  {
    type: "Quran",
    arabic: "إِنَّنِي مَعَكُمَآ أَسْمَعُ وَأَرَىٰ",
    translation: "Indeed, I am with you both; I hear and I see.",
    reference: "20:46",
    surah: "Ta-Ha",
    tags: ["comfort", "protection"]
  },
  {
    type: "Quran",
    arabic: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
    translation: "It is You we worship and You we ask for help.",
    reference: "1:5",
    surah: "Al-Fatihah",
    tags: ["salah", "tawheed"]
  },
  {
    type: "Quran",
    arabic: "ٱللَّهُ نُورُ ٱلسَّمَاوَٰتِ وَٱلْأَرْضِ",
    translation: "Allah is the Light of the heavens and the earth.",
    reference: "24:35",
    surah: "An-Nur",
    tags: ["faith", "light"]
  },
  {
    type: "Quran",
    arabic: "فَلَا تَخَافُوهُمْ وَخَافُونِ",
    translation: "So fear them not, but fear Me.",
    reference: "3:175",
    surah: "Aal-Imran",
    tags: ["taqwa", "courage"]
  },
  {
    type: "Quran",
    arabic: "وَتَوَكَّلْ عَلَى ٱللَّهِ وَكَفَىٰ بِٱللَّهِ وَكِيلًا",
    translation: "And rely upon Allah; and sufficient is Allah as a Disposer of affairs.",
    reference: "33:3",
    surah: "Al-Ahzab",
    tags: ["tawakkul", "strength"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تَيْأَسُوا۟ مِن رَّوْحِ ٱللَّهِ",
    translation: "Do not lose hope in the relief from Allah.",
    reference: "12:87",
    surah: "Yusuf",
    tags: ["hope", "patience"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ ٱللَّهَ غَفُورٌ رَّحِيمٌ",
    translation: "Indeed, Allah is Forgiving and Merciful.",
    reference: "2:173",
    surah: "Al-Baqarah",
    tags: ["mercy", "forgiveness"]
  },
  {
    type: "Quran",
    arabic: "فَإِنِّى قَرِيبٌ",
    translation: "I am surely near.",
    reference: "2:186",
    surah: "Al-Baqarah",
    tags: ["dua", "comfort"]
  },
  {
    type: "Quran",
    arabic: "وَٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ",
    translation: "Seek help through patience and prayer.",
    reference: "2:45",
    surah: "Al-Baqarah",
    tags: ["salah", "patience"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ ٱللَّهَ يُحِبُّ ٱلْمُتَوَكِّلِينَ",
    translation: "Indeed, Allah loves those who rely upon Him.",
    reference: "3:159",
    surah: "Aal-Imran",
    tags: ["love", "tawakkul"]
  },
  {
    type: "Quran",
    arabic: "وَبِٱلْوَٰلِدَيْنِ إِحْسَانًا",
    translation: "And be good to your parents.",
    reference: "17:23",
    surah: "Al-Isra",
    tags: ["family", "character"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تَمُوتُنَّ إِلَّا وَأَنتُم مُّسْلِمُونَ",
    translation: "And do not die except as Muslims [in submission to Him].",
    reference: "2:132",
    surah: "Al-Baqarah",
    tags: ["faith", "submission"]
  },
  {
    type: "Quran",
    arabic: "وَلِلَّهِ مَا فِي ٱلسَّمَاوَاتِ وَمَا فِي ٱلْأَرْضِ",
    translation: "To Allah belongs whatever is in the heavens and whatever is on the earth.",
    reference: "2:284",
    surah: "Al-Baqarah",
    tags: ["tawheed", "ownership"]
  },
  {
    type: "Quran",
    arabic: "وَإِلَىٰ رَبِّكَ فَٱرْغَبْ",
    translation: "And to your Lord direct your longing.",
    reference: "94:8",
    surah: "Ash-Sharh",
    tags: ["worship", "focus"]
  },
  {
    type: "Quran",
    arabic: "كَتَبَ رَبُّكُمْ عَلَىٰ نَفْسِهِ الرَّحْمَةَ",
    translation: "Your Lord has decreed mercy upon Himself.",
    reference: "6:54",
    surah: "Al-Anam",
    tags: ["mercy", "love"]
  },
  {
    type: "Quran",
    arabic: "وَرَحْمَتِي وَسِعَتْ كُلَّ شَيْءٍ",
    translation: "My mercy encompasses all things.",
    reference: "7:156",
    surah: "Al-Araf",
    tags: ["mercy"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ رَبَّكَ لَذُو مَغْفِرَةٍ",
    translation: "Indeed, your Lord is the possessor of forgiveness.",
    reference: "53:32",
    surah: "An-Najm",
    tags: ["forgiveness"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ يُحِبُّ الْمُحْسِنِينَ",
    translation: "Indeed, Allah loves the doers of good.",
    reference: "2:195",
    surah: "Al-Baqarah",
    tags: ["love", "goodness"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ رَحْمَتَ اللَّهِ قَرِيبٌ مِنَ الْمُحْسِنِينَ",
    translation: "Indeed, the mercy of Allah is near to the doers of good.",
    reference: "7:56",
    surah: "Al-Araf",
    tags: ["mercy", "goodness"]
  },
  {
    type: "Quran",
    arabic: "قُلْ يَا عِبَادِيَ الَّذِينَ أَسْرَفُوا عَلَىٰ أَنْفُسِهِمْ لَا تَقْنَطُوا مِنْ رَحْمَةِ اللَّهِ",
    translation: "O My servants who have transgressed against themselves, do not despair of the mercy of Allah.",
    reference: "39:53-54",
    surah: "Az-Zumar",
    tags: ["hope", "mercy"]
  },
  {
    type: "Quran",
    arabic: "يُرِيدُ اللَّهُ أَنْ يُخَفِّفَ عَنْكُمْ",
    translation: "Allah intends to make things easy for you.",
    reference: "4:28",
    surah: "An-Nisa",
    tags: ["ease", "mercy"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ",
    translation: "Indeed, Allah loves those who repent.",
    reference: "2:222",
    surah: "Al-Baqarah",
    tags: ["repentance", "love"]
  },
  {
    type: "Quran",
    arabic: "وَهُوَ أَرْحَمُ الرَّاحِمِينَ",
    translation: "And He is the Most Merciful of the merciful.",
    reference: "12:92",
    surah: "Yusuf",
    tags: ["mercy"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ رَبِّي رَحِيمٌ وَدُودٌ",
    translation: "Indeed, my Lord is Merciful and Loving.",
    reference: "11:90",
    surah: "Hud",
    tags: ["mercy", "love"]
  },
  {
    type: "Quran",
    arabic: "يُحِبُّهُمْ وَيُحِبُّونَهُ",
    translation: "He loves them and they love Him.",
    reference: "5:54",
    surah: "Al-Maidah",
    tags: ["love", "faith"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ لَطِيفٌ بِعِبَادِهِ",
    translation: "Indeed, Allah is Gentle with His servants.",
    reference: "42:19",
    surah: "Ash-Shura",
    tags: ["gentleness", "mercy"]
  },
  {
    type: "Quran",
    arabic: "وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا",
    translation: "Pardon us, forgive us, and have mercy upon us.",
    reference: "2:286",
    surah: "Al-Baqarah",
    tags: ["dua", "forgiveness"]
  },
  {
    type: "Quran",
    arabic: "فَإِنَّ اللَّهَ يَغْفِرُ الذُّنُوبَ جَمِيعًا",
    translation: "For Allah forgives all sins.",
    reference: "39:53b",
    surah: "Az-Zumar",
    tags: ["forgiveness"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ لَا يُحِبُّ الْخَائِنِينَ",
    translation: "Indeed, Allah does not love the treacherous.",
    reference: "8:58",
    surah: "Al-Anfal",
    tags: ["character"]
  },
  {
    type: "Quran",
    arabic: "إِنَّهُ لا يَيْئَسُ مِن رَوْحِ اللَّهِ إِلَّا الْقَوْمُ الْكَافِرُونَ",
    translation: "None despairs of relief from Allah except the disbelieving people.",
    reference: "12:87",
    surah: "Yusuf",
    tags: ["hope", "comfort"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ سَرِيعُ الْحِسَابِ",
    translation: "Indeed, Allah is swift in account.",
    reference: "3:19",
    surah: "Aal-Imran",
    tags: ["accountability", "akhirah"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ الْأَبْرَارَ لَفِي نَعِيمٍ",
    translation: "Indeed, the righteous will be in pleasure.",
    reference: "82:13",
    surah: "Al-Infitar",
    tags: ["reward", "jannah"]
  },
  {
    type: "Quran",
    arabic: "نَبِّئْ عِبَادِي أَنِّي أَنَا الْغَفُورُ الرَّحِيمُ",
    translation: "Inform My servants that it is I who am the Forgiving, the Merciful.",
    reference: "15:49",
    surah: "Al-Hijr",
    tags: ["mercy", "forgiveness"]
  },
  {
    type: "Quran",
    arabic: "وَقُولُوا لِلنَّاسِ حُسْنًا",
    translation: "And speak to people good words.",
    reference: "2:83",
    surah: "Al-Baqarah",
    tags: ["character", "speech", "kindness"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ",
    translation: "Indeed, the most noble of you in the sight of Allah is the most righteous of you.",
    reference: "49:13",
    surah: "Al-Hujurat",
    tags: ["taqwa", "nobility"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ يُحِبُّ الْمُقْسِطِينَ",
    translation: "Indeed, Allah loves those who act justly.",
    reference: "49:9",
    surah: "Al-Hujurat",
    tags: ["justice", "character"]
  },
  {
    type: "Quran",
    arabic: "وَلْيَعْفُوا وَلْيَصْفَحُوا",
    translation: "Let them pardon and overlook.",
    reference: "24:22",
    surah: "An-Nur",
    tags: ["forgiveness", "character"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تَمْشِ فِي الْأَرْضِ مَرَحًا",
    translation: "Do not walk upon the earth arrogantly.",
    reference: "17:37",
    surah: "Al-Isra",
    tags: ["humility", "arrogance"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تَسْتَوِي الْحَسَنَةُ وَلَا السَّيِّئَةُ",
    translation: "Good and evil cannot be equal.",
    reference: "41:34",
    surah: "Fussilat",
    tags: ["ethics", "goodness"]
  },
  {
    type: "Quran",
    arabic: "ادْفَعْ بِالَّتِي هِيَ أَحْسَنُ",
    translation: "Repel evil with what is better.",
    reference: "41:34",
    surah: "Fussilat",
    tags: ["conflict", "patience", "kindness"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ مَعَ الْمُتَّقِينَ",
    translation: "Indeed, Allah is with the righteous.",
    reference: "9:36",
    surah: "At-Tawbah",
    tags: ["taqwa", "companionship"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ يُحِبُّ الصَّادِقِينَ",
    translation: "Indeed, Allah loves the truthful.",
    reference: "9:119",
    surah: "At-Tawbah",
    tags: ["truth", "honesty"]
  },
  {
    type: "Quran",
    arabic: "وَبِالْوَالِدَيْنِ إِحْسَانًا",
    translation: "And be excellent to your parents.",
    reference: "4:36",
    surah: "An-Nisa",
    tags: ["parents", "family"]
  },
  {
    type: "Quran",
    arabic: "كُونُوا مَعَ الصَّادِقِينَ",
    translation: "Be with the truthful.",
    reference: "9:119",
    surah: "At-Tawbah",
    tags: ["honesty", "friends"]
  },
  {
    type: "Quran",
    arabic: "لَا تَجْعَلْ يَدَكَ مَغْلُولَةً إِلَىٰ عُنُقِكَ وَلَا تَبْسُطْهَا كُلَّ الْبَسْطِ",
    translation: "Do not be tight-fisted, nor be so open-handed that you become blameworthy.",
    reference: "17:29",
    surah: "Al-Isra",
    tags: ["charity", "balance"]
  },
  {
    type: "Quran",
    arabic: "وَمَنْ يَغْفِرُ الذُّنُوبَ إِلَّا اللَّهُ",
    translation: "And who forgives sins but Allah?",
    reference: "3:135",
    surah: "Aal-Imran",
    tags: ["forgiveness"]
  },
  {
    type: "Quran",
    arabic: "وَاصْدُقُوا فِي الْوَعْدِ",
    translation: "Be true to your promises.",
    reference: "17:34",
    surah: "Al-Isra",
    tags: ["trustworthiness", "honesty"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تُسْرِفُوا ۚ إِنَّهُ لَا يُحِبُّ الْمُسْرِفِينَ",
    translation: "Do not waste — indeed, He does not love the wasteful.",
    reference: "7:31",
    surah: "Al-Araf",
    tags: ["character", "sustainability"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ",
    translation: "Indeed, Allah commands justice and excellence.",
    reference: "16:90",
    surah: "An-Nahl",
    tags: ["justice", "excellence"]
  },
  {
    type: "Quran",
    arabic: "فَذَكِّرْ إِن نَّفَعَتِ الذِّكْرَىٰ",
    translation: "So remind, if the reminder benefits.",
    reference: "87:9",
    surah: "Al-Ala",
    tags: ["dawah", "helping others"]
  },
  {
    type: "Quran",
    arabic: "وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَىٰ",
    translation: "Cooperate in righteousness and piety.",
    reference: "5:2",
    surah: "Al-Maidah",
    tags: ["teamwork", "righteousness"]
  },
  {
    type: "Quran",
    arabic: "لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ",
    translation: "If you are grateful, I will surely increase you.",
    reference: "14:7",
    surah: "Ibrahim",
    tags: ["gratitude", "blessing"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ",
    translation: "Do not weaken and do not grieve, and you will be superior if you are [true] believers.",
    reference: "3:139",
    surah: "Aal-Imran",
    tags: ["strength", "faith", "victory"]
  },
  {
    type: "Quran",
    arabic: "وَقَالَ رَبُّكُمُ ادْعُونِي أَسْتَجِبْ لَكُمْ",
    translation: "And your Lord says, 'Call upon Me; I will respond to you.'",
    reference: "40:60",
    surah: "Ghafir",
    tags: ["dua", "hope", "mercy"]
  },
  {
    type: "Quran",
    arabic: "وَإِنَّ إِلَىٰ رَبِّكَ الْمُنتَهَىٰ",
    translation: "And indeed, to your Lord is the final destination.",
    reference: "53:42",
    surah: "An-Najm",
    tags: ["akhirah", "purpose", "faith"]
  },
  {
    type: "Quran",
    arabic: "مَا وَدَّعَكَ رَبُّكَ وَمَا قَلَىٰ",
    translation: "Your Lord has not abandoned you, nor has He detested you.",
    reference: "93:3",
    surah: "Ad-Duha",
    tags: ["hope", "faith", "comfort"]
  },
  {
    type: "Quran",
    arabic: "وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ",
    translation: "And He is over all things competent.",
    reference: "67:1",
    surah: "Al-Mulk",
    tags: ["power", "tawhid", "faith"]
  },
  {
    type: "Quran",
    arabic: "سَنَكْتُبُ مَا قَدَّمُوا وَآثَارَهُمْ",
    translation: "We will record what they put forth and what they left behind.",
    reference: "36:12",
    surah: "Yasin",
    tags: ["legacy", "deeds", "accountability"]
  },
  {
    type: "Quran",
    arabic: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ",
    translation: "Unquestionably, by the remembrance of Allah hearts find rest.",
    reference: "13:28",
    surah: "Ar-Rad",
    tags: ["peace", "dhikr", "comfort"]
  },
  {
    type: "Quran",
    arabic: "وَاللَّهُ وَلِيُّ الْمُؤْمِنِينَ",
    translation: "And Allah is the ally of the believers.",
    reference: "3:68",
    surah: "Aal-Imran",
    tags: ["support", "faith", "protection"]
  },
  {
    type: "Quran",
    arabic: "وَكَانَ اللَّهُ غَفُورًا رَّحِيمًا",
    translation: "And Allah is Forgiving and Merciful.",
    reference: "4:96",
    surah: "An-Nisa",
    tags: ["forgiveness", "mercy"]
  },
  {
    type: "Quran",
    arabic: "إِنَّا لِلَّـهِ وَإِنَّـا إِلَيْهِ رَاجِعُونَ",
    translation: "Indeed we belong to Allah, and indeed to Him we will return.",
    reference: "2:156",
    surah: "Al-Baqarah",
    tags: ["patience", "loss", "submission"]
  },
  {
    type: "Quran",
    arabic: "وَمَنْ يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا",
    translation: "And whoever fears Allah — He will make for him a way out.",
    reference: "65:2",
    surah: "At-Talaq",
    tags: ["taqwa", "relief", "hope"]
  },
  {
    type: "Quran",
    arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً",
    translation: "Our Lord, give us good in this world and good in the Hereafter.",
    reference: "2:201",
    surah: "Al-Baqarah",
    tags: ["dua", "balance", "worldly"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تَحْسَبَنَّ اللَّهَ غَافِلًا عَمَّا يَعْمَلُ الظَّالِمُونَ",
    translation: "And never think that Allah is unaware of what the wrongdoers do.",
    reference: "14:42",
    surah: "Ibrahim",
    tags: ["justice", "accountability", "patience"]
  },
  {
    type: "Quran",
    arabic: "فَاصْبِرْ إِنَّ وَعْدَ اللَّهِ حَقٌّ",
    translation: "So be patient. Indeed, the promise of Allah is truth.",
    reference: "30:60",
    surah: "Ar-Rum",
    tags: ["patience", "promise", "truth"]
  },
  {
    type: "Quran",
    arabic: "وَمَا خَلَقْتُ الْجِنَّ وَالْإِنسَ إِلَّا لِيَعْبُدُونِ",
    translation: "And I did not create the jinn and mankind except to worship Me.",
    reference: "51:56",
    surah: "Adh-Dhariyat",
    tags: ["purpose", "worship", "creation"]
  },
  {
    type: "Quran",
    arabic: "وَلَا تَقْفُ مَا لَيْسَ لَكَ بِهِ عِلْمٌ",
    translation: "And do not pursue that of which you have no knowledge.",
    reference: "17:36",
    surah: "Al-Isra",
    tags: ["knowledge", "wisdom", "caution"]
  },
  {
    type: "Quran",
    arabic: "وَمَن يُؤْمِن بِاللَّهِ يَهْدِ قَلْبَهُ",
    translation: "And whoever believes in Allah — He will guide his heart.",
    reference: "64:11",
    surah: "At-Taghabun",
    tags: ["faith", "guidance", "heart"]
  },
  {
    type: "Quran",
    arabic: "إِنَّ الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ كَانَتْ لَهُمْ جَنَّاتُ الْفِرْدَوْسِ نُزُلًا",
    translation: "Indeed, those who have believed and done righteous deeds — they will have the Gardens of Paradise as a lodging.",
    reference: "18:107",
    surah: "Al-Kahf",
    tags: ["jannah", "reward", "righteousness"]
  },
  {
    type: "Quran",
    arabic: "وَاعْبُدْ رَبَّكَ حَتَّىٰ يَأْتِيَكَ الْيَقِينُ",
    translation: "And worship your Lord until there comes to you the certainty (death).",
    reference: "15:99",
    surah: "Al-Hijr",
    tags: ["worship", "perseverance", "death"]
  },
  {
    type: "Quran",
    arabic: "وَلَوْلَا فَضْلُ اللَّهِ عَلَيْكُمْ وَرَحْمَتُهُ",
    translation: "And if it was not for the favor of Allah upon you and His mercy...",
    reference: "24:10",
    surah: "An-Nur",
    tags: ["mercy", "gratitude", "blessing"]
  }
];

async function seedData() {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("Connected to DB...");

    // Drop the old unique index on reference field
    try {
      await Reflection.collection.dropIndex("reference_1");
      console.log("Dropped old reference index");
    } catch (err) {
      console.log("No reference index to drop (this is fine)");
    }

    await Reflection.deleteMany({});
    console.log("Old reflections cleared!");

    await Reflection.insertMany(reflections);
    console.log("✅ Reflections Seeded! 🌙✨");
    console.log(`Total verses seeded: ${reflections.length}`);

    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Seeding error:", err);
    mongoose.connection.close();
  }
}

seedData();