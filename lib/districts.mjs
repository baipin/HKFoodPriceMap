// The 18 Hong Kong districts (行政区). Centroids are approximate and used
// only to place map markers / search queries.
export const DISTRICTS = [
  { id: "central-western", zh: "中西区", en: "Central and Western", lat: 22.2830, lng: 114.1550 },
  { id: "wan-chai", zh: "湾仔区", en: "Wan Chai", lat: 22.2770, lng: 114.1730 },
  { id: "eastern", zh: "东区", en: "Eastern", lat: 22.2790, lng: 114.2250 },
  { id: "southern", zh: "南区", en: "Southern", lat: 22.2450, lng: 114.1850 },
  { id: "yau-tsim-mong", zh: "油尖旺区", en: "Yau Tsim Mong", lat: 22.3100, lng: 114.1700 },
  { id: "sham-shui-po", zh: "深水埗区", en: "Sham Shui Po", lat: 22.3300, lng: 114.1600 },
  { id: "kowloon-city", zh: "九龙城区", en: "Kowloon City", lat: 22.3280, lng: 114.1900 },
  { id: "wong-tai-sin", zh: "黄大仙区", en: "Wong Tai Sin", lat: 22.3400, lng: 114.1950 },
  { id: "kwun-tong", zh: "观塘区", en: "Kwun Tong", lat: 22.3130, lng: 114.2250 },
  { id: "kwai-tsing", zh: "葵青区", en: "Kwai Tsing", lat: 22.3560, lng: 114.1290 },
  { id: "tsuen-wan", zh: "荃湾区", en: "Tsuen Wan", lat: 22.3700, lng: 114.1100 },
  { id: "tuen-mun", zh: "屯门区", en: "Tuen Mun", lat: 22.3910, lng: 113.9770 },
  { id: "yuen-long", zh: "元朗区", en: "Yuen Long", lat: 22.4450, lng: 114.0220 },
  { id: "north", zh: "北区", en: "North", lat: 22.4950, lng: 114.1380 },
  { id: "tai-po", zh: "大埔区", en: "Tai Po", lat: 22.4500, lng: 114.1640 },
  { id: "sha-tin", zh: "沙田区", en: "Sha Tin", lat: 22.3870, lng: 114.1950 },
  { id: "sai-kung", zh: "西贡区", en: "Sai Kung", lat: 22.3800, lng: 114.2700 },
  { id: "islands", zh: "离岛区", en: "Islands", lat: 22.2600, lng: 113.9450 },
];

export function getDistrict(id) {
  return DISTRICTS.find((d) => d.id === id) || null;
}
