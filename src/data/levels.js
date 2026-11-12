/* 五档难度。label 给人看，spec 写进提示词告诉模型该怎么写。 */

export const LEVELS = [
  { id: "A2", label: "入门", tag: "初中 · A1–A2", words: 150,
    spec: "只使用最常见的 1000 个基础词汇，句子简短（8–12 词），全部使用简单时态" },
  { id: "B1", label: "基础", tag: "高中/四级 · B1", words: 200,
    spec: "使用高中及大学四级范围词汇，句式清晰，偶尔使用复合句" },
  { id: "B2", label: "进阶", tag: "六级 · B2", words: 240,
    spec: "使用大学六级范围词汇，包含常见短语动词和从句" },
  { id: "C1", label: "高级", tag: "考研/雅思 · C1", words: 280,
    spec: "使用考研与雅思 7 分水平词汇，句式多样，包含地道搭配与习语" },
  { id: "C2", label: "挑战", tag: "外刊原版 · C2", words: 300,
    spec: "外刊原版水平（The Economist / The Atlantic 风格），词汇高级地道，论证有深度" },
];
