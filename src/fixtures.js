/**
 * Synthetic Korean reviews. Not real patients. Two of them are the same
 * story posted on two sources, which is the syndication case.
 */

export const REVIEWS = [
  {
    id: "r1",
    source: {
      platform: "naver_cafe",
      url: "https://cafe.naver.com/plasticsurgery/1001",
      language: "ko",
      retrievedAt: "2026-09-01T00:00:00Z",
    },
    originalText:
      "2024년 3월 바노바기성형외과에서 김태형 원장님께 코성형을 받았습니다. 비용은 450만원이었고 회복은 2주 정도 걸렸습니다. 결과는 만족합니다.",
  },
  {
    id: "r2",
    source: {
      platform: "clinic_blog",
      url: "https://blog.example.kr/banobagi/rhino-repost",
      language: "ko",
      retrievedAt: "2026-09-02T00:00:00Z",
    },
    originalText:
      "2024년 3월 바노바기성형외과에서 김태형 원장님께 코성형을 받았습니다. 비용은 450만원이었고 회복은 2주 정도 걸렸습니다. 결과는 만족합니다.",
  },
  {
    id: "r3",
    source: {
      platform: "daum_cafe",
      url: "https://cafe.daum.net/beauty/2002",
      language: "ko",
      retrievedAt: "2026-09-03T00:00:00Z",
    },
    originalText: "아이디병원에서 쌍꺼풀 수술을 김민준 원장님께 받았습니다. 붓기는 5일 정도였습니다.",
  },
  {
    id: "r4",
    source: {
      platform: "naver_cafe",
      url: "https://cafe.naver.com/plasticsurgery/1004",
      language: "ko",
      retrievedAt: "2026-09-04T00:00:00Z",
    },
    originalText: "바노바기에서 코성형을 했습니다. 김 원장님이 집도했습니다. 가격은 500만원.",
  },
];
