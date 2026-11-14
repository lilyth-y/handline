// 호아 도사 말투 템플릿 (LLM 없이). 근거는 interpret 결과의 유형 / 별점 / reason_texts 만 사용.
export const LUCK_EMOJI = { wealth: '💰', love: '💕', health: '🌿', career: '🏆' };
export const ANALYZE_LINES = [
  '흐음… 수정 구슬을 닦는 중이오',
  '여우 눈으로 손금을 살펴보는 중이오 👀',
  '감정선, 두뇌선, 생명선을 따라가 보는 중…',
  '아홉 꼬리로 운세를 점치는 중이오 🦊',
  '호호, 다 보였소!',
];
export const TYPE_COPY = {
  gold:      { intro: '손바닥에 금빛 기운이 반짝이는구려.', charm: '차곡차곡 쌓는 실속파라 여우 꼬리도 절로 살랑이오.' },
  fire:      { intro: '손에서 뜨거운 불꽃 기운이 일렁이는구려.', charm: '한번 마음먹으면 끝까지 달리는 열정이 그대의 매력이오.' },
  moon:      { intro: '달빛처럼 은은한 감성이 손금에 흐르는구려.', charm: '상상력이 풍부하니 그대 곁엔 늘 이야기가 피어나겠소.' },
  star:      { intro: '별빛처럼 또렷한 지혜가 손에 깃들었구려.', charm: '차분히 따져 보는 분석력, 여우 도사도 감탄하오.' },
  wind:      { intro: '자유로운 바람이 손바닥을 스치는구려.', charm: '새로운 곳, 새로운 일에 겁 없이 뛰어드는 모험가로다.' },
  sun:       { intro: '태양처럼 환한 기운이 손에서 뿜어 나오는구려.', charm: '사람들이 절로 따르는 리더의 자신감이 있소.' },
  cloud:     { intro: '포근한 구름 같은 평화로운 기운이로다.', charm: '주변을 편안하게 감싸 주는 배려심이 그대의 보물이오.' },
  flower:    { intro: '꽃잎이 흩날리듯 매력이 넘치는 손이구려.', charm: '어딜 가도 사랑받는 인기 여우, 꼬리가 살랑살랑하오.' },
  rock:      { intro: '바위처럼 단단한 뚝심이 손금에 새겨졌구려.', charm: '한번 시작하면 끝을 보는 끈기, 누구도 못 당하겠소.' },
  wave:      { intro: '잔잔한 물결처럼 다정한 마음이 흐르는구려.', charm: '남의 마음을 먼저 알아채는 공감 능력이 빛나오.' },
  lightning: { intro: '번쩍! 번개 같은 아이디어가 손에 가득하구려.', charm: '순발력과 재치로 어디서든 반짝이는 그대로다.' },
  galaxy:    { intro: '은하수처럼 고루 반짝이는 행운의 손이구려.', charm: '운이 두루두루 조화로우니 하는 일마다 술술 풀리겠소.' },
};
const CLOSING = {
  5: ['하늘이 내린 복이로다!', '여우 눈이 번쩍 뜨이는구려!'],
  4: ['기운이 아주 든든하구려.', '꼬리가 살랑살랑, 좋은 기운이오.'],
  3: ['차근차근 피어나는 운이오.', '알맞게 고른 기운이로다.'],
  2: ['천천히 피어나는 운이니 조급해 마시게.', '작은 씨앗이 곧 싹을 틔우겠소.'],
  1: ['아직 꽃봉오리이니 기대해 보시게.', '숨은 운이 기다리고 있구려.'],
};
export function readingFor(key, luck) {
  const reason = luck.reason_texts[0];
  const options = CLOSING[luck.stars] || CLOSING[3];
  const closing = options[(reason.length + key.length) % options.length];   // deterministic per result
  return `${reason}! ${closing}`;
}
