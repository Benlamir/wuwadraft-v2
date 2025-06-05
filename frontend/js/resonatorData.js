export const SEQUENCE_POINTS = {
  0: 3,  // S0
  1: 5,  // S1
  2: 9,  // S2
  3: 10, // S3
  4: 11, // S4
  5: 12, // S5
  6: 16  // S6
};

const ALL_RESONATORS_DATA = [
  {
    id: "resonator_id_1",
    name: "Jiyan",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_jiyan.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/jiyan.webp",
    rarity: 5,
    isLimited: true,
    element: ["Aero"],
    weapon: "Broadblade",
  },
  {
    id: "resonator_id_2",
    name: "Lingyang",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_ling.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/lingyang.webp",
    rarity: 5,
    isLimited: false,
    element: ["Glacio"],
    weapon: "Gauntlets",
  },
  {
    id: "resonator_id_3",
    name: "Rover",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_rover_spectro.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/rover-aero.webp",
    rarity: 5,
    isLimited: false,
    element: ["Havoc", "Aero", "Spectro"],
    weapon: "Sword",
  },
  {
    id: "resonator_id_4",
    name: "Yangyang",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_yang.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/yangyang.webp",
    rarity: 4,
    isLimited: false,
    element: ["Aero"],
    weapon: "Sword",
  },
  {
    id: "resonator_id_5",
    name: "Chixia",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_chixia.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/chixia.webp",
    rarity: 4,
    isLimited: false,
    element: ["Fusion"],
    weapon: "Pistols",
  },
  {
    id: "resonator_id_6",
    name: "Baizhi",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_baizhi.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/baizhi.webp",
    rarity: 4,
    isLimited: false,
    element: ["Glacio"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_7",
    name: "Sanhua",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_senhua.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/sanhua.webp",
    rarity: 4,
    isLimited: false,
    element: ["Glacio"],
    weapon: "Sword",
  },
  {
    id: "resonator_id_8",
    name: "Yuanwu",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_yuanwu.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/yuanwu.webp",
    rarity: 4,
    isLimited: false,
    element: ["Electro"],
    weapon: "Gauntlets",
  },
  {
    id: "resonator_id_9",
    name: "Aalto",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_aalto.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/aalto.webp",
    rarity: 4,
    isLimited: false,
    element: ["Aero"],
    weapon: "Pistols",
  },
  {
    id: "resonator_id_10",
    name: "Danjin",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_danjin.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/danjin.webp",
    rarity: 4,
    isLimited: false,
    element: ["Havoc"],
    weapon: "Sword",
  },
  {
    id: "resonator_id_11",
    name: "Mortefi",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_mortefi.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/mortefi.webp",
    rarity: 4,
    isLimited: false,
    element: ["Fusion"],
    weapon: "Pistols",
  },
  {
    id: "resonator_id_12",
    name: "Taoqi",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_taoqi.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/taoqi.webp",
    rarity: 4,
    isLimited: false,
    element: ["Havoc"],
    weapon: "Broadblade",
  },
  {
    id: "resonator_id_13",
    name: "Calcharo",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_calch.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/calcharo.webp",
    rarity: 5,
    isLimited: false,
    element: ["Electro"],
    weapon: "Broadblade",
  },
  {
    id: "resonator_id_14",
    name: "Encore",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_encore.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/encore.webp",
    rarity: 5,
    isLimited: false,
    element: ["Fusion"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_15",
    name: "Jianxin",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_jiaxin.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/jianxin.webp",
    rarity: 5,
    isLimited: false,
    element: ["Aero"],
    weapon: "Gauntlets",
  },
  {
    id: "resonator_id_16",
    name: "Verina",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_verina.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/verina.webp",
    rarity: 5,
    isLimited: false,
    element: ["Spectro"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_17",
    name: "Yinlin",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_yinglin.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/yinlin.webp",
    rarity: 5,
    isLimited: true,
    element: ["Electro"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_18",
    name: "Jinhsi",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_jihni.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/jinhsi.webp",
    rarity: 5,
    isLimited: true,
    element: ["Spectro"],
    weapon: "Broadblade",
  },
  {
    id: "resonator_id_19",
    name: "Changli",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_changli.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/changli.webp",
    rarity: 5,
    isLimited: true,
    element: ["Fusion"],
    weapon: "Sword",
  },
  {
    id: "resonator_id_20",
    name: "Zhezhi",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_zhe.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/zhezhi.webp",
    rarity: 5,
    isLimited: true,
    element: ["Glacio"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_21",
    name: "Xiangli Yao",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_xiang.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/xiangli-yao.webp",
    rarity: 5,
    isLimited: true,
    element: ["Electro"],
    weapon: "Gauntlets",
  },
  {
    id: "resonator_id_22",
    name: "The Shorekeeper",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_keeper.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/shorekeeper.webp",
    rarity: 5,
    isLimited: true,
    element: ["Spectro"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_23",
    name: "Youhu",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_youhu.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/youhu.webp",
    rarity: 4,
    element: ["Glacio"],
    weapon: "Gauntlets",
  },
  {
    id: "resonator_id_24",
    name: "Camellya",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_cam.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/camellya.webp",
    rarity: 5,
    isLimited: true,
    element: ["Havoc"],
    weapon: "Sword",
  },
  {
    id: "resonator_id_25",
    name: "Lumi",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_lumi.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/lumi.webp",
    rarity: 4,
    element: ["Electro"],
    weapon: "Broadblade",
  },
  {
    id: "resonator_id_26",
    name: "Carlotta",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_carlotta.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/carlotta.webp",
    rarity: 5,
    isLimited: true,
    element: ["Glacio"],
    weapon: "Pistols",
  },
  {
    id: "resonator_id_27",
    name: "Roccia",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_roccia.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/roccia.webp",
    rarity: 5,
    isLimited: true,
    element: ["Havoc"],
    weapon: "Broadblade",
  },
  {
    id: "resonator_id_28",
    name: "Brant",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_brant.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/brant.webp",
    rarity: 5,
    isLimited: true,
    element: ["Fusion"],
    weapon: "Sword",
  },
  {
    id: "resonator_id_29",
    name: "Cantarella",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_canta.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/cantarella.webp",
    rarity: 5,
    isLimited: true,
    element: ["Havoc"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_30",
    name: "Phoebe",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_phoebe.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/phoebe.webp",
    rarity: 5,
    isLimited: true,
    element: ["Spectro"],
    weapon: "Rectifier",
  },
  {
    id: "resonator_id_31",
    name: "Zani",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_zani.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/zani.webp",
    rarity: 5,
    isLimited: true,
    element: ["Spectro"],
    weapon: "Broadblade",
  },
  {
    id: "resonator_id_32",
    name: "Ciaconna",
    image_button:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/resonators-buttons/button_ciaconna.webp",
    image_pick:
      "https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/portraits/ciaccona.webp",
    rarity: 5,
    isLimited: true,
    element: ["Aero"],
    weapon: "Pistols",
  },
];

export { ALL_RESONATORS_DATA };
