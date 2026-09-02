import "dotenv/config";

import { createDatabase } from "../src/db.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL 환경 변수가 필요합니다.");

const database = createDatabase(databaseUrl);
const lastVerifiedAt = new Date("2026-09-01T00:00:00+09:00");

const restaurants = [
  {
    slug: "munhwaok",
    nameKo: "문화옥",
    nameEn: "Munhwaok",
    area: "을지로4가",
    category: "한식",
    minBudget: 10_000,
    maxBudget: 10_000,
    description: "50년 전통의 설렁탕 전문점으로, 사골과 갈비뼈를 우린 진한 국물을 소개합니다.",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=%EB%AC%B8%ED%99%94%EC%98%A5+%EC%84%9C%EC%9A%B8",
    sourceUrl: "https://english.visitseoul.net/restaurants/Munhwaok1/ENP006072",
  },
  {
    slug: "miseongok",
    nameKo: "미성옥",
    nameEn: "Miseongok",
    area: "명동",
    category: "한식",
    minBudget: 10_000,
    maxBudget: 10_000,
    description: "1966년 문을 연 설렁탕 전문점으로, 소뼈와 소고기로 만든 설렁탕을 소개합니다.",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=%EB%AF%B8%EC%84%B1%EC%98%A5+%EC%84%9C%EC%9A%B8",
    sourceUrl: "https://english.visitseoul.net/attractions--/Miseongok/ENP002876",
  },
  {
    slug: "naerimson-samgyetang-euljiro",
    nameKo: "내림손삼계탕 을지로",
    nameEn: "Naerimson Samgyetang Euljiro",
    area: "을지로입구",
    category: "한식",
    minBudget: 17_000,
    maxBudget: 38_000,
    description: "삼계탕과 닭 요리를 제공하며, 10:00~22:00 운영과 15:00~17:00 브레이크타임이 공식 안내돼 있습니다.",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=%EB%82%B4%EB%A6%BC%EC%86%90%EC%82%BC%EA%B3%84%ED%83%95+%EC%9D%84%EC%A7%80%EB%A1%9C",
    sourceUrl: "https://english.visitseoul.net/walking-tour/Naerim/ENP8q4txd",
  },
] as const;

for (const restaurant of restaurants) {
  await database.restaurant.upsert({
    where: { slug: restaurant.slug },
    create: {
      ...restaurant,
      verificationStatus: "OFFICIAL_SOURCE",
      lastVerifiedAt,
    },
    update: {
      ...restaurant,
      verificationStatus: "OFFICIAL_SOURCE",
      lastVerifiedAt,
      deletedAt: null,
    },
  });
}

await database.$disconnect();
console.log(`SEEDED_RESTAURANTS=${restaurants.length}`);
