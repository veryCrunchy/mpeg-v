import type { DiscordSDK } from "@discord/embedded-app-sdk";
export function useDiscordWorkspace() {
  const config = useRuntimeConfig();
  const guildId = ref("");
  const connected = ref(false),
    connecting = ref(false),
    sharing = ref(false);
  let sdk: DiscordSDK | undefined;
  let accessToken = "";
  let disposed = false;
  const requests = new AbortController();
  let preparation: Promise<void> | undefined;
  async function prepare() {
    if (preparation) return preparation;
    preparation = (async () => {
      if (!config.public.discordClientId) {
        throw new Error(
          "Discord sharing is unavailable. You can still convert and download files.",
        );
      }
      if (!sdk) {
        const { DiscordSDK } = await import("@discord/embedded-app-sdk");
        if (disposed) throw new Error("Workspace closed.");
        sdk = new DiscordSDK(config.public.discordClientId);
        guildId.value = sdk.guildId ?? "";
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          sdk.ready(),
          new Promise((_, reject) => {
            timer = setTimeout(() =>
              reject(
                new Error(
                  "Open the toolbox from Discord's App Launcher to connect.",
                ),
              ), 12_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    })();
    try {
      await preparation;
    } catch (error) {
      sdk?.close(1000, "Connection failed");
      sdk = undefined;
      preparation = undefined;
      throw error;
    }
  }
  async function check(response: Response) {
    if (response.ok) return response.json();
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.statusMessage ||
        body.error ||
        "Discord could not complete this request.",
    );
  }
  async function connect() {
    if (connecting.value || disposed) return;
    connecting.value = true;
    try {
      await prepare();
      if (disposed) return;
      const { code } = await sdk!.commands.authorize({
        client_id: config.public.discordClientId,
        response_type: "code",
        prompt: "none",
        state: crypto.randomUUID(),
        scope: ["identify", "guilds"],
      });
      const result = await check(
        await fetch("/api/discord/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
          signal: AbortSignal.any([
            requests.signal,
            AbortSignal.timeout(15_000),
          ]),
        }),
      );
      if (disposed) return;
      await sdk!.commands.authenticate({ access_token: result.access_token });
      if (disposed) return;
      accessToken = result.access_token;
      connected.value = true;
    } finally {
      connecting.value = false;
    }
  }
  async function share(blob: Blob) {
    if (!sdk || !connected.value) {
      throw new Error("Connect to Discord to share this file.");
    }
    sharing.value = true;
    try {
      const response = await fetch("/api/discord/share", {
        method: "POST",
        body: blob,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": blob.type,
        },
        signal: AbortSignal.any([requests.signal, AbortSignal.timeout(60_000)]),
      });
      if (response.status === 401) {
        accessToken = "";
        connected.value = false;
      }
      const { url } = await check(response);
      if (disposed) return;
      await sdk.commands.openShareMomentDialog({ mediaUrl: url });
    } finally {
      sharing.value = false;
    }
  }
  async function preferences(method = "GET", body?: unknown) {
    if (!connected.value || disposed) {
      throw new Error("Connect to Discord to save preferences.");
    }
    const response = await fetch(
      `/api/preferences${
        guildId.value ? `?guildId=${encodeURIComponent(guildId.value)}` : ""
      }`,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([requests.signal, AbortSignal.timeout(20_000)]),
      },
    );
    if (response.status === 401) {
      accessToken = "";
      connected.value = false;
    }
    return check(response);
  }
  onBeforeUnmount(() => {
    disposed = true;
    requests.abort();
    accessToken = "";
    connected.value = false;
    sdk?.close(1000, "Workspace closed");
  });
  return {
    connected,
    connecting,
    sharing,
    connect,
    share,
    prepare,
    guildId,
    preferences,
  };
}
