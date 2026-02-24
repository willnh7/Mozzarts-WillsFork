import * as scoreStore from "../scoreStore.js";

export default {
  name: "getScore",
  description: "Get your score",
  async execute(interaction) {
    const userId = interaction.user?.id;
    const score = scoreStore.get?.(userId) ?? 0;
    await interaction.reply?.(`Your score is: ${score}`);
  }
};