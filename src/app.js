import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import loadEvents from "./helpers/loadEvents.js";
import loadCommands from "./helpers/loadCommands.js";

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

const { Guilds, GuildMembers, GuildMessages, MessageContent, GuildVoiceStates } =
  GatewayIntentBits;
const { User, Message, GuildMember, ThreadMember } = Partials;

const client = new Client({
  intents: [
    Guilds,
    GuildMembers,
    GuildMessages,
    MessageContent,
    GuildVoiceStates,
  ],
  partials: [User, Message, GuildMember, ThreadMember],
});

client.events = new Collection();
client.commands = new Collection();

loadEvents(client, path.join(__dirname, "events"));
loadCommands(client, path.join(__dirname, "commands"));

client.login(TOKEN);
