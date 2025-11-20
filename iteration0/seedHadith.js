const mongoose = require("mongoose");
const Reflection = require("./models/Reflections");
require("dotenv").config({ path: "./config/.env" });

const hadiths = [
  {
    type: "Hadith",
    arabic: "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ",
    translation: "Actions are judged by intentions.",
    reference: "Bukhari 1",
    narrator: "Bukhari",
    hadithNumber: "1",
    tags: ["intention", "sincerity", "actions"]
  },
  {
    type: "Hadith",
    arabic: "الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ",
    translation: "The Muslim is the one from whose tongue and hand the Muslims are safe.",
    reference: "Bukhari 10",
    narrator: "Bukhari",
    hadithNumber: "10",
    tags: ["character", "kindness", "peace"]
  },
  {
    type: "Hadith",
    arabic: "مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ",
    translation: "Whoever believes in Allah and the Last Day should speak good or remain silent.",
    reference: "Bukhari 6018",
    narrator: "Bukhari",
    hadithNumber: "6018",
    tags: ["speech", "silence", "wisdom"]
  },
  {
    type: "Hadith",
    arabic: "لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ",
    translation: "None of you truly believes until he loves for his brother what he loves for himself.",
    reference: "Bukhari 13",
    narrator: "Bukhari",
    hadithNumber: "13",
    tags: ["love", "brotherhood", "faith"]
  },
  {
    type: "Hadith",
    arabic: "الدِّينُ النَّصِيحَةُ",
    translation: "Religion is sincere advice.",
    reference: "Muslim 55",
    narrator: "Muslim",
    hadithNumber: "55",
    tags: ["advice", "sincerity", "guidance"]
  },
  {
    type: "Hadith",
    arabic: "مَنْ غَشَّنَا فَلَيْسَ مِنَّا",
    translation: "Whoever cheats us is not one of us.",
    reference: "Muslim 102",
    narrator: "Muslim",
    hadithNumber: "102",
    tags: ["honesty", "character", "integrity"]
  },
  {
    type: "Hadith",
    arabic: "الطُّهُورُ شَطْرُ الإِيمَانِ",
    translation: "Purity is half of faith.",
    reference: "Muslim 223",
    narrator: "Muslim",
    hadithNumber: "223",
    tags: ["purity", "cleanliness", "faith"]
  },
  {
    type: "Hadith",
    arabic: "تَبَسُّمُكَ فِي وَجْهِ أَخِيكَ صَدَقَةٌ",
    translation: "Your smile in the face of your brother is charity.",
    reference: "Tirmidhi 1956",
    narrator: "Tirmidhi",
    hadithNumber: "1956",
    tags: ["kindness", "charity", "smile"]
  },
  {
    type: "Hadith",
    arabic: "خَيْرُكُمْ خَيْرُكُمْ لِأَهْلِهِ",
    translation: "The best of you are those who are best to their families.",
    reference: "Tirmidhi 3895",
    narrator: "Tirmidhi",
    hadithNumber: "3895",
    tags: ["family", "kindness", "character"]
  },
  {
    type: "Hadith",
    arabic: "الْمُؤْمِنُ الْقَوِيُّ خَيْرٌ وَأَحَبُّ إِلَى اللَّهِ مِنَ الْمُؤْمِنِ الضَّعِيفِ",
    translation: "The strong believer is better and more beloved to Allah than the weak believer.",
    reference: "Muslim 2664",
    narrator: "Muslim",
    hadithNumber: "2664",
    tags: ["strength", "faith", "determination"]
  },
  {
    type: "Hadith",
    arabic: "مَنْ لَا يَرْحَمُ لَا يُرْحَمُ",
    translation: "He who does not show mercy will not be shown mercy.",
    reference: "Bukhari 5997",
    narrator: "Bukhari",
    hadithNumber: "5997",
    tags: ["mercy", "compassion", "kindness"]
  },
  {
    type: "Hadith",
    arabic: "الْمُؤْمِنُ لِلْمُؤْمِنِ كَالْبُنْيَانِ يَشُدُّ بَعْضُهُ بَعْضًا",
    translation: "The believer to another believer is like a building whose parts support each other.",
    reference: "Bukhari 481",
    narrator: "Bukhari",
    hadithNumber: "481",
    tags: ["unity", "brotherhood", "support"]
  },
  {
    type: "Hadith",
    arabic: "اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ",
    translation: "Fear Allah wherever you are.",
    reference: "Tirmidhi 1987",
    narrator: "Tirmidhi",
    hadithNumber: "1987",
    tags: ["taqwa", "consciousness", "faith"]
  },
  {
    type: "Hadith",
    arabic: "إِنَّ اللَّهَ طَيِّبٌ لَا يَقْبَلُ إِلَّا طَيِّبًا",
    translation: "Allah is Pure and accepts only that which is pure.",
    reference: "Muslim 1015",
    narrator: "Muslim",
    hadithNumber: "1015",
    tags: ["purity", "halal", "acceptance"]
  },
  {
    type: "Hadith",
    arabic: "مَا نَقَصَتْ صَدَقَةٌ مِنْ مَالٍ",
    translation: "Charity does not decrease wealth.",
    reference: "Tirmidhi 2029",
    narrator: "Tirmidhi",
    hadithNumber: "2029",
    tags: ["charity", "wealth", "blessing"]
  },
  {
    type: "Hadith",
    arabic: "الْكَلِمَةُ الطَّيِّبَةُ صَدَقَةٌ",
    translation: "A good word is charity.",
    reference: "Bukhari 2989",
    narrator: "Bukhari",
    hadithNumber: "2989",
    tags: ["speech", "kindness", "charity"]
  },
  {
    type: "Hadith",
    arabic: "إِنَّ اللَّهَ يُحِبُّ الْعَبْدَ التَّقِيَّ الْغَنِيَّ الْخَفِيَّ",
    translation: "Allah loves the servant who is pious, self-sufficient, and unnoticed.",
    reference: "Muslim 2965",
    narrator: "Muslim",
    hadithNumber: "2965",
    tags: ["humility", "piety", "contentment"]
  },
  {
    type: "Hadith",
    arabic: "احْفَظِ اللَّهَ يَحْفَظْكَ",
    translation: "Be mindful of Allah and He will protect you.",
    reference: "Tirmidhi 2516",
    narrator: "Tirmidhi",
    hadithNumber: "2516",
    tags: ["protection", "mindfulness", "faith"]
  },
  {
    type: "Hadith",
    arabic: "مَنْ صَامَ رَمَضَانَ إِيمَانًا وَاحْتِسَابًا غُفِرَ لَهُ مَا تَقَدَّمَ مِنْ ذَنْبِهِ",
    translation: "Whoever fasts Ramadan with faith and seeking reward, his past sins will be forgiven.",
    reference: "Bukhari 38",
    narrator: "Bukhari",
    hadithNumber: "38",
    tags: ["fasting", "ramadan", "forgiveness"]
  },
  {
    type: "Hadith",
    arabic: "مَنْ قَامَ رَمَضَانَ إِيمَانًا وَاحْتِسَابًا غُفِرَ لَهُ مَا تَقَدَّمَ مِنْ ذَنْبِهِ",
    translation: "Whoever stands in prayer during Ramadan with faith and seeking reward, his past sins will be forgiven.",
    reference: "Bukhari 2009",
    narrator: "Bukhari",
    hadithNumber: "2009",
    tags: ["prayer", "ramadan", "forgiveness"]
  },
  {
    type: "Hadith",
    arabic: "لَيْسَ الْغِنَى عَنْ كَثْرَةِ الْعَرَضِ وَلَكِنَّ الْغِنَى غِنَى النَّفْسِ",
    translation: "Richness is not having many possessions, but richness is being content with oneself.",
    reference: "Bukhari 6446",
    narrator: "Bukhari",
    hadithNumber: "6446",
    tags: ["contentment", "wealth", "heart"]
  },
  {
    type: "Hadith",
    arabic: "الْمُؤْمِنُ مِرْآةُ الْمُؤْمِنِ",
    translation: "The believer is a mirror to the believer.",
    reference: "Abu Dawud 4918",
    narrator: "Abu Dawud",
    hadithNumber: "4918",
    tags: ["brotherhood", "advice", "reflection"]
  },
  {
    type: "Hadith",
    arabic: "اغْتَنِمْ خَمْسًا قَبْلَ خَمْسٍ",
    translation: "Take advantage of five before five: your youth before old age, your health before illness, your wealth before poverty, your free time before becoming busy, and your life before death.",
    reference: "Hakim 7846",
    narrator: "Al-Hakim",
    hadithNumber: "7846",
    tags: ["time", "youth", "opportunity"]
  },
  {
    type: "Hadith",
    arabic: "مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ",
    translation: "Whoever takes a path seeking knowledge, Allah will make easy for him a path to Paradise.",
    reference: "Muslim 2699",
    narrator: "Muslim",
    hadithNumber: "2699",
    tags: ["knowledge", "learning", "jannah"]
  },
  {
    type: "Hadith",
    arabic: "الْجَنَّةُ تَحْتَ أَقْدَامِ الْأُمَّهَاتِ",
    translation: "Paradise lies at the feet of mothers.",
    reference: "Nasai 3104",
    narrator: "An-Nasai",
    hadithNumber: "3104",
    tags: ["mother", "parents", "paradise"]
  },
  {
    type: "Hadith",
    arabic: "لَا ضَرَرَ وَلَا ضِرَارَ",
    translation: "There should be neither harm nor reciprocating harm.",
    reference: "Ibn Majah 2340",
    narrator: "Ibn Majah",
    hadithNumber: "2340",
    tags: ["justice", "harm", "ethics"]
  },
  {
    type: "Hadith",
    arabic: "إِنَّ مِنْ أَحَبِّكُمْ إِلَيَّ وَأَقْرَبِكُمْ مِنِّي مَجْلِسًا يَوْمَ الْقِيَامَةِ أَحَاسِنَكُمْ أَخْلَاقًا",
    translation: "The most beloved to me and nearest to me on the Day of Resurrection are those with the best character.",
    reference: "Tirmidhi 2018",
    narrator: "Tirmidhi",
    hadithNumber: "2018",
    tags: ["character", "akhlaq", "day of judgment"]
  },
  {
    type: "Hadith",
    arabic: "إِنَّمَا بُعِثْتُ لِأُتَمِّمَ مَكَارِمَ الْأَخْلَاقِ",
    translation: "I was only sent to perfect good character.",
    reference: "Ahmad 8595",
    narrator: "Ahmad",
    hadithNumber: "8595",
    tags: ["character", "prophet", "morals"]
  },
  {
    type: "Hadith",
    arabic: "الْحَيَاءُ شُعْبَةٌ مِنَ الْإِيمَانِ",
    translation: "Modesty is a branch of faith.",
    reference: "Bukhari 9",
    narrator: "Bukhari",
    hadithNumber: "9",
    tags: ["modesty", "faith", "haya"]
  },
  {
    type: "Hadith",
    arabic: "الظُّلْمُ ظُلُمَاتٌ يَوْمَ الْقِيَامَةِ",
    translation: "Oppression will be darkness on the Day of Judgment.",
    reference: "Bukhari 2447",
    narrator: "Bukhari",
    hadithNumber: "2447",
    tags: ["justice", "oppression", "day of judgment"]
  }
];

async function seedHadiths() {
  try {
    await mongoose.connect(process.env.DB_STRING);
    console.log("Connected to DB...");

    // Drop old indexes if they exist
    try {
      await Reflection.collection.dropIndex("reference_1");
      console.log("Dropped old reference index");
    } catch (err) {
      console.log("No old reference index to drop");
    }

    // Insert hadiths
    await Reflection.insertMany(hadiths);
    console.log("✅ Hadiths Seeded! 📿✨");
    console.log(`Total hadiths seeded: ${hadiths.length}`);

    mongoose.connection.close();
  } catch (err) {
    console.error("❌ Seeding error:", err);
    mongoose.connection.close();
  }
}

seedHadiths();