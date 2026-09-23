/**
 * Fixture connectors shaped like directory calls.
 * fetchClinics is the Korean source. fetchDoctors is keyed by clinic id
 * and is not allowed to search English prose.
 */

export function fetchClinics() {
  return [
    {
      id: "page-banobagi",
      url: "https://map.naver.com/p/entry/place/fixture-banobagi",
      rawName: "바노바기성형외과",
      rawAddress: "서울 강남구 논현로 517",
      phone: "02-522-0000",
      rawBody: "강남 코성형 상담. 김 원장님이 진료합니다.",
    },
    {
      id: "page-id",
      url: "https://map.naver.com/p/entry/place/fixture-id",
      rawName: "아이디병원",
      rawAddress: "서울 강남구 도산대로 142",
      phone: "02-547-0000",
      rawBody: "쌍꺼풀 수술을 김민준 원장이 집도합니다.",
    },
    {
      id: "page-unknown",
      url: "https://cafe.naver.com/fixture/gangnam-beauty",
      rawName: "강남뷰티의원",
      rawAddress: "서울 강남구 신사동 1",
      phone: "02-000-0000",
      rawBody: "리프팅과 피부관리를 합니다.",
    },
  ];
}

const DOCTORS_BY_CLINIC = {
  clinic_banobagi: [
    { id: "surgeon_kim_taehyung", nameKo: "김태형", nameEn: "Kim Tae-hyung", surnameEn: "Kim" },
    { id: "surgeon_kim_seoyeon", nameKo: "김서연", nameEn: "Kim Seo-yeon", surnameEn: "Kim" },
  ],
  clinic_id: [
    { id: "surgeon_kim_minjun", nameKo: "김민준", nameEn: "Kim Min-jun", surnameEn: "Kim" },
  ],
};

export function fetchDoctors(clinicId) {
  return DOCTORS_BY_CLINIC[clinicId] ?? [];
}
