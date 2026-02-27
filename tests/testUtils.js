import path from "node:path";
import { pathToFileURL } from "node:url";

export function abs(relPath) {
  return path.resolve(process.cwd(), relPath);
}

export function makeSpy(asyncImpl = null) {
  const fn = async (...args) => {
    fn.calls.push(args);
    fn.last = args;
    if (asyncImpl) return asyncImpl(...args);
    return undefined;
  };
  fn.calls = [];
  fn.last = null;
  return fn;
}

export function makeMockGuild({
  guildId = "g1",
  fetchChannel = async () => null,
} = {}) {
  return {
    id: guildId,
    channels: {
      fetch: fetchChannel,
    },
  };
}

export function makeMockInteraction({
  guild = null,
  guildId = "g1",
  userId = "u1",
  hasAdmin = false,
  options = {},
} = {}) {
  const reply = makeSpy();
  const followUp = makeSpy();
  const editReply = makeSpy();

  const interaction = {
    guild: guild ?? makeMockGuild({ guildId }),
    user: { id: userId },
    member: {
      permissions: {
        has: () => hasAdmin,
      },
    },
    options: {
      getString: (name) => options[name] ?? null,
    },
    reply,
    followUp,
    editReply,
  };

  return interaction;
}

export async function importFresh(absoluteFilePath) {
  const url = pathToFileURL(absoluteFilePath).href + `?t=${Date.now()}`;
  return import(url);
}